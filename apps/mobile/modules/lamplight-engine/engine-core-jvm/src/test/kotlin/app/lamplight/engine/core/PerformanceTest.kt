package app.lamplight.engine.core

import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.math.abs
import kotlin.math.log10
import kotlin.math.sin
import kotlin.math.sqrt

class PerformanceTest {
    private val rate = 44100

    private fun tone(amplitude: Float, ms: Int = 200) =
        FloatArray(rate * ms / 1000) { i -> amplitude * sin(2 * Math.PI * 220 * i / rate).toFloat() }

    private fun rmsDb(x: FloatArray, from: Int = 0, to: Int = x.size): Double {
        var s = 0.0
        for (i in from until to) s += x[i] * x[i]
        return 20 * log10(sqrt(s / (to - from)))
    }

    @Test
    fun `leaves a plain line untouched`() {
        val x = tone(0.3f)
        assertSame(x, Performance.apply(x, rate, 0f, false, 1))
    }

    @Test
    fun `a whisper is quieter by the planned amount`() {
        val x = tone(0.3f)
        val y = Performance.apply(x, rate, -6f, false, 1)
        assertEquals(-6.0, rmsDb(y) - rmsDb(x), 0.05)
    }

    @Test
    fun `a shout is louder but never clips`() {
        val x = tone(0.8f)
        val y = Performance.gain(x, 3f)
        assertTrue(rmsDb(y) > rmsDb(x) + 1.5)
        assertTrue(y.all { abs(it) < 1f })
        // Quiet passages get the full gain; only peaks bend.
        val quiet = Performance.gain(tone(0.1f), 3f)
        assertEquals(3.0, rmsDb(quiet) - rmsDb(tone(0.1f)), 0.05)
    }

    @Test
    fun `a breath comes first, fills its slot exactly, and is soft`() {
        val x = tone(0.3f)
        val y = Performance.apply(x, rate, 0f, true, 42)
        val slot = rate * Performance.BREATH_MS / 1000
        assertEquals(slot + x.size, y.size)
        assertArrayEquals(x, y.copyOfRange(slot, y.size))
        val inhale = rate * 230 / 1000
        assertEquals(Performance.BREATH_RMS_DB, rmsDb(y, 0, inhale), 0.1)
        assertTrue(rmsDb(y, 0, inhale) < rmsDb(x) - 20, "a breath stays well under speech")
        // Silence before speech starts, and the inhale fades in rather than clicking.
        assertTrue((inhale until slot).all { y[it] == 0f })
        assertTrue(abs(y[0]) < 1e-3f)
    }

    @Test
    fun `the same seed gives the same breath, another seed a different one`() {
        val a = Performance.breath(rate, 7)
        assertArrayEquals(a, Performance.breath(rate, 7))
        assertTrue(!a.contentEquals(Performance.breath(rate, 8)))
    }

    /** Power at [hz] (Goertzel). */
    private fun power(x: FloatArray, hz: Double): Double {
        val k = 2 * Math.cos(2 * Math.PI * hz / rate)
        var s1 = 0.0
        var s2 = 0.0
        for (v in x) {
            val s0 = v + k * s1 - s2
            s2 = s1
            s1 = s0
        }
        return s1 * s1 + s2 * s2 - k * s1 * s2
    }

    @Test
    fun `a breath is air, not rumble`() {
        val b = Performance.breath(rate, 3).copyOfRange(0, rate * 230 / 1000)
        val rumble = listOf(60.0, 90.0, 120.0).sumOf { power(b, it) }
        val air = listOf(1200.0, 1600.0, 2000.0).sumOf { power(b, it) }
        assertTrue(10 * log10(air / rumble) > 10, "air band should dominate the rumble band")
    }

    /** A voiced sound at [f0] Hz: five harmonics, gently falling. */
    private fun voiced(f0: Double, ms: Int = 1000): FloatArray {
        val sr = 44_100
        return FloatArray(sr * ms / 1000) { i -> (1..5).sumOf { h -> 0.3 / h * kotlin.math.sin(2 * Math.PI * f0 * h * i / sr) }.toFloat() }
    }

    private fun medianF0(x: FloatArray) = Prosody.pitch(x, 44_100).sorted().let { it[it.size / 2] }

    @Test
    fun `pitch moves by the semitones asked for and the length stays`() {
        val x = voiced(150.0)
        for (st in listOf(-2f, -1f, 1f, 2f)) {
            val y = Performance.shiftPitch(x, 44_100, st)
            assertEquals(x.size, y.size)
            val want = 150.0 * Math.pow(2.0, st / 12.0)
            val got = medianF0(y)
            assertTrue(kotlin.math.abs(got / want - 1) < 0.03, "$st st: $got Hz, want $want")
        }
        assertTrue(Performance.shiftPitch(x, 44_100, 0f) === x)
    }

    @Test
    fun `pace changes the length and keeps the pitch`() {
        val x = voiced(150.0)
        for (rate in listOf(0.9f, 1.07f)) {
            val y = Performance.shiftPitch(x, 44_100, 0f, rate)
            assertEquals((x.size / rate).toInt(), y.size)
            assertTrue(kotlin.math.abs(medianF0(y) / 150.0 - 1) < 0.03, "rate $rate: ${medianF0(y)} Hz")
        }
    }

    @Test
    fun `a line can trail off, end clipped, or be cut off`() {
        val sr = 44_100
        val x = voiced(150.0, 800) + FloatArray(sr * 60 / 1000)
        val trail = Performance.ending(x, sr, "trail")
        val clip = Performance.ending(x, sr, "clip")
        val cut = Performance.ending(x, sr, "cut")
        assertTrue(trail.size > x.size, "trail ${trail.size} vs ${x.size}")
        assertTrue(clip.size < x.size - sr * 40 / 1000, "clip ${clip.size} vs ${x.size}")
        assertTrue(cut.size <= sr * 820 / 1000, "cut ${cut.size}")
        assertTrue(kotlin.math.abs(trail.last()) < 1e-3f)
        assertTrue(Performance.ending(x, sr, "other") === x)
    }
}

