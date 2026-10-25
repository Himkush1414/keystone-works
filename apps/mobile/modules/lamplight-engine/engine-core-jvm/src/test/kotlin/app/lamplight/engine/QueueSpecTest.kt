package app.lamplight.engine

import org.json.JSONObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class QueueSpecTest {
    private fun seg(i: Int, text: String = "Sentence $i.") =
        """{"i":$i,"text":"$text","lang":"en","voice":"F1","pauseMs":140,"kind":"narration"}"""

    @Test
    fun `a partial queue keeps every index, with pending placeholders for what isn't built yet`() {
        val spec = QueueSpec.parse("""{"docId":"d","title":"t","count":6,"segments":[${seg(2)},${seg(3)}]}""")
        assertEquals(6, spec.segments.size)
        assertEquals((0 until 6).toList(), spec.segments.map { it.index })
        assertEquals("Sentence 2.", spec.segments[2].text)
        assertTrue(spec.segments[0].pending)
        assertTrue(spec.segments[5].pending)
        // A pending sentence is not silence: the player must wait for it, not skip it.
        assertFalse(spec.segments[5].isSilent)
    }

    @Test
    fun `a whole queue without a count reads as before, and an empty line is silence`() {
        val spec = QueueSpec.parse("""{"docId":"d","title":"t","segments":[${seg(0)},${seg(1, "")}]}""")
        assertEquals(2, spec.segments.size)
        assertFalse(spec.segments.any { it.pending })
        assertTrue(spec.segments[1].isSilent)
    }

    @Test
    fun `an update carries only the segments sent, never placeholders`() {
        val update = QueueSpec.parseSegments(JSONObject("""{"docId":"d","count":100,"segments":[${seg(40)},${seg(41)}]}"""))
        assertEquals(listOf(40, 41), update.map { it.index })
    }
}
