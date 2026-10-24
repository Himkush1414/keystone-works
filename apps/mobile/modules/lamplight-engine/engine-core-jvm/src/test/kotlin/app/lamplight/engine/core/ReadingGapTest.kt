package app.lamplight.engine.core

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * The gap between sentences on the long passage, on modelled phones (fast, mid-range, slow). Every pause the
 * listener hears must come from the text; rendering must never make them wait once narration has started.
 */
class ReadingGapTest {
    private val lines = Passage.lines()

    /** A phone whose render cost is `fixed + perStep * steps` per second of speech, plus a per-call overhead. */
    private class Phone(val name: String, val fixed: Double, val perStep: Double, val callMs: Long = 40)

    private val phones = listOf(
        Phone("fast", 0.03, 0.03),
        Phone("mid-range", 0.06, 0.07),
        Phone("slow", 0.10, 0.14),
    )

    private fun render(phone: Phone, pacing: Pacing?) = { piece: Piece, steps: Int ->
        val audio = piece.text.length * 66L
        val work = (audio * (phone.fixed + phone.perStep * steps)).toLong() + phone.callMs
        pacing?.record(steps, work, audio, piece.text.length)
        GapSim.Rendered(audio, work)
    }

    private fun estimate(line: GapSim.Line) = line.text.length * 1000L / 15

    @Test
    fun `no stalls after the first sentence on any phone`() {
        for (phone in phones) {
            val pacing = Pacing()
            val r = GapSim(lines, render(phone, pacing)).run(GapSim.paced(pacing, target = 8))
            val before = GapSim(lines, render(phone, null)).run(GapSim.fixed(8, estimate = ::estimate))
            println("reading gap [${phone.name}] paced: $r")
            assertEquals(0, r.stallCount, "${phone.name}: $r")
            assertTrue(r.firstAudioMs * 2 < before.firstAudioMs, "${phone.name}: first audio ${r.firstAudioMs} vs ${before.firstAudioMs} ms")
        }
    }

    @Test
    fun `before this change the mid-range and slow phones stalled`() {
        for (phone in phones) {
            val r = GapSim(lines, render(phone, null)).run(GapSim.fixed(8, estimate = ::estimate))
            println("reading gap [${phone.name}] fixed 8 steps, whole sentences: $r")
            if (phone.name != "fast") assertTrue(r.totalStallMs > 1_000, "${phone.name}: $r")
        }
    }

    @Test
    fun `a phone that can afford it reads at the target quality`() {
        val pacing = Pacing()
        val r = GapSim(lines, render(phones[0], pacing)).run(GapSim.paced(pacing, target = 12))
        val late = r.stepsUsed.drop(4)
        assertTrue(late.count { it == 12 } >= late.size * 3 / 4, "steps ${r.stepsUsed}")
    }
}
