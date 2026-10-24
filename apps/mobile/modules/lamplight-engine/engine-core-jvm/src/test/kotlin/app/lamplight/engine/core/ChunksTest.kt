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

    @Test
    fun `edges fade only where pieces meet`() {
        val s = FloatArray(1000) { 1f }
        assertTrue(Chunks.fadeEdges(s, 44_100, fadeIn = false, fadeOut = false) === s)
        val f = Chunks.fadeEdges(s, 44_100, fadeIn = true, fadeOut = false)
        assertEquals(0f, f[0])
        assertEquals(1f, f.last())
    }
}
