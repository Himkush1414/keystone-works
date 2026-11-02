package app.lamplight.engine.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class CacheTrimTest {
    private fun e(name: String, bytes: Long, usedAt: Long) = CacheTrim.Entry(name, bytes, usedAt)

    @Test
    fun `under the cap nothing goes`() {
        assertEquals(emptyList<String>(), CacheTrim.victims(listOf(e("a", 10, 1), e("b", 10, 2)), capBytes = 20))
    }

    @Test
    fun `the least recently used go first, only as many as needed`() {
        val entries = listOf(e("new", 40, 30), e("old", 40, 10), e("mid", 40, 20))
        assertEquals(listOf("old"), CacheTrim.victims(entries, capBytes = 80))
        assertEquals(listOf("old", "mid"), CacheTrim.victims(entries, capBytes = 79))
        assertEquals(listOf("old", "mid", "new"), CacheTrim.victims(entries, capBytes = 0))
    }
}
