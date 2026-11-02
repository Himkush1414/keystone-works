package app.lamplight.engine.core

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue

class IdleReleaseTest {
    private val used = 1_000_000L

    @Test
    fun releasesOnlyAfterThreeQuietMinutes() {
        assertFalse(IdleRelease.due(used + IdleRelease.AFTER_MS - 1, used, loaded = true, playing = false))
        assertTrue(IdleRelease.due(used + IdleRelease.AFTER_MS, used, loaded = true, playing = false))
    }

    @Test
    fun neverWhilePlayingOrWhenNothingIsLoaded() {
        val later = used + 10 * IdleRelease.AFTER_MS
        assertFalse(IdleRelease.due(later, used, loaded = true, playing = true))
        assertFalse(IdleRelease.due(later, used, loaded = false, playing = false))
    }
}
