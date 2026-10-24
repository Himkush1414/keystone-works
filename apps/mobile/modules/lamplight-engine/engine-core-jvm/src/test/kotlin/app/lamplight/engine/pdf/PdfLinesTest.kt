package app.lamplight.engine.pdf

import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.pdmodel.PDPage
import org.apache.pdfbox.pdmodel.PDPageContentStream
import org.apache.pdfbox.pdmodel.font.PDType1Font
import org.json.JSONArray
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.ByteArrayOutputStream

/** The extractor on real PDFs: Chrome-made Hindi with ActualText, English, a scan, and a 520-page book. */
class PdfLinesTest {
    private fun resource(name: String) = javaClass.getResourceAsStream("/pdf/$name")!!.readBytes()

    private fun texts(pages: JSONArray): List<String> = (0 until pages.length()).flatMap { p ->
        val lines = pages.getJSONObject(p).getJSONArray("lines")
        (0 until lines.length()).map { lines.getJSONObject(it).getString("text") }
    }

    private val squash = { s: String -> s.replace(Regex("\\s+"), "") }

    @Test
    fun `Hindi comes out whole through ActualText, every page and every paragraph`() {
        PDDocument.load(resource("hindi.pdf")).use { doc ->
            val pages = PdfLines.pages(doc, 1, doc.numberOfPages)
            assertEquals(22, pages.length())
            val text = texts(pages).joinToString(" ")
            assertFalse(text.any { it.code < 0x20 || it == '�' }, "no NUL, control or replacement characters")
            assertTrue("ईदगाह" in text && "प्रेमचंद" in text)
            assertTrue("रमज़ान के पूरे तीस रोज़ के बाद आज ईद आई है।" in text)
            // Every paragraph of the source is there, word for word.
            val got = squash(text)
            val source = String(resource("hindi.txt"), Charsets.UTF_8).lines().filter { it.isNotBlank() }
            val missing = source.filter { squash(it) !in got }
            assertTrue(missing.isEmpty(), "missing ${missing.size} of ${source.size}: ${missing.take(2)}")
        }
    }

    @Test
    fun `English text keeps its lines, and a scan has no text at all`() {
        PDDocument.load(resource("short.pdf")).use { doc ->
            val text = texts(PdfLines.pages(doc, 1, doc.numberOfPages)).joinToString(" ")
            assertTrue("A Short Note" in text)
            assertTrue("It is a truth universally acknowledged" in text)
        }
        PDDocument.load(resource("scanned.pdf")).use { doc ->
            val pages = PdfLines.pages(doc, 1, doc.numberOfPages)
            assertEquals(2, pages.length())
            assertTrue(texts(pages).isEmpty())
        }
    }

    @Test
    fun `a 520-page book read in batches gives every page and every character`() {
        val source = ArrayList<String>()
        val bytes = ByteArrayOutputStream().also { out ->
            PDDocument().use { doc ->
                for (p in 1..520) {
                    val page = PDPage()
                    doc.addPage(page)
                    PDPageContentStream(doc, page).use { cs ->
                        cs.beginText()
                        cs.setFont(PDType1Font.TIMES_ROMAN, 11f)
                        cs.newLineAtOffset(72f, 720f)
                        for (k in 0 until 30) {
                            val line = "Page $p line $k: the reader kept on by the lamp."
                            source.add(line)
                            cs.showText(line)
                            cs.newLineAtOffset(0f, -14f)
                        }
                        cs.endText()
                    }
                }
                doc.save(out)
            }
        }.toByteArray()
        PDDocument.load(bytes).use { doc ->
            assertEquals(520, doc.numberOfPages)
            val all = JSONArray()
            for (from in 1..520 step 40) {
                val batch = PdfLines.pages(doc, from, minOf(520, from + 39))
                for (i in 0 until batch.length()) all.put(batch.get(i))
            }
            assertEquals(520, all.length())
            assertEquals(squash(source.joinToString("")), squash(texts(all).joinToString("")))
        }
    }
}
