package app.lamplight.engine.core

import kotlin.math.log10
import kotlin.math.sqrt

/** Finds the silent stretches in rendered speech, measured the way a listener hears them: 10 ms frames below a level. */
object Silences {
    /** A silent stretch from [startMs] lasting [ms]. */
    data class Gap(val startMs: Int, val ms: Int)

    const val FRAME_MS = 10
    const val FLOOR_DB = -45.0

    /** dBFS of each [FRAME_MS] frame. */
    fun levels(x: FloatArray, sampleRate: Int): DoubleArray {
        val n = sampleRate * FRAME_MS / 1000
        return DoubleArray(x.size / n) { f ->
            var s = 0.0
            for (i in f * n until (f + 1) * n) s += x[i] * x[i]
            val rms = sqrt(s / n)
            if (rms <= 1e-9) -120.0 else 20 * log10(rms)
        }
    }

    /** Leading and trailing silence in ms. */
    fun edges(x: FloatArray, sampleRate: Int, floorDb: Double = FLOOR_DB): Pair<Int, Int> {
        val l = levels(x, sampleRate)
        val first = l.indexOfFirst { it > floorDb }
        if (first < 0) return l.size * FRAME_MS to 0
        val last = l.indexOfLast { it > floorDb }
        return first * FRAME_MS to (l.size - 1 - last) * FRAME_MS
    }

    /** Silences of at least [minMs] between the first and last sound. */
    fun inside(x: FloatArray, sampleRate: Int, minMs: Int, floorDb: Double = FLOOR_DB): List<Gap> {
        val l = levels(x, sampleRate)
        val first = l.indexOfFirst { it > floorDb }
        val last = l.indexOfLast { it > floorDb }
        if (first < 0) return emptyList()
        val out = ArrayList<Gap>()
        var run = -1
        for (f in first..last) {
            if (l[f] <= floorDb) {
                if (run < 0) run = f
            } else if (run >= 0) {
                val ms = (f - run) * FRAME_MS
                if (ms >= minMs) out.add(Gap(run * FRAME_MS, ms))
                run = -1
            }
        }
        return out
    }
}
