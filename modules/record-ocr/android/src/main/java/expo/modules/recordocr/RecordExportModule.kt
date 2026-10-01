package expo.modules.recordocr

import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.ParcelFileDescriptor
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import kotlin.math.roundToInt

class RecordExportModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RecordExport")
    AsyncFunction("renderPdf") { uri: String, directoryUri: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("No context")
      val source = File(Uri.parse(uri).path ?: error("Invalid PDF"))
      val directory = File(Uri.parse(directoryUri).path ?: error("Invalid directory"))
      require(source.canonicalPath.startsWith(context.cacheDir.canonicalPath + "/"))
      require(directory.canonicalPath.startsWith(File(context.cacheDir, "form-exports").canonicalPath + "/"))
      check(directory.isDirectory)
      val paths = mutableListOf<String>()
      ParcelFileDescriptor.open(source, ParcelFileDescriptor.MODE_READ_ONLY).use { descriptor ->
        PdfRenderer(descriptor).use { renderer ->
          require(renderer.pageCount in 1..100) { "Invalid page count" }
          for (index in 0 until renderer.pageCount) {
            renderer.openPage(index).use { page ->
              // 200 dpi for A4. Render one page at a time to bound memory use.
              val width = (page.width * 200.0 / 72.0).roundToInt()
              val height = (page.height * 200.0 / 72.0).roundToInt()
              require(width > 0 && height > 0 && width.toLong() * height <= 16000000)
              val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
              try {
                bitmap.eraseColor(Color.WHITE)
                page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
                val output = File(directory, "page-${index + 1}.png")
                output.outputStream().use { check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, it)) }
                paths.add(Uri.fromFile(output).toString())
              } finally { bitmap.recycle() }
            }
          }
        }
      }
      paths
    }
  }
}
