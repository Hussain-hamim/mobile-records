package expo.modules.recordocr

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapRegionDecoder
import android.graphics.Rect
import android.graphics.Matrix
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.net.Uri
import com.googlecode.tesseract.android.TessBaseAPI
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.UUID
import kotlin.math.hypot
import kotlin.math.roundToInt

class RecordOcrModule : Module() {
  private val recognitionLock = Any()

  // Recognition uses packaged printed-text and MRZ models. No services, downloads, images
  // outside private cache, or diagnostic text logs.
  private fun <T> withRecognizer(uri: String, language: String, work: (TessBaseAPI, File) -> T): T = synchronized(recognitionLock) {
    val context = appContext.reactContext ?: throw IllegalStateException("No context")
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file") { "Only private cache images are supported" }
    val image = File(parsed.path ?: throw IllegalArgumentException("Invalid image"))
    require(image.canonicalPath.startsWith(context.cacheDir.canonicalPath + "/")) { "Only private cache images are supported" }
    val root = File(context.noBackupFilesDir, "ocr")
    val data = File(root, "tessdata").apply { mkdirs() }
    val installedLanguage = language.split("+").joinToString("+") { model ->
      val installed = if (model == "mrz") "mrz-v1" else model
      val target = File(data, "$installed.traineddata")
      if (!target.exists()) {
        val temp = File(data, "$installed.tmp")
        try {
          context.assets.open("tessdata/$model.traineddata").use { input -> temp.outputStream().use { input.copyTo(it) } }
          check(temp.renameTo(target)) { "Could not install recognition model" }
        } finally { temp.delete() }
      }
      installed
    }
    val tess = TessBaseAPI()
    try {
      check(tess.init(root.absolutePath, installedLanguage)) { "Recognition initialization failed" }
      work(tess, image)
    } finally { tess.recycle() }
  }

  private fun loadRegion(image: File, region: List<Double>, maxDimension: Int = 2800): Bitmap {
    require(region.size == 4 && region.all { it.isFinite() && it in 0.0..1.0 }) { "Invalid region" }
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(image.absolutePath, bounds)
    require(bounds.outWidth >= 30 && bounds.outHeight >= 15) { "Invalid image" }
    val left = (region[0] * bounds.outWidth).toInt().coerceIn(0, bounds.outWidth - 1)
    val top = (region[1] * bounds.outHeight).toInt().coerceIn(0, bounds.outHeight - 1)
    val right = ((region[0] + region[2]) * bounds.outWidth).toInt().coerceIn(left + 1, bounds.outWidth)
    val bottom = ((region[1] + region[3]) * bounds.outHeight).toInt().coerceIn(top + 1, bounds.outHeight)
    val crop = Rect(left, top, right, bottom)
    var sample = 1
    // Crop BEFORE downsampling: distant MRZ characters must retain their pixels.
    while (maxOf(crop.width(), crop.height()) / sample > maxDimension) sample *= 2
    @Suppress("DEPRECATION")
    val decoder = BitmapRegionDecoder.newInstance(image.absolutePath, false)
      ?: throw IllegalArgumentException("Invalid image")
    try {
      return decoder.decodeRegion(crop, BitmapFactory.Options().apply {
        inSampleSize = sample
        inPreferredConfig = Bitmap.Config.ARGB_8888
      }) ?: throw IllegalArgumentException("Invalid image")
    } finally { decoder.recycle() }
  }

  private fun straighten(bitmap: Bitmap): Bitmap {
    val width = minOf(900, bitmap.width)
    val small = Bitmap.createScaledBitmap(bitmap, width, maxOf(1, bitmap.height * width / bitmap.width), true)
    val pixels = IntArray(small.width * small.height)
    small.getPixels(pixels, 0, small.width, 0, 0, small.width, small.height)
    val gray = ByteArray(pixels.size) { i ->
      val p = pixels[i]
      ((Color.red(p) * 299 + Color.green(p) * 587 + Color.blue(p) * 114) / 1000).toByte()
    }
    val angle = MrzDeskew.angle(gray, small.width, small.height)
    if (small !== bitmap) small.recycle()
    val rotated = if (angle == 0.0) bitmap else Bitmap.createBitmap(
      bitmap, 0, 0, bitmap.width, bitmap.height,
      Matrix().apply { postRotate((-angle).toFloat()) }, true
    )
    // White padding prevents dark rotation corners from becoming OCR characters.
    val padded = Bitmap.createBitmap(rotated.width + 24, rotated.height + 24, Bitmap.Config.ARGB_8888)
    Canvas(padded).apply {
      drawColor(Color.WHITE)
      drawBitmap(rotated, 12f, 12f, Paint(Paint.FILTER_BITMAP_FLAG))
    }
    if (rotated !== bitmap) rotated.recycle()
    return padded
  }

