package expo.modules.recordocr

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import com.googlecode.tesseract.android.TessBaseAPI
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class RecordOcrModule : Module() {
  private val recognitionLock = Any()

  // Both readers use the packaged Latin model. No services, downloads, images
  // outside private cache, or diagnostic text logs.
  private fun <T> withRecognizer(uri: String, work: (TessBaseAPI, File) -> T): T = synchronized(recognitionLock) {
    val context = appContext.reactContext ?: throw IllegalStateException("No context")
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file") { "Only private cache images are supported" }
    val image = File(parsed.path ?: throw IllegalArgumentException("Invalid image"))
    require(image.canonicalPath.startsWith(context.cacheDir.canonicalPath + "/")) { "Only private cache images are supported" }
    val root = File(context.noBackupFilesDir, "ocr")
    val data = File(root, "tessdata").apply { mkdirs() }
    val target = File(data, "eng.traineddata")
    if (!target.exists()) {
      val temp = File(data, "eng.tmp")
      try {
        context.assets.open("tessdata/eng.traineddata").use { input -> temp.outputStream().use { input.copyTo(it) } }
        check(temp.renameTo(target)) { "Could not install recognition model" }
      } finally { temp.delete() }
    }
    for (language in listOf("pus", "fas")) File(data, "$language.traineddata").delete()
    val tess = TessBaseAPI()
    try {
      check(tess.init(root.absolutePath, "eng")) { "Recognition initialization failed" }
      work(tess, image)
    } finally { tess.recycle() }
  }

  private fun loadBoundedImage(image: File): Bitmap {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(image.absolutePath, bounds)
    require(bounds.outWidth > 0 && bounds.outHeight > 0) { "Invalid image" }
    var sample = 1
    while (maxOf(bounds.outWidth, bounds.outHeight) / sample > 2800) sample *= 2
    return BitmapFactory.decodeFile(image.absolutePath, BitmapFactory.Options().apply {
      inSampleSize = sample
      inPreferredConfig = Bitmap.Config.ARGB_8888
    }) ?: throw IllegalArgumentException("Invalid image")
  }

  override fun definition() = ModuleDefinition {
    Name("RecordOcr")
    AsyncFunction("recognize") { uri: String, mode: String ->
      require(mode == "imei") { "Use MRZ reading for electronic IDs" }
      withRecognizer(uri) { tess, image ->
        tess.setPageSegMode(TessBaseAPI.PageSegMode.PSM_AUTO)
        tess.setImage(image)
        mapOf("text" to (tess.getUTF8Text() ?: ""), "confidence" to tess.meanConfidence())
      }
    }
    AsyncFunction("readMrz") { uri: String ->
      withRecognizer(uri) { tess, image ->
        check(tess.setVariable("tessedit_char_whitelist", "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<"))
        val bitmap = loadBoundedImage(image)
        try {
          val candidates = mutableListOf<String>()
          tess.setPageSegMode(TessBaseAPI.PageSegMode.PSM_AUTO)
          tess.setImage(bitmap)
          candidates.add(tess.getUTF8Text() ?: "")
          tess.clear()
          // The bottom crop helps full-back photos. It exists only in memory.
          val top = (bitmap.height * 0.55).toInt()
          val bottom = Bitmap.createBitmap(bitmap, 0, top, bitmap.width, bitmap.height - top)
          try {
            tess.setPageSegMode(TessBaseAPI.PageSegMode.PSM_SINGLE_BLOCK)
            tess.setImage(bottom)
            candidates.add(tess.getUTF8Text() ?: "")
            tess.clear()
          } finally { bottom.recycle() }
          // Also support close-ups containing just the three MRZ lines.
          tess.setImage(bitmap)
          candidates.add(tess.getUTF8Text() ?: "")
          tess.clear()
          candidates.distinct()
        } finally { bitmap.recycle() }
      }
    }
  }
}
