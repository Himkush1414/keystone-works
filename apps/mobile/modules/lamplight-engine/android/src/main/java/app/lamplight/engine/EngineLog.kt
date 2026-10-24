package app.lamplight.engine

import android.util.Log
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The engine's log: every line goes to logcat and into a small ring the Diagnostics screen shows, so a
 * failure on a phone without a cable can still be read and sent.
 */
object EngineLog {
    private const val KEEP = 200
    private val lines = ArrayDeque<String>()
    private val clock = SimpleDateFormat("HH:mm:ss.SSS", Locale.US)

    fun i(tag: String, message: String) {
        Log.i(tag, message)
        add('I', tag, message)
    }

    fun w(tag: String, message: String, error: Throwable? = null) {
        Log.w(tag, message, error)
        add('W', tag, message + (error?.let { " — ${it.javaClass.simpleName}: ${it.message}" } ?: ""))
    }

    fun e(tag: String, message: String, error: Throwable? = null) {
        Log.e(tag, message, error)
        add('E', tag, message + (error?.let { " — ${it.javaClass.simpleName}: ${it.message}" } ?: ""))
    }

    /** The newest [n] lines, oldest first. */
    @Synchronized
    fun tail(n: Int): List<String> = lines.toList().takeLast(n)

    @Synchronized
    private fun add(level: Char, tag: String, message: String) {
        lines.addLast("${clock.format(Date())} $level $tag: $message")
        while (lines.size > KEEP) lines.removeFirst()
    }
}

/** Why narration can't go on, in words a listener can act on, with a stable [code] for support. */
class EngineFailure(val code: String, val message: String, val detail: String) {
    fun toMap(): Map<String, Any> = mapOf("code" to code, "message" to message, "detail" to detail, "at" to System.currentTimeMillis())

    companion object {
        fun of(e: Throwable): EngineFailure {
            val detail = generateSequence(e) { it.cause }.take(4).joinToString(" ← ") { "${it.javaClass.name}: ${it.message}" }
            val text = generateSequence(e) { it.cause }.joinToString(" ") { "${it.javaClass.name} ${it.message}" }
            return when {
                e is java.io.FileNotFoundException || "engine/" in text && "No such file" in text ->
                    EngineFailure("model-missing", "The voice files are missing from this install. Reinstall Lamplight.", detail)
                e is UnsatisfiedLinkError || e is NoClassDefFoundError || e is ExceptionInInitializerError ->
                    EngineFailure("runtime-missing", "The voice engine's native library could not load on this phone.", detail)
                e is OutOfMemoryError ->
                    EngineFailure("memory", "There isn't enough free memory to load the voice. Close a few apps and press play again.", detail)
                "ai.onnxruntime" in text ->
                    EngineFailure("runtime-error", "The voice engine stopped with an error while speaking.", detail)
                else -> EngineFailure("render", "Narration stopped with an unexpected error.", detail)
            }
        }
    }
}
