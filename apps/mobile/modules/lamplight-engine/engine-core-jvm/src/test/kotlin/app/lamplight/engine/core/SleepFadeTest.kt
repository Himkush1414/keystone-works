package app.lamplight.engine.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test

class SleepFadeTest {
    /** Runs a fade loop every 100 ms the way the player does; returns how many times it paused. */
    private fun run(fade: SleepFade, token: Int, from: Long, until: Long, onStep: (Long) -> Unit = {}): Int {
        var pauses = 0
        var t = from
        while (t <= until) {
            onStep(t)
            when (fade.step(token, t, playing = true)) {
                SleepFade.Step.Done -> { pauses++; return pauses }
                SleepFade.Step.Retired -> return pauses
                is SleepFade.Step.Volume -> {}
            }
            t += 100
        }
        return pauses
    }

    @Test
    fun `a fade runs down and pauses once`() {
        val fade = SleepFade(10_000)
        val token = fade.start(0)
        assertEquals(SleepFade.Step.Volume(0.5f), fade.step(token, 5_000, playing = true))
        assertEquals(1, run(fade, token, 0, 20_000))
        assertFalse(fade.active)
    }

    @Test
    fun `cancelling in the middle never pauses`() {
        val fade = SleepFade(10_000)
        val token = fade.start(0)
        assertEquals(0, run(fade, token, 0, 20_000) { if (it == 4_000L) fade.cancel() })
    }

    @Test
    fun `a new fade retires the old loop`() {
        val fade = SleepFade(10_000)
        val old = fade.start(0)
        fade.cancel()
        val new = fade.start(3_000)
        assertEquals(SleepFade.Step.Retired, fade.step(old, 3_100, playing = true))
        assertEquals(SleepFade.Step.Volume(0.99f), fade.step(new, 3_100, playing = true))
    }

    @Test
    fun `a listener who pauses ends the fade`() {
        val fade = SleepFade(10_000)
        val token = fade.start(0)
        assertEquals(SleepFade.Step.Done, fade.step(token, 1_000, playing = false))
        assertEquals(SleepFade.Step.Retired, fade.step(token, 1_100, playing = true))
    }
}
