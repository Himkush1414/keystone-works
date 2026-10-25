package app.lamplight.engine

import android.content.Context
import app.lamplight.engine.pdf.PdfLines
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException
import org.json.JSONObject
import java.io.File
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * Reads a PDF a few pages at a time, so a long book can be opened on its first pages while the rest is read
 * (every call runs on the module's background queue, never the UI thread). Text lines and the outline come
 * from [PdfLines]; layout analysis happens in packages/core (buildPdfDocument).
 */
object PdfText {
    class PdfError(val code: String, message: String) : Exception(message)

    @Volatile private var initialised = false
    private val docs = ConcurrentHashMap<Int, PDDocument>()
    private val nextHandle = AtomicInteger(1)

    /** Opens [path]; returns `{handle, pageCount, outline, title, author}`. Close it with [close]. */
    fun open(context: Context, path: String, password: String?): String {
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
        val handle = nextHandle.getAndIncrement()
        docs[handle] = doc
        val info = doc.documentInformation
        EngineLog.i(TAG, "opened PDF: ${doc.numberOfPages} pages")
        return JSONObject()
            .put("handle", handle)
            .put("pageCount", doc.numberOfPages)
            .put("outline", runCatching { PdfLines.outline(doc) }.getOrElse { org.json.JSONArray() })
            .put("title", info?.title ?: JSONObject.NULL)
            .put("author", info?.author ?: JSONObject.NULL)
            .toString()
    }

    /** Pages [from]..[to] (1-based, inclusive) of an open PDF, as a JSON array (see PdfLines.pages). */
    fun pages(handle: Int, from: Int, to: Int): String {
        val doc = docs[handle] ?: throw PdfError("closed", "This PDF is no longer open")
        val last = minOf(to, doc.numberOfPages)
        if (from > last) return "[]"
        return try {
            PdfLines.pages(doc, from, last).toString()
        } catch (e: Exception) {
            EngineLog.e(TAG, "PDF pages $from-$last failed", e)
            throw PdfError("corrupt", e.message ?: "Unreadable page")
        }
    }

    fun close(handle: Int) {
        docs.remove(handle)?.let { runCatching { it.close() } }
    }

    private const val TAG = "LamplightPdf"
}
