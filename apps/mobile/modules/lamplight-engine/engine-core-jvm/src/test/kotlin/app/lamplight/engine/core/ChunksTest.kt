package app.lamplight.engine.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ChunksTest {
    @Test
    fun `a short sentence stays whole`() {
        val p = Chunks.split("Mr. Bennet made no answer.", "en")
        assertEquals(listOf(Piece("Mr. Bennet made no answer.", "en", 0)), p)
    }

    @Test
    fun `a long sentence is cut only at its own pauses, keeping every word`() {
        val text = Passage.lines().maxBy { it.text.length }.text
        val pieces = Chunks.split(text, "en")
        assertTrue(pieces.size >= 3, "${pieces.size} pieces")
        assertTrue(pieces.first().text.length <= Chunks.FIRST_MAX * 3 / 2)
        assertEquals(text.split(Regex("\\s+")), pieces.flatMap { it.text.split(Regex("\\s+")) })
        for (p in pieces.dropLast(1)) assertTrue(p.text.last() in ",;:—-", "cut after '${p.text.takeLast(12)}'")
        assertEquals(0, pieces.last().gapMs)
        assertTrue(pieces.dropLast(1).all { it.gapMs >= Chunks.COMMA_GAP_MS })
    }

    @Test
    fun `semicolons pause longer than commas`() {
        val text = "Mrs. Long says that Netherfield is taken by a young man of large fortune from the north of England; " +
            "that he came down on Monday in a chaise and four to see the place, and was so much delighted with it."
        val pieces = Chunks.split(text, "en")
        assertEquals(Chunks.CLAUSE_GAP_MS, pieces.first().gapMs)
    }

    @Test
    fun `language runs become pieces in their own voice language`() {
        val runs = listOf(Run("मैं इसे record कर लेता हूँ, ", "hi"), Run("so that I never forget it.", "en"))
        val pieces = Chunks.split("", "hi", runs)
        assertEquals(listOf("hi", "en"), pieces.map { it.lang })
        assertEquals(Chunks.COMMA_GAP_MS, pieces.first().gapMs)
        val bare = Chunks.split("", "hi", listOf(Run("उसने कहा", "hi"), Run("good night", "en")))
        assertEquals(Chunks.SWITCH_GAP_MS, bare.first().gapMs)
    }

    @Test
    fun `a sentence without breaks is cut at a space, never inside a word`() {
        val text = (1..60).joinToString(" ") { "word$it" }
        val pieces = Chunks.split(text, "en")
        assertTrue(pieces.size > 1)
        assertEquals(text, pieces.joinToString(" ") { it.text })
    }

    /** [ms] of silence, [speechMs] of a tone, then [ms] of silence again. */
    private fun padded(ms: Int, speechMs: Int): FloatArray {
        val sr = 44_100
        val pad = sr * ms / 1000
        val speech = sr * speechMs / 1000
        return FloatArray(pad * 2 + speech) { i -> if (i in pad until pad + speech) 0.3f * kotlin.math.sin(i * 0.05f) else 1e-6f }
    }

    @Test
    fun `trimming leaves the speech and a short quiet edge either side`() {
        val t = Chunks.trim(padded(600, 1000), 44_100)
        val ms = t.size * 1000 / 44_100
        assertTrue(ms in 1000..1000 + Chunks.LEAD_KEEP_MS + Chunks.TRAIL_KEEP_MS + 10, "kept $ms ms")
        assertEquals(0f, t[0])
        assertEquals(0f, t.last())
        val silent = FloatArray(4410)
        assertTrue(Chunks.trim(silent, 44_100) === silent)
    }

    @Test
    fun `a piece with no pause after it overlaps the next one, others pass through whole`() {
        val sr = 44_100
        val a = FloatArray(sr / 2) { 0.2f }
        val b = FloatArray(sr / 2) { 0.2f }
        val j = Chunks.Joiner(sr)
        val n = sr * Chunks.XFADE_MS / 1000
        val first = j.push(a, gapMs = 0, last = false)
        assertEquals(a.size - n, first.size)
        val second = j.push(b, gapMs = 0, last = true)
        assertEquals(b.size, second.size)
        assertEquals(a.size + b.size - n, first.size + second.size)
        val paused = Chunks.Joiner(sr)
        assertTrue(paused.push(a, gapMs = Chunks.COMMA_GAP_MS, last = false) === a)
    }
}
