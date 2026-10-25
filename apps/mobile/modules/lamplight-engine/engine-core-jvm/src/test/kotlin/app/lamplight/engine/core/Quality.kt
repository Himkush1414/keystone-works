package app.lamplight.engine.core

import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.log10
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Objective measures of how clean rendered speech is, for comparing the raw model output with what the
 * player plays. None of them is a listening test; together they catch the usual kinds of damage.
 */
object Quality {
    data class Report(
        /** Samples at or beyond full scale. */
        val clipped: Int,
        /** Sudden jumps between neighbouring samples, far beyond the local slope: clicks and splices. */
        val clicks: Int,
        /** Share of energy above 7 kHz in voiced frames, in dB: hiss and metallic edges raise it. */
        val hfDb: Double,
        /** Spectral flatness of 300 Hz–4 kHz in voiced frames (0 = pure harmonics, 1 = noise). */
        val flatness: Double,
        /** Mean periodicity of voiced 40 ms frames (normalised autocorrelation at the pitch period). */
        val harmonicity: Double,
        /** Frame-to-frame spectral change in voiced frames: warble and phasiness raise it. */
        val flux: Double,
    ) {
        override fun toString() = "clip %4d  clicks %3d  hf %6.1f dB  flat %.3f  harm %.3f  flux %.3f".format(clipped, clicks, hfDb, flatness, harmonicity, flux)
    }

    private const val N = 2048

    fun measure(x: FloatArray, sr: Int): Report {
        val clipped = x.count { abs(it) >= 0.999f }
        // Clicks: |Δx| more than 10× the RMS of Δx around it (±5 ms) and above an audible size.
        var clicks = 0
        val d = DoubleArray(x.size) { if (it == 0) 0.0 else (x[it] - x[it - 1]).toDouble() }
        val sq = DoubleArray(d.size + 1)
        for (i in d.indices) sq[i + 1] = sq[i] + d[i] * d[i]
        val w = sr / 200
        for (i in w until d.size - w) {
            val rms = sqrt((sq[i + w] - sq[i - w]) / (2 * w))
            if (abs(d[i]) > 10 * rms && abs(d[i]) > 0.02) clicks++
        }
        // Spectral measures on 2048-sample Hann frames, hop 1024, voiced = within 25 dB of the loudest frame.
        val win = DoubleArray(N) { 0.5 - 0.5 * cos(2 * PI * it / N) }
        val frames = ArrayList<DoubleArray>()
        val energies = ArrayList<Double>()
        var s = 0
        while (s + N <= x.size) {
            val re = DoubleArray(N) { x[s + it] * win[it] }
            val im = DoubleArray(N)
            fft(re, im)
            frames.add(DoubleArray(N / 2) { re[it] * re[it] + im[it] * im[it] })
            energies.add((s until s + N).sumOf { x[it].toDouble() * x[it] } / N)
            s += N / 2
        }
        val peak = energies.maxOrNull() ?: 0.0
        val voiced = frames.indices.filter { energies[it] > peak * 10.0.pow(-2.5) }
        val bin = { hz: Double -> (hz * N / sr).toInt() }
        var hf = 0.0
        var total = 0.0
        var flat = 0.0
        var flux = 0.0
        var fluxN = 0
        var prev: DoubleArray? = null
        for (f in voiced) {
            val p = frames[f]
            total += p.sum()
            hf += (bin(7000.0) until p.size).sumOf { p[it] }
            val band = (bin(300.0)..bin(4000.0)).map { p[it] + 1e-12 }
            flat += exp(band.sumOf { ln(it) } / band.size) / band.average()
            val norm = sqrt(p.sumOf { it }).let { n -> DoubleArray(p.size) { sqrt(p[it]) / (n + 1e-12) } }
            prev?.let { q -> flux += sqrt(norm.indices.sumOf { (norm[it] - q[it]).let { v -> v * v } }); fluxN++ }
            prev = norm
        }
        val pitch = harmonicity(x, sr)
        return Report(
            clipped, clicks,
            if (total > 0) 10 * log10(hf / total + 1e-12) else -120.0,
            if (voiced.isEmpty()) 0.0 else flat / voiced.size,
            pitch,
            if (fluxN == 0) 0.0 else flux / fluxN,
        )
    }

    /** Mean of the best normalised autocorrelation (70–400 Hz lags) over loud 40 ms frames. */
    private fun harmonicity(x: FloatArray, sampleRate: Int): Double {
        val dec = 4
        val sr = sampleRate / dec
        val y = FloatArray(x.size / dec) { i -> (0 until dec).sumOf { x[i * dec + it].toDouble() }.toFloat() / dec }
        val n = sr * 40 / 1000
        val minLag = sr / 400
        val maxLag = sr / 70
        val energies = ArrayList<Double>()
        var f = 0
        while ((f + 1) * n + maxLag < y.size) {
            var e = 0.0
            for (i in f * n until (f + 1) * n) e += y[i] * y[i]
            energies.add(e / n)
            f++
        }
        val peak = energies.maxOrNull() ?: return 0.0
        var sum = 0.0
        var count = 0
        for ((k, e) in energies.withIndex()) {
            if (e < peak * 10.0.pow(-2.5)) continue
            val s0 = k * n
            var best = 0.0
            for (l in minLag..maxLag) {
                var c = 0.0
                var e2 = 0.0
                for (i in s0 until s0 + n) {
                    c += y[i] * y[i + l]
                    e2 += y[i + l] * y[i + l]
                }
                best = maxOf(best, c / sqrt(e * n * e2 + 1e-12))
            }
            sum += best
            count++
        }
        return if (count == 0) 0.0 else sum / count
    }

    private fun Double.pow(p: Double) = Math.pow(this, p)

    /** In-place radix-2 FFT. */
    fun fft(re: DoubleArray, im: DoubleArray) {
        val n = re.size
        var j = 0
        for (i in 1 until n) {
            var bit = n shr 1
            while (j and bit != 0) {
                j = j xor bit
                bit = bit shr 1
            }
            j = j xor bit
            if (i < j) {
                re[i] = re[j].also { re[j] = re[i] }
                im[i] = im[j].also { im[j] = im[i] }
            }
        }
        var len = 2
        while (len <= n) {
            val ang = -2 * PI / len
            for (i in 0 until n step len) {
                for (k in 0 until len / 2) {
                    val wr = cos(ang * k)
                    val wi = sin(ang * k)
                    val ur = re[i + k]
                    val ui = im[i + k]
                    val vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi
                    val vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr
                    re[i + k] = ur + vr
                    im[i + k] = ui + vi
                    re[i + k + len / 2] = ur - vr
                    im[i + k + len / 2] = ui - vi
                }
            }
            len = len shl 1
        }
    }
}
