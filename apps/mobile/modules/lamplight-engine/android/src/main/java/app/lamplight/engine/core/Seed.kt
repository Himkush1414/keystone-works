package app.lamplight.engine.core

import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Seeded noise for flow matching, bit-compatible with packages/engine-web/src/rng.ts so the same sentence
 * renders the same audio on every platform (and the Kotlin port can be checked against the reference).
 */
object Seed {
    /** FNV-1a over UTF-16 code units, 32-bit, returned as an unsigned value in a Long. */
    fun fnv1a(s: String): Long {
        var h = 0x811c9dc5.toInt()
        for (ch in s) {
            h = h xor ch.code
            h *= 0x01000193
        }
        return h.toLong() and 0xffffffffL
    }

    fun forSentence(text: String, voiceId: String, steps: Int): Long = fnv1a("$voiceId|$steps|$text")

    /** mulberry32 generator returning doubles in [0, 1). */
    class Mulberry32(seed: Long) {
        private var a = seed.toInt()

        fun next(): Double {
            a += 0x6d2b79f5
            var t = (a xor (a ushr 15)) * (1 or a)
            t = (t + ((t xor (t ushr 7)) * (61 or t))) xor t
            return ((t xor (t ushr 14)).toLong() and 0xffffffffL) / 4294967296.0
        }
    }

    /** Fills [out] with standard normal samples (Box–Muller in pairs), exactly like the TypeScript version. */
    fun gaussian(out: FloatArray, seed: Long): FloatArray {
        val rnd = Mulberry32(seed)
        var i = 0
        while (i < out.size) {
            val u1 = max(1e-10, rnd.next())
            val u2 = rnd.next()
            val r = sqrt(-2.0 * ln(u1))
            out[i] = (r * cos(2.0 * Math.PI * u2)).toFloat()
            if (i + 1 < out.size) out[i + 1] = (r * sin(2.0 * Math.PI * u2)).toFloat()
            i += 2
        }
        return out
    }
}
