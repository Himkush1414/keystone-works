package app.lamplight.engine.core

import kotlin.math.ln
import kotlin.math.log10
import kotlin.math.sqrt

/** Rough measurements of delivery from audio: pitch (autocorrelation F0), loudness and speaking time. */
object Prosody {
    data class Profile(val f0Median: Double, val f0Range: Double, val rmsDb: Double, val voicedMs: Int, val totalMs: Int)

    /** F0 in Hz for each 40 ms frame that is voiced (loud and periodic), or nothing. */
    fun pitch(x: FloatArray, sampleRate: Int): List<Double> {
        val d = 4
        val sr = sampleRate / d
        val y = FloatArray(x.size / d) { i -> (0 until d).sumOf { x[i * d + it].toDouble() }.toFloat() / d }
        val n = sr * 40 / 1000
        val minLag = sr / 400
        val maxLag = sr / 55
        val out = ArrayList<Double>()
        // Voiced means within 25 dB of the loudest frame, so a quiet line is measured like a loud one.
        var peak = 0.0
        var g = 0
        while ((g + 1) * n < y.size) {
            var e = 0.0
            for (i in g * n until (g + 1) * n) e += y[i] * y[i]
            peak = maxOf(peak, e / n)
            g++
        }
        val voicedDb = 10 * log10(peak + 1e-12) - 25
        var f = 0
        while ((f + 1) * n + maxLag < y.size) {
            val s = f * n
            var e = 0.0
            for (i in s until s + n) e += y[i] * y[i]
            if (10 * log10(e / n + 1e-12) > voicedDb) {
                val r = DoubleArray(maxLag + 1)
                for (l in minLag..maxLag) {
                    var c = 0.0
                    var e2 = 0.0
                    for (i in s until s + n) {
                        c += y[i] * y[i + l]
                        e2 += y[i + l] * y[i + l]
                    }
                    r[l] = c / sqrt(e * e2 + 1e-12)
                }
                val best = (minLag..maxLag).maxOf { r[it] }
                // The shortest lag that is nearly as good: a multiple of the period scores as high (octave errors).
                val lag = (minLag..maxLag).first { r[it] >= best * 0.9 && (it == maxLag || r[it] >= r[it + 1]) && (it == minLag || r[it] >= r[it - 1]) }
                if (best > 0.6) out.add(sr.toDouble() / lag)
            }
            f++
        }
        return out
    }

    fun profile(x: FloatArray, sampleRate: Int): Profile {
        val p = pitch(x, sampleRate).sorted()
        val semis = p.map { 12 * ln(it / 100.0) / ln(2.0) }.sorted()
        val range = if (semis.size > 4) semis[semis.size * 9 / 10] - semis[semis.size / 10] else 0.0
        val levels = Silences.levels(x, sampleRate).filter { it > -45 }
        val rms = if (levels.isEmpty()) -120.0 else 10 * log10(levels.map { Math.pow(10.0, it / 10) }.average())
        return Profile(if (p.isEmpty()) 0.0 else p[p.size / 2], range, rms, levels.size * Silences.FRAME_MS, x.size * 1000 / sampleRate)
    }

    /** Spectral flatness proxy: zero crossings per ms of sound (noise-like sounds such as breaths cross often). */
    fun zcr(x: FloatArray): Double {
        var z = 0
        for (i in 1 until x.size) if ((x[i] >= 0) != (x[i - 1] >= 0)) z++
        return z.toDouble() / x.size
    }
}
