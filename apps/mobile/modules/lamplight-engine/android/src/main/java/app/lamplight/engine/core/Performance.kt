package app.lamplight.engine.core

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
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
     * Returns [samples] raised or lowered by [pitch] semitones and sped up by [rate], with [gainDb] applied
     * and, if [breath], a breath in front. [seed] makes the breath repeatable (use the sentence's own seed).
     *
     * Pace is applied here rather than by the model: asked for another rate, the model renders a different
     * take (its own pitch moved by up to ±2.3 semitones in DeliveryScanTest, swamping the line's emotion),
     * and in Hindi it shortened mostly its silent padding, not the speech.
     */
    fun apply(samples: FloatArray, sampleRate: Int, gainDb: Float, breath: Boolean, seed: Long, pitch: Float = 0f, rate: Float = 1f): FloatArray {
        val shifted = if (pitch == 0f && rate == 1f) samples else shiftPitch(samples, sampleRate, pitch, rate)
        val voiced = if (gainDb == 0f) shifted else gain(shifted, gainDb)
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

    /**
     * Moves the pitch by [semitones] and plays [rate] times as fast, in one pass: the speech is stretched in
     * time by ratio / rate (WSOLA: 30 ms windows, each placed where it lines up best with the last, so voiced
     * sounds keep their period), then read back at the pitch ratio. Formants move with the pitch, so this is
     * for the small shifts a delivery needs (about ±2 semitones), not for changing who is speaking.
     */
    fun shiftPitch(samples: FloatArray, sampleRate: Int, semitones: Float, rate: Float = 1f): FloatArray {
        if ((semitones == 0f && rate == 1f) || samples.isEmpty()) return samples
        val ratio = 2.0.pow(semitones / 12.0)
        val stretched = stretch(samples, sampleRate, ratio / rate)
        return FloatArray((samples.size / rate).toInt()) { i ->
            val at = i * ratio
            val k = at.toInt()
            if (k + 1 >= stretched.size) stretched.lastOrNull() ?: 0f
            else (stretched[k] + (stretched[k + 1] - stretched[k]) * (at - k)).toFloat()
        }
    }

    /** WSOLA time stretch: the result is [factor] times as long, at the same pitch. */
    fun stretch(x: FloatArray, sampleRate: Int, factor: Double): FloatArray {
        val n = sampleRate * 30 / 1000
        val hop = n / 2
        val tol = sampleRate * 8 / 1000
        val outLen = (x.size * factor).toInt()
        if (x.size < n * 2) return FloatArray(outLen) { i -> x[min(x.size - 1, (i / factor).toInt())] }
        val window = FloatArray(n) { (0.5 - 0.5 * cos(2 * PI * it / n)).toFloat() }
        val out = FloatArray(outLen + n)
        val norm = FloatArray(outLen + n)
        val last = x.size - n
        var prev = 0
        var pos = 0
        while (pos < outLen) {
            val nominal = min(last, (pos / factor).toInt())
            val start = if (pos == 0) 0 else bestMatch(x, min(last, prev + hop), nominal, tol, n, last)
            for (i in 0 until n) {
                out[pos + i] += x[start + i] * window[i]
                norm[pos + i] += window[i]
            }
            prev = start
            pos += hop
        }
        return FloatArray(outLen) { i -> if (norm[i] > 1e-3f) out[i] / norm[i] else out[i] }
    }

    /** The start near [nominal] whose frame best continues the one at [natural] (correlation every 4th sample). */
    private fun bestMatch(x: FloatArray, natural: Int, nominal: Int, tol: Int, n: Int, last: Int): Int {
        var best = nominal
        var score = Double.NEGATIVE_INFINITY
        var c = max(0, nominal - tol)
        val end = min(last, nominal + tol)
        while (c <= end) {
            var s = 0.0
            var i = 0
            while (i < n) {
                s += x[natural + i] * x[c + i]
                i += 4
            }
            if (s > score) {
                score = s
                best = c
            }
            c += 2
        }
        return best
    }

    /** How a line can end; see [ending]. */
    val ENDINGS = setOf("trail", "clip", "cut")

    /**
     * Shapes the last words of trimmed speech: "trail" draws the last 300 ms out by 15% and lets it fade
     * 6 dB (the old, the gentle); "clip" says them 10% quicker and stops 15 ms after the last sound (the
     * fiery); "cut" stops 10 ms after it, as when someone else breaks in.
     */
    fun ending(samples: FloatArray, sampleRate: Int, kind: String): FloatArray {
        val n = sampleRate / 100
        val frames = samples.size / n
        if (frames < 10) return samples
        val floor = dbToGain(-45.0).let { it * it }
        val lastLoud = (frames - 1 downTo 0).firstOrNull { f ->
            var e = 0.0
            for (i in f * n until (f + 1) * n) e += samples[i] * samples[i]
            e / n > floor
        } ?: return samples
        val soundEnd = (lastLoud + 1) * n
        fun stopAfter(x: FloatArray, end: Int, keepMs: Int): FloatArray {
            val to = min(x.size, end + sampleRate * keepMs / 1000)
            val out = x.copyOf(to)
            val fade = min(to, sampleRate * 5 / 1000)
            for (i in 0 until fade) out[to - 1 - i] *= i.toFloat() / fade
            return out
        }
        return when (kind) {
            "cut" -> stopAfter(samples, soundEnd, 10)
            "clip", "trail" -> {
                val tailMs = if (kind == "trail") 300 else 200
                val from = max(0, soundEnd - sampleRate * tailMs / 1000)
                val tail = stretch(samples.copyOfRange(from, soundEnd), sampleRate, if (kind == "trail") 1.15 else 0.9)
                if (kind == "trail") for (i in tail.indices) tail[i] *= dbToGain(-6.0 * i / tail.size)
                val rest = if (kind == "trail") samples.copyOfRange(soundEnd, samples.size) else FloatArray(sampleRate * 15 / 1000)
                val out = FloatArray(from + tail.size + rest.size)
                samples.copyInto(out, 0, 0, from)
                tail.copyInto(out, from)
                rest.copyInto(out, from + tail.size)
                if (kind == "clip") stopAfter(out, from + tail.size, 15) else out
            }
            else -> samples
        }
    }
}

