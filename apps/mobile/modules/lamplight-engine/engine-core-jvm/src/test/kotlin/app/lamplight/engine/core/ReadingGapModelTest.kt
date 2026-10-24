package app.lamplight.engine.core

import ai.onnxruntime.OrtEnvironment
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import java.io.File

/**
 * The reading-gap test with the real model: every piece is actually rendered on this machine, and its render
 * time is scaled to stand in for slower phones. Prints the numbers; asserts no stall after the first sentence.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ReadingGapModelTest {
    private val dir = System.getProperty("lamplight.engine.dir")?.let(::File)
    private lateinit var sessions: Sessions
    private lateinit var engine: Supertonic
    private lateinit var voice: VoiceStyle
    private val measured = HashMap<Pair<Piece, Int>, Pair<Long, Long>>()

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
    fun `real renders, scaled to slower phones, never stall`() {
        val lines = Passage.lines()
        for (slowdown in listOf(1.0, 3.0, 6.0, 10.0)) {
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
            println("reading gap (real model, ${slowdown}x this machine's render time)")
            println("  before (fixed 8 steps, whole sentences): $fixed")
            println("  after  (paced, cut at clause breaks):    $paced")
            assertEquals(0, paced.stallCount, "slowdown $slowdown: $paced")
        }
    }
}
