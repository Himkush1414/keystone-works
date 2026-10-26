package app.lamplight.engine.core

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

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

    /**
     * Silence added after a cut, by the punctuation it follows. Each piece keeps [LEAD_KEEP_MS] + [TRAIL_KEEP_MS]
     * of its own quiet edges, so the listener hears about 90 ms more than this: a comma lands near the
     * 300–440 ms the model leaves at a comma inside a whole sentence (measured in GapScanTest).
     */
    const val COMMA_GAP_MS = 190
    const val CLAUSE_GAP_MS = 290
    const val DASH_GAP_MS = 160

    /** Between two languages with no punctuation: none added; the pieces overlap by [XFADE_MS] instead. */
    const val SWITCH_GAP_MS = 0

    /**
     * Every render starts with 0.3–0.65 s and ends with 0.35–0.75 s of near-silence (about −105 dBFS) that
     * the model pads its output with. Left in, two pieces met with over a second of silence mid-sentence.
     * [trim] keeps this much of each edge below [TRIM_FLOOR_DB]: room for a soft onset and the release.
     */
    const val LEAD_KEEP_MS = 30
    const val TRAIL_KEEP_MS = 60
    const val TRIM_FLOOR_DB = -50.0
    private const val TRIM_FRAME_MS = 5
    private const val STRONG_BELOW_PEAK_DB = 30.0
    /** Quiet 5 ms frames bridged while walking out from the speech (a brief dip inside a soft consonant). */
    private const val BRIDGE_FRAMES = 2

    /** Overlap where two pieces meet with no pause between them (a language switch). */
    const val XFADE_MS = 30

    /**
     * The end of a line, kept as it dies away ([release]): sound is followed down to [RELEASE_FLOOR_DB] (the last
     * word's decay and the breath after it, which [TRIM_FLOOR_DB] cuts) for at most [RELEASE_MAX_MS], then
     * faded over [RELEASE_FADE_MS]. The player takes the extra length out of the pause that follows.
     */
    const val RELEASE_FLOOR_DB = -62.0
    const val RELEASE_MAX_MS = 240
    const val RELEASE_FADE_MS = 40

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

    /**
     * [samples] without the model's silent padding: from [LEAD_KEEP_MS] before the first 5 ms frame above
     * [TRIM_FLOOR_DB] to [TRAIL_KEEP_MS] after the last, with the kept edges faded so nothing clicks.
     * Audio with no frame above the floor is returned unchanged.
     */
    fun trim(samples: FloatArray, sampleRate: Int): FloatArray = cut(samples, sampleRate, release = false)

    /**
     * [trim], except that the end follows the sound further down, to [RELEASE_FLOOR_DB], so a line finishes its
     * last word and breath before the next voice comes in. Measured in TurnProbeTest.
     */
    fun release(samples: FloatArray, sampleRate: Int): FloatArray = cut(samples, sampleRate, release = true)

    /** How much longer [release] keeps the end than [trim] would, in samples. */
    fun releaseExtra(samples: FloatArray, sampleRate: Int): Int =
        cut(samples, sampleRate, true).size - cut(samples, sampleRate, false).size

    private fun cut(samples: FloatArray, sampleRate: Int, release: Boolean): FloatArray {
        val n = sampleRate * TRIM_FRAME_MS / 1000
        val frames = samples.size / n
        if (frames == 0) return samples
        val energy = DoubleArray(frames) { f ->
            var e = 0.0
            for (i in f * n until (f + 1) * n) e += samples[i] * samples[i]
            e / n
        }
        val floor = Performance.dbToGain(TRIM_FLOOR_DB).let { it * it }
        // Speech proper: within 30 dB of the loudest frame (and at least -40 dB). The edges are then walked out
        // from it through continuous sound above the floor, so a soft onset leading into a word is kept while a
        // faint blip separated from the speech by near-silence (one rendered 130 ms early) is not.
        val peak = energy.max()
        val strong = maxOf(peak * Math.pow(10.0, -STRONG_BELOW_PEAK_DB / 10), Performance.dbToGain(-40.0).let { it * it }.toDouble())
        val firstStrong = energy.indexOfFirst { it >= strong }
        if (firstStrong < 0) return samples
        val lastStrong = energy.indexOfLast { it >= strong }
        fun walk(from: Int, step: Int, below: Float): Int {
            var edge = from
            var quiet = 0
            var f = from + step
            while (f in 0 until frames) {
                if (energy[f] > below) {
                    edge = f
                    quiet = 0
                } else if (++quiet > BRIDGE_FRAMES) break
                f += step
            }
            return edge
        }
        val first = walk(firstStrong, -1, floor)
        val last = walk(lastStrong, 1, floor)
        val lead = sampleRate * LEAD_KEEP_MS / 1000
        val trail = sampleRate * TRAIL_KEEP_MS / 1000
        val from = max(0, first * n - lead)
        var to = min(samples.size, (last + 1) * n + trail)
        var fadeOut = to - (last + 1) * n
        if (release) {
            // Follow the decay below the trim floor, never further than RELEASE_MAX_MS past the speech.
            val quiet = Performance.dbToGain(RELEASE_FLOOR_DB).let { it * it }
            val limit = min(frames - 1, last + RELEASE_MAX_MS / TRIM_FRAME_MS)
            var end = last
            while (end < limit && energy[end + 1] > quiet) end++
            val fade = sampleRate * RELEASE_FADE_MS / 1000
            to = max(to, min(samples.size, (end + 1) * n + fade))
            fadeOut = max(fadeOut, min(fade, to - (last + 1) * n))
        }
        val out = samples.copyOfRange(from, to)
        val fadeIn = first * n - from
        for (i in 0 until fadeIn) out[i] *= i.toFloat() / fadeIn
        for (i in 0 until fadeOut) out[out.size - 1 - i] *= i.toFloat() / fadeOut
        return out
    }

    /**
     * Joins a sentence's pieces as they're made. A piece followed by no pause hands its last [XFADE_MS] to
     * the next one, which fades in over it, so a language switch runs on like one breath. Pieces with a
     * pause after them pass through whole.
     */
    class Joiner(private val sampleRate: Int) {
        private var held: FloatArray? = null

        fun push(samples: FloatArray, gapMs: Int, last: Boolean): FloatArray {
            val body = held?.let { overlap(it, samples) } ?: samples
            held = null
            if (last || gapMs > 0) return body
            val n = min(sampleRate * XFADE_MS / 1000, body.size / 2)
            held = body.copyOfRange(body.size - n, body.size)
            return body.copyOfRange(0, body.size - n)
        }

        private fun overlap(tail: FloatArray, next: FloatArray): FloatArray {
            val n = min(tail.size, next.size)
            val out = FloatArray(next.size + tail.size - n)
            tail.copyInto(out)
            for (i in 0 until n) {
                // Equal-power: the two voices are unrelated signals, so their powers add.
                val g = (PI / 2 * (i + 0.5) / n)
                out[i] = tail[i] * cos(g).toFloat() + next[i] * sin(g).toFloat()
            }
            next.copyInto(out, tail.size, n, next.size)
            return out
        }
    }
}
