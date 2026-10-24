package app.lamplight.engine

import app.lamplight.engine.core.Run
import org.json.JSONObject

/** One spoken unit, as built by packages/core `buildQueue` (text is already normalised for speech). */
data class Segment(
    val index: Int,
    val text: String,
    val lang: String,
    val voice: String,
    val pauseMs: Int,
    val kind: String,
    /** Pace relative to normal for this line (a character's pace, the line's emotion); see perform/plan.ts. */
    val rate: Float = 1f,
    /** Loudness change in dB for the line's emotion. */
    val gainDb: Float = 0f,
    /** A soft breath before the line. */
    val breath: Boolean = false,
    /** The line split by voice language (a Hindi phrase in an English line, or the reverse); null for one language. */
    val runs: List<Run>? = null,
    /** Not built by the app yet (a long book is queued around where listening starts, then filled in). */
    val pending: Boolean = false,
) {
    val isSilent: Boolean get() = !pending && text.isBlank()

    companion object {
        fun pending(index: Int) = Segment(index, "", "en", "", 0, "pending", pending = true)
    }
}

/** Everything the player needs to narrate a document without the JavaScript side. */
class QueueSpec(
    val docId: String,
    val title: String,
    val author: String?,
    val artworkUri: String?,
    val segments: List<Segment>,
    /** Sentence indices where chapters start, ascending. */
    val chapterStarts: IntArray,
    val chapterTitles: List<String>,
) {
    fun chapterOf(index: Int): Int {
        var c = 0
        for (k in chapterStarts.indices) if (chapterStarts[k] <= index) c = k
        return c
    }

    /** Index of the last sentence of the chapter containing [index]. */
    fun chapterEnd(index: Int): Int {
        val c = chapterOf(index)
        return if (c + 1 < chapterStarts.size) chapterStarts[c + 1] - 1 else segments.lastIndex
    }

    companion object {
        /** Parses the queue file written by the app (see apps/mobile/src/player/queue.ts). */
        fun parse(json: String): QueueSpec {
            val o = JSONObject(json)
            val given = parseSegments(o)
            // `count` covers the whole document; sentences not sent yet wait as pending placeholders.
            val count = maxOf(o.optInt("count", 0), (given.maxOfOrNull { it.index } ?: -1) + 1)
            val segments = MutableList(count) { Segment.pending(it) }
            for (s in given) segments[s.index] = s
            val starts = o.optJSONArray("chapterStarts")
            val titles = o.optJSONArray("chapterTitles")
            return QueueSpec(
                docId = o.getString("docId"),
                title = o.optString("title", ""),
                author = o.optString("author").ifBlank { null },
                artworkUri = o.optString("artworkUri").ifBlank { null },
                segments = segments,
                chapterStarts = if (starts == null) intArrayOf(0) else IntArray(starts.length()) { starts.getInt(it) },
                chapterTitles = if (titles == null) emptyList() else List(titles.length()) { titles.getString(it) },
            )
        }

        /** The segments in a queue file or an update, by their own index. */
        fun parseSegments(o: JSONObject): List<Segment> {
            val segs = o.getJSONArray("segments")
            return List(segs.length()) { k ->
                val s = segs.getJSONObject(k)
                Segment(
                    index = s.getInt("i"),
                    text = s.getString("text"),
                    lang = s.getString("lang"),
                    voice = s.getString("voice"),
                    pauseMs = s.optInt("pauseMs", 0),
                    kind = s.optString("kind", "narration"),
                    rate = s.optDouble("rate", 1.0).toFloat().coerceIn(0.7f, 1.4f),
                    gainDb = s.optDouble("gainDb", 0.0).toFloat().coerceIn(-12f, 6f),
                    breath = s.optBoolean("breath", false),
                    runs = s.optJSONArray("runs")?.let { r ->
                        List(r.length()) { j -> r.getJSONObject(j).let { Run(it.getString("text"), it.getString("lang")) } }
                    },
                )
            }
        }
    }
}
