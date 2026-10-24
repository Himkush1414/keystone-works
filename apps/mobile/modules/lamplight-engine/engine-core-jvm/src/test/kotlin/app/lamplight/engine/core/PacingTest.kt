package app.lamplight.engine.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import kotlin.math.abs

class PacingTest {
    private val options = ReadAhead.STEP_OPTIONS

    @Test
    fun `with nothing in hand it picks the fastest render`() {
        assertEquals(3, Pacing().choose(options, 5_000, -1_200))
    }

    @Test
    fun `it learns the phone and picks the best steps that fit`() {
        val p = Pacing()
        // A phone where rtf = 0.1 + 0.05 * steps.
        for (s in listOf(3, 8, 3, 8)) p.record(s, ((0.1 + 0.05 * s) * 4_000).toLong(), 4_000, 60)
        assertTrue(abs(p.rtf(12) - 0.7) < 0.02, "rtf12 ${p.rtf(12)}")
        // 4 s of speech, 3 s to render it: 0.75 rtf allows 12 steps, not 16.
        assertEquals(12, p.choose(options, 4_000, 3_000))
        assertEquals(16, p.choose(options, 4_000, 60_000))
    }

    @Test
    fun `one measurement rescales the prior`() {
        val p = Pacing()
        p.record(3, 3_000, 2_000, 30)
        assertEquals(1.5, p.rtf(3), 1e-9)
        assertTrue(p.rtf(8) > 1.5)
    }

    @Test
    fun `speech length is learned from the voice`() {
        val p = Pacing()
        repeat(20) { p.record(4, 500, 5_000, 100) }
        assertEquals(5_000, p.estimateAudioMs(100, 1f), 50.0)
    }

    private fun assertEquals(expected: Long, actual: Long, tolerance: Double) =
        assertTrue(abs(expected - actual) <= tolerance, "expected $expected, got $actual")
}
