package app.lamplight.engine.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class AudioWindowTest {
    @Test
    fun `keeps the heard sentence, what is ahead and two behind`() {
        assertEquals(listOf(0, 1, 2), AudioWindow.stale(listOf(0, 1, 2, 3, 4, 5, 9), current = 5))
        assertEquals(emptyList<Int>(), AudioWindow.stale(listOf(0, 1, 2), current = 2))
    }

    @Test
    fun `a whole book replayed from the cache stays a few sentences in memory`() {
        // The player reads each sentence from the cache 30 s ahead (about six sentences) while the listener moves on.
        val held = HashMap<Int, FloatArray>()
        var most = 0
        for (current in 0 until 1_000) {
            for (ahead in current..current + 6) {
                if (ahead !in held) {
                    held[ahead] = FloatArray(1)
                    AudioWindow.stale(held.keys, current).forEach(held::remove)
                }
            }
            AudioWindow.stale(held.keys, current).forEach(held::remove)
            most = maxOf(most, held.size)
        }
        assertTrue(most <= 7 + AudioWindow.BEHIND, "held at most $most sentences")
    }
}
