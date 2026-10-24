package app.lamplight.engine.pdf

import org.apache.pdfbox.pdmodel.PDDocument
import org.json.JSONObject
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import java.io.File

/** Dumps the extraction of every PDF in -Dlamplight.pdfs=<dir> to build/pdf-out (for the app-side tests). */
class PdfDump {
    @Test
    fun dump() {
        val dir = System.getProperty("lamplight.pdfs")?.let(::File)
        assumeTrue(dir != null && dir.isDirectory)
        val out = File("build/pdf-out").apply { mkdirs() }
        for (f in dir!!.listFiles { x -> x.extension == "pdf" }!!.sorted()) {
            val t0 = System.nanoTime()
            PDDocument.load(f).use { d ->
                val pages = PdfLines.pages(d, 1, d.numberOfPages)
                val json = JSONObject().put("pages", pages).put("outline", PdfLines.outline(d)).put("title", JSONObject.NULL).put("author", JSONObject.NULL)
                File(out, f.nameWithoutExtension + ".json").writeText(json.toString())
                var chars = 0
                for (i in 0 until pages.length()) {
                    val lines = pages.getJSONObject(i).getJSONArray("lines")
                    for (k in 0 until lines.length()) chars += lines.getJSONObject(k).getString("text").length
                }
                println("${f.name}: ${d.numberOfPages} pages, extracted ${pages.length()}, $chars chars, ${(System.nanoTime() - t0) / 1_000_000} ms")
            }
        }
    }
}
