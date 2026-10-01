package expo.modules.recordocr

import android.net.Uri
import com.googlecode.tesseract.android.TessBaseAPI
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class RecordOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RecordOcr")
    AsyncFunction("recognize") { uri: String, mode: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("No context")
      val image = File(Uri.parse(uri).path ?: throw IllegalArgumentException("Invalid image"))
      require(image.canonicalPath.startsWith(context.cacheDir.canonicalPath + "/")) { "Only private cache images are supported" }
      val root = File(context.noBackupFilesDir, "ocr")
      val data = File(root, "tessdata").apply { mkdirs() }
      val languages = if (mode == "imei") listOf("eng") else listOf("eng", "pus", "fas")
      for (language in languages) {
        val target = File(data, "$language.traineddata")
        if (!target.exists()) {
          val temp = File(data, "$language.tmp")
          context.assets.open("tessdata/$language.traineddata").use { input -> temp.outputStream().use { input.copyTo(it) } }
          check(temp.renameTo(target)) { "Could not install OCR model" }
        }
      }
      val tess = TessBaseAPI()
      try {
        check(tess.init(root.absolutePath, languages.joinToString("+"))) { "OCR initialization failed" }
        tess.setPageSegMode(TessBaseAPI.PageSegMode.PSM_AUTO)
        tess.setImage(image)
        mapOf("text" to (tess.getUTF8Text() ?: ""), "confidence" to tess.meanConfidence())
      } finally { tess.recycle() }
    }
  }
}
