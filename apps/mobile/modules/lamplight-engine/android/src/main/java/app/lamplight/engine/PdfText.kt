package app.lamplight.engine

import android.content.Context
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException
import com.tom_roush.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineNode
import com.tom_roush.pdfbox.text.PDFTextStripper
import com.tom_roush.pdfbox.text.TextPosition
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Extracts text lines with their positions from a PDF, page by page, plus the outline (bookmarks). Layout
 * analysis — headers, footers, paragraphs, hyphenation — happens in packages/core (buildPdfDocument).
 */
object PdfText {
    class PdfError(val code: String, message: String) : Exception(message)

    @Volatile private var initialised = false

    fun extract(context: Context, path: String, password: String?): String {
        if (!initialised) {
            PDFBoxResourceLoader.init(context.applicationContext)
            initialised = true
        }
        val doc = try {
            PDDocument.load(File(path), password ?: "")
        } catch (e: InvalidPasswordException) {
            throw PdfError("password", "This PDF needs a password")
        } catch (e: Exception) {
            throw PdfError("corrupt", e.message ?: "Unreadable PDF")
        }
        doc.use { d ->
            val pages = JSONArray()
            val stripper = LineStripper(pages)
            stripper.sortByPosition = false
            stripper.startPage = 1
            stripper.endPage = d.numberOfPages
            stripper.getText(d)
            val outline = JSONArray()
            d.documentCatalog.documentOutline?.let { walkOutline(d, it, 0, outline) }
            val info = d.documentInformation
            return JSONObject()
                .put("pages", pages)
                .put("outline", outline)
                .put("title", info?.title ?: JSONObject.NULL)
                .put("author", info?.author ?: JSONObject.NULL)
                .toString()
        }
    }

    private fun walkOutline(doc: PDDocument, node: PDOutlineNode, level: Int, out: JSONArray) {
        var item = node.firstChild
        var guard = 0
        while (item != null && guard++ < 10_000) {
            val page = runCatching { item.findDestinationPage(doc) }.getOrNull()
            val index = page?.let { doc.pages.indexOf(it) } ?: -1
            if (index >= 0 && !item.title.isNullOrBlank()) {
                out.put(JSONObject().put("title", item.title.trim()).put("page", index + 1).put("level", level))
            }
            walkOutline(doc, item, level + 1, out)
            item = item.nextSibling
        }
    }

    /** Collects one JSON object per visual line: text, x, y (from the top), width and font size. */
    private class LineStripper(private val pages: JSONArray) : PDFTextStripper() {
        private var lines = JSONArray()
        private var text = StringBuilder()
        private var x = Float.NaN
        private var y = 0f
        private var right = 0f
        private var size = 0f
        private var pageWidth = 0f
        private var pageHeight = 0f

        override fun startPage(page: PDPage) {
            super.startPage(page)
            lines = JSONArray()
            val box = page.cropBox ?: page.mediaBox
            pageWidth = box.width
            pageHeight = box.height
        }

        override fun writeString(string: String, textPositions: MutableList<TextPosition>) {
            if (textPositions.isEmpty()) return
            val first = textPositions.first()
            val last = textPositions.last()
            if (x.isNaN()) {
                x = first.xDirAdj
                y = first.yDirAdj
            } else if (text.isNotEmpty()) {
                text.append(' ')
            }
            text.append(string)
            right = last.xDirAdj + last.widthDirAdj
            size = maxOf(size, textPositions.maxOf { it.fontSizeInPt.takeIf { s -> s > 0 } ?: it.heightDir })
        }

        override fun writeLineSeparator() {
            flushLine()
        }

        override fun endPage(page: PDPage) {
            flushLine()
            pages.put(JSONObject().put("width", pageWidth.toDouble()).put("height", pageHeight.toDouble()).put("lines", lines))
            super.endPage(page)
        }

        private fun flushLine() {
            val t = text.toString().trim()
            if (t.isNotEmpty() && !x.isNaN()) {
                lines.put(
                    JSONObject()
                        .put("text", t)
                        .put("x", x.toDouble())
                        .put("y", y.toDouble())
                        .put("width", (right - x).toDouble())
                        .put("size", size.toDouble()),
                )
            }
            text = StringBuilder()
            x = Float.NaN
            size = 0f
        }
    }
}