  override fun definition() = ModuleDefinition {
    Name("RecordOcr")
    AsyncFunction("rectifyCard") { uri: String, points: List<List<Double>> ->
      require(points.size == 4 && points.all { p -> p.size == 2 && p.all { it.isFinite() && it in 0.0..1.0 } }) { "invalidCardCorners" }
      var area = 0.0
      for (i in 0..3) {
        val a=points[i]; val b=points[(i+1)%4]; val c=points[(i+2)%4]
        require((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]) > 0.002) { "invalidCardCorners" }
        area += a[0]*b[1]-b[0]*a[1]
      }
      require(area / 2 >= 0.03) { "invalidCardCorners" }
      val context = appContext.reactContext ?: throw IllegalStateException("No context")
      val parsed = Uri.parse(uri)
      val file = File(parsed.path ?: "")
      require(parsed.scheme == "file" && file.canonicalPath.startsWith(context.cacheDir.canonicalPath + "/")) { "Invalid image" }
      val bitmap = loadRegion(file, listOf(0.0,0.0,1.0,1.0), 4200)
      try {
        val src = points.flatMap { listOf((it[0]*bitmap.width).toFloat(),(it[1]*bitmap.height).toFloat()) }.toFloatArray()
        fun distance(a: Int,b: Int) = hypot((src[a*2]-src[b*2]).toDouble(),(src[a*2+1]-src[b*2+1]).toDouble())
        val width = maxOf(distance(0,1),distance(3,2)).roundToInt().coerceAtLeast(30)
        val height = maxOf(distance(0,3),distance(1,2)).roundToInt().coerceAtLeast(30)
        val matrix = Matrix()
        check(matrix.setPolyToPoly(src,0,floatArrayOf(0f,0f,width.toFloat(),0f,width.toFloat(),height.toFloat(),0f,height.toFloat()),0,4)) { "invalidCardCorners" }
        val output = Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888)
        val folder = File(context.cacheDir,"record-scans").apply { mkdirs() }
        val target = File(folder,UUID.randomUUID().toString()+".jpg")
        try {
          Canvas(output).apply { drawColor(Color.WHITE); drawBitmap(bitmap,matrix,Paint(Paint.FILTER_BITMAP_FLAG)) }
          target.outputStream().use { check(output.compress(Bitmap.CompressFormat.JPEG,100,it)) }
          mapOf("uri" to Uri.fromFile(target).toString(),"width" to width,"height" to height)
        } catch (e: Exception) { target.delete(); throw e }
        finally { output.recycle() }
      } finally { bitmap.recycle() }
    }
    AsyncFunction("readPrintedPass") { uri: String, language: String, pass: Int ->
      require(pass in 0..2)
      val models = when(language) { "ps" -> "pus+fas+eng"; "fa" -> "fas+pus+eng"; else -> "eng+fas+pus" }
      withRecognizer(uri,models) { tess,image ->
        tess.setPageSegMode(if(pass==2) TessBaseAPI.PageSegMode.PSM_SPARSE_TEXT else TessBaseAPI.PageSegMode.PSM_AUTO)
        if(pass==1) tess.setVariable("thresholding_method","2")
        val bitmap=loadRegion(image,listOf(0.0,0.0,1.0,1.0))
        var prepared: Bitmap?=null
        try {
          prepared=if(pass==1) straighten(bitmap) else bitmap
          tess.setImage(prepared)
          val text=tess.getUTF8Text() ?: ""
          val words=mutableListOf<Map<String,Any>>()
          val iterator=tess.resultIterator
          if(iterator != null) {
            try {
              iterator.begin()
              var line=0
              do {
                if(iterator.isAtBeginningOf(TessBaseAPI.PageIteratorLevel.RIL_TEXTLINE)) line++
                val word=iterator.getUTF8Text(TessBaseAPI.PageIteratorLevel.RIL_WORD) ?: ""
                if(word.isNotBlank()) words.add(mapOf(
                  "text" to word.trim(), "confidence" to iterator.confidence(TessBaseAPI.PageIteratorLevel.RIL_WORD),
                  "box" to iterator.getBoundingBox(TessBaseAPI.PageIteratorLevel.RIL_WORD).toList(), "line" to line
                ))
              } while(iterator.next(TessBaseAPI.PageIteratorLevel.RIL_WORD))
            } finally { iterator.delete() }
          }
          mapOf("text" to text,"words" to words,"width" to prepared.width,"height" to prepared.height)
        } finally {
          if(prepared !== bitmap) prepared?.recycle()
          bitmap.recycle()
        }
      }
    }
    AsyncFunction("readPrintedId") { uri: String, language: String ->
      val models = when (language) {
        "ps" -> "pus+fas+eng"
        "fa" -> "fas+pus+eng"
        else -> "eng+fas+pus"
      }
      withRecognizer(uri, models) { tess, image ->
        tess.setPageSegMode(TessBaseAPI.PageSegMode.PSM_AUTO)
        val bitmap = loadRegion(image, listOf(0.0, 0.0, 1.0, 1.0))
        try {
          tess.setImage(bitmap)
          mapOf("text" to (tess.getUTF8Text() ?: ""), "confidence" to tess.meanConfidence())
        } finally { bitmap.recycle() }
      }
    }
    AsyncFunction("recognize") { uri: String, mode: String ->
      require(mode == "imei") { "Use MRZ reading for electronic IDs" }
      withRecognizer(uri, "eng") { tess, image ->
        tess.setPageSegMode(TessBaseAPI.PageSegMode.PSM_AUTO)
        tess.setImage(image)
        mapOf("text" to (tess.getUTF8Text() ?: ""), "confidence" to tess.meanConfidence())
      }
    }
    // One pass per call lets JS stop immediately after a checksum-valid result.
    AsyncFunction("readMrzPass") { uri: String, pass: Int, region: List<Double> ->
      require(pass in 0..2) { "Invalid recognition pass" }
      withRecognizer(uri, "mrz") { tess, image ->
        check(tess.setVariable("tessedit_char_whitelist", "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<"))
        if (pass == 1) tess.setVariable("thresholding_method", "2") // Sauvola, Tesseract 5
        tess.setPageSegMode(if (pass == 2) TessBaseAPI.PageSegMode.PSM_AUTO else TessBaseAPI.PageSegMode.PSM_SINGLE_BLOCK)
        val bitmap = loadRegion(image, region)
        var prepared: Bitmap? = null
        try {
          prepared = if (pass == 1) straighten(bitmap) else bitmap
          tess.setImage(prepared)
          val text = tess.getUTF8Text() ?: ""
          tess.clear()
          text
        } finally {
          if (prepared !== bitmap) prepared?.recycle()
          bitmap.recycle()
        }
      }
    }
  }
}
