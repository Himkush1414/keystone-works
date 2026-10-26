package app.lamplight.engine

import android.content.Context
import android.util.Log
import java.io.File
import java.security.MessageDigest

/**
 * Content-addressed cache of rendered sentences. The key covers everything that changes the audio (model,
 * voice, steps, language, spoken text, and the line's pace, loudness and breath), so edits to the pronunciation dictionary or voice invalidate only the
 * sentences they touch, and identical sentences are shared between documents.
 */
class AudioCache(context: Context, private val modelVersion: String) {
    private val root = File(context.cacheDir, "lamplight-audio").apply { mkdirs() }

    /** Upper bound in bytes; least recently used files are removed first. */
    @Volatile
    var capBytes: Long = 2L * 1024 * 1024 * 1024

    fun key(segment: Segment, steps: Int): String {
        val md = MessageDigest.getInstance("SHA-256")
        // The performance joins the key only when present, so plain lines keep the keys they always had.
        val performance = buildString {
            if (segment.rate != 1f) append("|r${segment.rate}")
            if (segment.gainDb != 0f) append("|g${segment.gainDb}")
            if (segment.pitch != 0f) append("|p${segment.pitch}")
            segment.ending?.let { append("|e$it") }
            if (segment.breath) append("|b")
            if (segment.release) append("|rel")
            segment.runs?.forEach { append("|${it.lang}:${it.text}") }
        }
        md.update("$modelVersion|${segment.voice}|$steps|${segment.lang}|${segment.text}$performance".toByteArray(Charsets.UTF_8))
        return md.digest().joinToString("") { "%02x".format(it) }
    }

    private fun file(key: String) = File(File(root, key.substring(0, 2)), "${key.substring(2)}.lpa")

    fun has(key: String): Boolean = file(key).exists()

    /** Best cached quality for [segment] among [stepsOptions] (highest first), or null. */
    fun best(segment: Segment, stepsOptions: List<Int>): Pair<Int, String>? {
        for (steps in stepsOptions.sortedDescending()) {
            val k = key(segment, steps)
            if (has(k)) return steps to k
        }
        return null
    }

    fun read(key: String): FloatArray? {
        val f = file(key)
        if (!f.exists()) return null
        return try {
            AudioCodec.decode(f).also { f.setLastModified(System.currentTimeMillis()) }
        } catch (e: Exception) {
            Log.w(TAG, "dropping unreadable cache entry ${f.name}", e)
            f.delete()
            null
        }
    }

    fun write(key: String, pcm: FloatArray, sampleRate: Int) {
        val f = file(key)
        if (f.exists()) return
        f.parentFile?.mkdirs()
        try {
            AudioCodec.encode(pcm, sampleRate, f)
        } catch (e: Exception) {
            Log.w(TAG, "could not cache audio", e)
            f.delete()
        }
    }

    fun sizeBytes(): Long = root.walkTopDown().filter { it.isFile }.sumOf { it.length() }

    /** Removes least recently used entries until the cache is under [capBytes]. */
    fun trim() {
        val files = root.walkTopDown().filter { it.isFile }.sortedBy { it.lastModified() }.toMutableList()
        var total = files.sumOf { it.length() }
        while (total > capBytes && files.isNotEmpty()) {
            val f = files.removeAt(0)
            total -= f.length()
            f.delete()
        }
    }

    fun clear() {
        root.deleteRecursively()
        root.mkdirs()
    }

    companion object {
        private const val TAG = "LamplightCache"
    }
}
