package app.lamplight.engine.core

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt
import kotlin.math.tanh

/**
 * Applies the performance plan from packages/core (`perform/plan.ts`) to rendered speech: a loudness change
 * for the line's emotion (a whisper quieter, a shout louder, never clipping) and a soft breath before it.
 * The model has no breath of its own, so the breath is generated here: seeded noise, band-limited to the
 * range of an inhale and shaped like one. Pure and deterministic, so the same line always sounds the same.
 */
object Performance {
    /** Whole breath slot in ms, matching BREATH_MS in plan.ts: the inhale, then a short gap before speech. */
    const val BREATH_MS = 280
    private const val INHALE_MS = 230

    /** Breath loudness (RMS, dBFS): audible up close, never louder than speech. */
    const val BREATH_RMS_DB = -36.0

    /** Above this, peaks are softly compressed instead of clipped. */
    private const val KNEE = 0.89f

    fun dbToGain(db: Double): Float = 10.0.pow(db / 20.0).toFloat()

    /**
     * Returns [samples] with [gainDb] applied and, if [breath], a breath in front. [seed] makes the breath
     * repeatable (use the sentence's own seed).
     */
    fun apply(samples: FloatArray, sampleRate: Int, gainDb: Float, breath: Boolean, seed: Long): FloatArray {
        val voiced = if (gainDb == 0f) samples else gain(samples, gainDb)
        if (!breath) return voiced
        val b = breath(sampleRate, seed)
        return FloatArray(b.size + voiced.size).also {
            b.copyInto(it)
            voiced.copyInto(it, b.size)
        }
    }

    /** Scales by [gainDb]; anything above the knee is bent smoothly towards full scale rather than clipped. */
    fun gain(samples: FloatArray, gainDb: Float): FloatArray {
        val g = dbToGain(gainDb.toDouble())
        val headroom = 1f - KNEE
        return FloatArray(samples.size) { i ->
            val x = samples[i] * g
            val a = abs(x)
            if (a <= KNEE) x else (KNEE + headroom * tanh(((a - KNEE) / headroom).toDouble()).toFloat()) * (if (x < 0) -1 else 1)
        }
    }

    /** A breath slot: [INHALE_MS] of shaped, band-limited noise followed by silence, [BREATH_MS] long in all. */
    fun breath(sampleRate: Int, seed: Long): FloatArray {
        val total = sampleRate * BREATH_MS / 1000
        val inhale = sampleRate * INHALE_MS / 1000
        val noise = Seed.gaussian(FloatArray(inhale), seed xor 0x5bd1e995L)
        // Band-pass roughly 500 Hz – 3.5 kHz with two one-pole filters: the hiss of air, without rumble or sizzle.
        val hp = exp(-2.0 * PI * 500.0 / sampleRate).toFloat()
        val lp = exp(-2.0 * PI * 3500.0 / sampleRate).toFloat()
        var low = 0f
        var prevIn = 0f
        var high = 0f
        val shaped = FloatArray(inhale)
        for (i in 0 until inhale) {
            val x = noise[i]
            high = hp * (high + x - prevIn)
            prevIn = x
            low = (1 - lp) * high + lp * low
            // An inhale swells and fades: a raised sine, quicker to rise than to fall.
            val t = i.toDouble() / inhale
            val env = if (t < 0.35) sin(PI / 2 * t / 0.35) else sin(PI / 2 * (1 - t) / 0.65)
            shaped[i] = (low * env * env).toFloat()
        }
        val rms = sqrt(shaped.fold(0.0) { acc, v -> acc + v * v } / inhale)
        val scale = if (rms > 0) (dbToGain(BREATH_RMS_DB) / rms).toFloat() else 0f
        return FloatArray(total) { i -> if (i < inhale) shaped[i] * scale else 0f }
    }
}
