package app.lamplight.engine.pdf

import com.tom_roush.pdfbox.contentstream.operator.markedcontent.BeginMarkedContentSequence
import com.tom_roush.pdfbox.contentstream.operator.markedcontent.BeginMarkedContentSequenceWithProperties
import com.tom_roush.pdfbox.contentstream.operator.markedcontent.EndMarkedContentSequence
import com.tom_roush.pdfbox.cos.COSDictionary
import com.tom_roush.pdfbox.cos.COSName
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.PDPage
import com.tom_roush.pdfbox.pdmodel.interactive.documentnavigation.outline.PDOutlineNode
import com.tom_roush.pdfbox.text.PDFTextStripper
import com.tom_roush.pdfbox.text.TextPosition
import org.json.JSONArray
import org.json.JSONObject

/**
 * Text lines with their positions, page by page, plus the outline (bookmarks). Layout analysis (headers,
 * footers, paragraphs, hyphenation) happens in packages/core (buildPdfDocument). Plain PDFBox, no Android:
 * engine-core-jvm compiles this file against Apache PDFBox to test it on real PDFs.
 */
object PdfLines {
    /** Pages [from]..[to] (1-based, inclusive) as `{width, height, lines: [{text, x, y, width, size}]}`. */
    fun pages(doc: PDDocument, from: Int, to: Int): JSONArray {
        val pages = JSONArray()
        val stripper = LineStripper(pages)
        stripper.sortByPosition = false
        stripper.startPage = from
        stripper.endPage = to
        stripper.getText(doc)
        return pages
    }

    fun outline(doc: PDDocument): JSONArray {
        val out = JSONArray()
        doc.documentCatalog.documentOutline?.let { walkOutline(doc, it, 0, out) }
        return out
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

    /**
     * Collects one JSON object per visual line: text, x, y (from the top), width and font size.
     *
     * Complex scripts (Devanagari, Bengali, Tamil…) are shaped before they reach the PDF: one glyph can stand
     * for several characters, and a vowel sign drawn before its consonant is stored in visual order. Writers
     * (Chrome, LibreOffice, Word) put the real text in an `/ActualText` span around such clusters; PDFBox's
     * stripper ignores marked content, which turned "ईदगाह" into "इ \u0000दगाह". The glyphs of each ActualText
     * span are replaced here by one position that carries the span's text and covers its width.
     */
    private class LineStripper(private val pages: JSONArray) : PDFTextStripper() {
        init {
            addOperator(BeginMarkedContentSequence())
            addOperator(BeginMarkedContentSequenceWithProperties())
            addOperator(EndMarkedContentSequence())
        }

        /** Open marked-content sequences; [actual] is set on the outermost one that has ActualText. */
        private class Marked(val actual: String?) {
            val glyphs = ArrayList<TextPosition>()
        }
        private val marked = ArrayList<Marked>()

        override fun beginMarkedContentSequence(tag: COSName?, properties: COSDictionary?) {
            val inActual = marked.any { it.actual != null }
            marked.add(Marked(if (inActual) null else properties?.getString(ACTUAL_TEXT)))
            super.beginMarkedContentSequence(tag, properties)
        }

        override fun endMarkedContentSequence() {
            val m = marked.removeLastOrNull()
            if (m?.actual != null && m.actual.isNotEmpty() && m.glyphs.isNotEmpty()) super.processTextPosition(merged(m))
            super.endMarkedContentSequence()
        }

        override fun processTextPosition(text: TextPosition) {
            val open = marked.firstOrNull { it.actual != null }
            if (open != null) open.glyphs.add(text) else super.processTextPosition(text)
        }

        /** One position for a whole ActualText span: from its leftmost glyph to its rightmost edge. */
        private fun merged(m: Marked): TextPosition {
            val first = m.glyphs.minBy { it.xDirAdj }
            val last = m.glyphs.maxBy { it.xDirAdj + it.widthDirAdj }
            return TextPosition(
                first.rotation, first.pageWidth, first.pageHeight, first.textMatrix,
                last.endX, last.endY, m.glyphs.maxOf { it.height }, last.endX - first.textMatrix.translateX,
                first.widthOfSpace, m.actual, first.characterCodes, first.font, first.fontSize, first.fontSizeInPt.toInt(),
            )
        }

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
            // Glyphs with no Unicode mapping come out as NUL or other control characters.
            val t = text.toString().replace(CONTROL, "").trim()
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

    private val ACTUAL_TEXT: COSName = COSName.getPDFName("ActualText")
    private val CONTROL = Regex("[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]")
}
