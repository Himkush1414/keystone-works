package app.lamplight.engine.core

import ai.onnxruntime.OrtEnvironment
import org.json.JSONObject
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import java.io.File
import kotlin.math.abs
import kotlin.math.sqrt

/** Real-model tests. Skipped when the engine asset pack isn't available (gradle test -PskipModel). */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SupertonicTest {
    private val dir = System.getProperty("lamplight.engine.dir")?.let(::File)
    private lateinit var env: OrtEnvironment
    private lateinit var sessions: Sessions
    private lateinit var engine: Supertonic
    private lateinit var voices: Map<String, VoiceStyle>

    @BeforeAll
    fun load() {
        assumeTrue(dir != null && File(dir, "manifest.json").exists(), "engine assets not available")
        val d = dir!!
        env = OrtEnvironment.getEnvironment()
        val opts = Supertonic.sessionOptions(threads = 2)
        fun session(name: String) = env.createSession(File(d, "$name.onnx").absolutePath, opts)
        sessions = Sessions(session("duration_predictor"), session("text_encoder"), session("vector_estimator"), session("vocoder"))
        engine = Supertonic(
            env,
            sessions,
            EngineConfig.parse(File(d, "tts.json").readText()),
            Assets.indexer(File(d, "indexer.bin").readBytes()),
        )
        voices = Assets.voices(File(d, "voices.bin").readBytes()).associateBy { it.id }
    }

    @AfterAll
    fun close() {
        if (::sessions.isInitialized) sessions.close()
    }

    private fun rms(x: FloatArray) = sqrt(x.fold(0.0) { s, v -> s + v * v } / x.size)

    @Test
    fun `loads ten voices and the config`() {
        assertEquals(listOf("F1", "F2", "F3", "F4", "F5", "M1", "M2", "M3", "M4", "M5"), voices.keys.toList())
    }

    @Test
    fun `matches the TypeScript reference audio`() {
        val fixture = JSONObject(File(System.getProperty("lamplight.parity")).readText()).getJSONArray("synth")
        for (i in 0 until fixture.length()) {
            val c = fixture.getJSONObject(i)
            val r = engine.synthesize(c.getString("text"), c.getString("lang"), voices.getValue(c.getString("voice")), c.getInt("steps"))
            assertEquals(c.getInt("length"), r.samples.size, "length for ${c.getString("text")}")
            assertEquals(c.getDouble("rms"), rms(r.samples), 0.002, "rms")
            val head = c.getJSONArray("head")
            var maxDiff = 0.0
            for (k in 0 until head.length()) maxDiff = maxOf(maxDiff, abs(head.getDouble(k) - r.samples[2000 + k]))
            println("parity ${c.getString("voice")}/${c.getInt("steps")}: max sample diff $maxDiff")
            assertTrue(maxDiff < 0.02, "audio differs from reference by $maxDiff")
        }
    }

    @Test
    fun `is deterministic`() {
        val a = engine.synthesize("Same seed, same sound.", "en", voices.getValue("F3"), 4)
        val b = engine.synthesize("Same seed, same sound.", "en", voices.getValue("F3"), 4)
        assertTrue(a.samples.contentEquals(b.samples))
    }

    @Test
    fun `reports unknown characters instead of feeding them to the model`() {
        val (ids, dropped) = engine.tokenize("<en>Hi ✓</en>")
        assertTrue(ids.isNotEmpty())
        assertEquals(listOf("✓"), dropped)
    }

    @Test
    fun `measures real-time factor`() {
        val text = "The lamp was still burning when she reached the last page, and the rain had softened to a whisper."
        val voice = voices.getValue("M1")
        engine.synthesize("Warm up.", "en", voice, 4)
        for (steps in listOf(4, 8, 12)) {
            val t0 = System.nanoTime()
            val r = engine.synthesize(text, "en", voice, steps)
            val seconds = (System.nanoTime() - t0) / 1e9
            val rtf = seconds / (r.samples.size / r.sampleRate.toDouble())
            println("rtf steps=$steps audio=${r.durationMs}ms gen=${"%.2f".format(seconds)}s rtf=${"%.3f".format(rtf)}")
            assertTrue(r.durationMs in 3000..12000)
        }
    }
}
