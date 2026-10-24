package app.lamplight.engine.core

import kotlin.math.min

/** A stretch of a sentence in one voice language, as packages/core `languageRuns` hands it over. */
data class Run(val text: String, val lang: String)

/** One piece of a sentence that the engine renders on its own; [gapMs] of silence follows it within the sentence. */
data class Piece(val text: String, val lang: String, val gapMs: Int)

/**
 * Cuts a sentence into pieces that are rendered one after another, so the first words of a long sentence can
 * play while the rest is still being made, and a Hindi phrase in an English line (or the reverse) is read by
 * the voice language that says it best. Cuts fall only where the text pauses anyway (a comma, a semicolon, a
 * dash) or where the language changes, and each gap is the pause that punctuation asks for: the listener
 * hears the text's own rhythm, never the renderer's.
 */
object Chunks {
    /** The first piece is kept short so the sentence starts quickly; later ones render while it plays. */
    const val FIRST_MAX = 90
    /** Beyond this the model's phrasing suffers, so a piece is cut even where the text doesn't pause. */
    const val MAX = 240
    private const val MIN = 24

    /** Silence after a cut, by the punctuation it follows. */
    const val COMMA_GAP_MS = 90
    const val CLAUSE_GAP_MS = 180
    const val DASH_GAP_MS = 140

    /** Between two languages with no punctuation: just enough to keep the words apart. */
    const val SWITCH_GAP_MS = 30

    /** Fade at each cut, so pieces join without a click. */
    const val EDGE_MS = 4

    fun split(text: String, lang: String, runs: List<Run>? = null): List<Piece> {
        val parts = runs?.filter { it.text.isNotBlank() }?.takeIf { it.isNotEmpty() } ?: listOf(Run(text, lang))
        val out = ArrayList<Piece>()
        parts.forEachIndexed { k, run ->
            val pieces = byLength(run.text.trim(), run.lang, if (out.isEmpty()) FIRST_MAX else MAX)
            if (k > 0 && out.isNotEmpty()) {
                val last = out.removeAt(out.lastIndex)
                out.add(last.copy(gapMs = maxOf(SWITCH_GAP_MS, gapAfter(last.text))))
            }
            out.addAll(pieces)
        }
        if (out.isNotEmpty()) out[out.lastIndex] = out.last().copy(gapMs = 0)
        return out
    }

    private fun byLength(text: String, lang: String, firstMax: Int): List<Piece> {
        val out = ArrayList<Piece>()
        var rest = text
        var max = firstMax
        while (rest.length > max) {
            val cut = cutPoint(rest, max, hard = rest.length > MAX) ?: break
            val head = rest.substring(0, cut).trim()
            out.add(Piece(head, lang, gapAfter(head)))
            rest = rest.substring(cut).trim()
            max = MAX
        }
        if (rest.isNotEmpty()) out.add(Piece(rest, lang, 0))
        return out
    }

    /**
     * Where to cut [s] so the head is at most [max] long: the last clause break that leaves both sides a
     * reasonable length; failing that, the first one past [max] (a slightly long piece beats a cut mid-clause)
     * if it's not far; failing that, and only when [hard] (the text is too long for the model), the last space.
     */
    private fun cutPoint(s: String, max: Int, hard: Boolean): Int? {
        val breaks = clauseBreaks(s).filter { it >= MIN && s.length - it >= MIN }
        breaks.lastOrNull { it <= max }?.let { return it }
        breaks.firstOrNull { it <= max * 3 / 2 }?.let { return it }
        if (!hard) return null
        val space = s.lastIndexOf(' ', min(MAX, s.length - 1))
        return if (space >= MIN) space else null
    }

    private val clause = Regex("[,;:،]\\s|\\s[–—-]\\s|—")

    private fun clauseBreaks(s: String): List<Int> = clause.findAll(s).map { m ->
        if (m.value == "—") m.range.last + 1 else m.range.first + m.value.trimEnd().length
    }.toList()

    private fun gapAfter(piece: String): Int = when (piece.trimEnd().lastOrNull()) {
        ',', '،' -> COMMA_GAP_MS
        ';', ':' -> CLAUSE_GAP_MS
        '—', '–', '-' -> DASH_GAP_MS
        else -> 0
    }

    /** Short fades at both ends of a piece that sits next to another; a whole sentence is left untouched. */
    fun fadeEdges(samples: FloatArray, sampleRate: Int, fadeIn: Boolean, fadeOut: Boolean): FloatArray {
        if (!fadeIn && !fadeOut) return samples
        val n = min(samples.size / 2, sampleRate * EDGE_MS / 1000)
        if (n <= 0) return samples
        val out = samples.copyOf()
        for (i in 0 until n) {
            val g = i.toFloat() / n
            if (fadeIn) out[i] *= g
            if (fadeOut) out[out.size - 1 - i] *= g
        }
        return out
    }
}
