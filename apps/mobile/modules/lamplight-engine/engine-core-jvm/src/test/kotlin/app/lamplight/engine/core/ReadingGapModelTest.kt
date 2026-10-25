package app.lamplight.engine.core

import ai.onnxruntime.OrtEnvironment
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import java.io.File

/**
 * The reading-gap test with the real model: every piece is actually rendered on this machine, and its render
 * time is scaled to stand in for phones of known speed, named by how long an 8-step render takes relative to
 * the speech (0.3x is a fast phone; 1.5x can't keep up at 8 steps at all). Scaling from this machine's own
 * measured speed keeps the result the same on a laptop and a CI runner. Prints the numbers; asserts no stall.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ReadingGapModelTest {
    private val dir = System.getProperty("lamplight.engine.dir")?.let(::File)
    private lateinit var sessions: Sessions
    private lateinit var engine: Supertonic
    private lateinit var voice: VoiceStyle
    private val measured = HashMap<Pair<Piece, Int>, Pair<Long, Long>>()
    private var rtf8 = 0.0

    @BeforeAll
    fun load() {
        assumeTrue(dir != null && File(dir, "manifest.json").exists(), "engine assets not available")
        val d = dir!!
        val env = OrtEnvironment.getEnvironment()
        val opts = Supertonic.sessionOptions(threads = 2)
        fun session(name: String) = env.createSession(File(d, "$name.onnx").absolutePath, opts)
        sessions = Sessions(session("duration_predictor"), session("text_encoder"), session("vector_estimator"), session("vocoder"))
        engine = Supertonic(env, sessions, EngineConfig.parse(File(d, "tts.json").readText()), Assets.indexer(File(d, "indexer.bin").readBytes()))
        voice = Assets.voices(File(d, "voices.bin").readBytes()).first { it.id == "F1" }
        engine.synthesize("Warm up.", "en", voice, 2)
        val sample = Piece("It is a truth universally acknowledged, that a single man must be in want of a wife.", "en", 0)
        rtf8 = (1..2).map { measure(sample.copy(gapMs = it), 8).let { (audio, work) -> work.toDouble() / audio } }.min()
    }

    @AfterAll
    fun close() {
        if (::sessions.isInitialized) sessions.close()
    }

    /** Renders once per piece and step count; returns (speech ms, work ms on this machine). */
    private fun measure(piece: Piece, steps: Int): Pair<Long, Long> = measured.getOrPut(piece to steps) {
        val t0 = System.nanoTime()
        val r = engine.synthesize(piece.text, piece.lang, voice, steps)
        r.durationMs to (System.nanoTime() - t0) / 1_000_000
    }

    @Test
    fun `real renders, scaled to slower phones, never stall while the floor fits`() {
        val lines = Passage.lines()
        println("this machine renders 8 steps at ${"%.2f".format(rtf8)}x real time")
        for (phone in listOf(0.3, 0.6, 1.0, 1.5, 2.5)) {
            val slowdown = phone / rtf8
            val pacing = Pacing()
            val paced = GapSim(lines) { p, s ->
                val (audio, work) = measure(p, s)
                val w = (work * slowdown).toLong()
                pacing.record(s, w, audio, p.text.length)
                GapSim.Rendered(audio, w)
            }.run(GapSim.paced(pacing, target = 8))
            val fixed = GapSim(lines) { p, s ->
                val (audio, work) = measure(p, s)
                GapSim.Rendered(audio, (work * slowdown).toLong())
            }.run(GapSim.fixed(8) { it.text.length * 1000L / 15 })
            println("reading gap (real model, a phone rendering 8 steps at ${phone}x real time)")
            println("  before (fixed 8 steps, whole sentences): $fixed")
            println("  after  (paced, cut at clause breaks):    $paced")
            assertTrue(paced.stepsUsed.all { it >= ReadAhead.FLOOR_STEPS }, "phone ${phone}x: steps ${paced.stepsUsed}")
            // A phone slower than real time at the floor waits between sentences rather than break the voice.
            if (phone <= 1.0) assertEquals(0, paced.stallCount, "phone ${phone}x: $paced")
        }
    }
}
