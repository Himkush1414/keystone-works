package app.lamplight.engine.core

import ai.onnxruntime.OrtEnvironment
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import java.io.File
import kotlin.math.ln

/**
 * Renders one line per emotion with the values perform/plan.ts gives it at full intensity (pace, loudness,
 * pitch), through the same steps as the player, and measures what came out: pitch, loudness, speaking time.
 * Writes the clips to -PprobeOut for listening.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class DeliveryScanTest {
    private val dir = System.getProperty("lamplight.engine.dir")?.let(::File)
    private lateinit var sessions: Sessions
    private lateinit var engine: Supertonic
    private lateinit var voices: Map<String, VoiceStyle>

    /** PROSODY in plan.ts at intensity 1: rate, gain dB, pitch semitones. */
    private val plan = linkedMapOf(
        "neutral" to Triple(1f, 0f, 0f),
        "sad" to Triple(0.9f, -2.5f, -1.5f),
        "whisper" to Triple(0.9f, -7f, -1f),
        "excited" to Triple(1.07f, 1f, 1.5f),
        "shout" to Triple(1.04f, 3f, 2f),
    )

    @BeforeAll
    fun load() {
        assumeTrue(dir != null && File(dir, "manifest.json").exists(), "engine assets not available")
        val d = dir!!
        val env = OrtEnvironment.getEnvironment()
        val opts = Supertonic.sessionOptions(threads = 4)
        fun session(name: String) = env.createSession(File(d, "$name.onnx").absolutePath, opts)
        sessions = Sessions(session("duration_predictor"), session("text_encoder"), session("vector_estimator"), session("vocoder"))
        engine = Supertonic(env, sessions, EngineConfig.parse(File(d, "tts.json").readText()), Assets.indexer(File(d, "indexer.bin").readBytes()))
        voices = Assets.voices(File(d, "voices.bin").readBytes()).associateBy { it.id }
    }

    @AfterAll
    fun close() {
        if (::sessions.isInitialized) sessions.close()
    }

    private fun semis(a: Double, b: Double) = 12 * ln(a / b) / ln(2.0)

    @Test
    fun `each emotion comes out at its own pitch, loudness and pace`() {
        val out = System.getProperty("lamplight.probe.out")?.let { File(it, "delivery").apply { mkdirs() } }
        val lines = listOf("en" to "I never thought I would see this house again.", "hi" to "मैंने कभी नहीं सोचा था कि यह घर फिर से देखूँगा।")
        for ((lang, text) in lines) for (voice in listOf("F1", "M2")) {
            val measured = plan.mapValues { (name, p) ->
                val (rate, gain, pitch) = p
                val raw = engine.synthesize(text, lang, voices.getValue(voice), 8, 1.05f)
                val speech = Chunks.trim(raw.samples, raw.sampleRate)
                val heard = Performance.apply(speech, raw.sampleRate, gain, false, 0L, pitch, rate)
                out?.let { AudioWav.write(File(it, "$lang-$voice-$name.wav"), heard, raw.sampleRate) }
                Prosody.profile(speech, raw.sampleRate) to Prosody.profile(heard, raw.sampleRate)
            }
            val n = measured.getValue("neutral").second
            for ((name, pair) in measured) {
                val (model, m) = pair
                println("delivery  $lang $voice %-8s pitch %+5.1f st (shift %+4.1f, model %+4.1f)  loudness %+5.1f dB  length %4d ms (%+3d%%)".format(
                    name, semis(m.f0Median, n.f0Median), semis(m.f0Median, model.f0Median), semis(model.f0Median, n.f0Median),
                    m.rmsDb - n.rmsDb, m.totalMs, (m.totalMs * 100 / n.totalMs) - 100,
                ))
            }
            // Every emotion is the same render, so the model's own pitch can't swamp the shift. The detector
            // reads real speech to about ±0.7 st (low, creaky voices are hardest); PerformanceTest checks the
            // shift itself to 3% on a clean tone.
            for ((name, p) in plan) {
                val (model, m) = measured.getValue(name)
                val shift = semis(m.f0Median, model.f0Median)
                assertTrue(kotlin.math.abs(shift - p.third) < 0.7, "$lang $voice $name shift $shift, want ${p.third}")
            }
            val sad = measured.getValue("sad").second
            val excited = measured.getValue("excited").second
            assertTrue(sad.totalMs > n.totalMs * 1.08 && excited.totalMs < n.totalMs * 0.96, "$lang $voice pace")
            assertTrue(measured.getValue("whisper").second.rmsDb < n.rmsDb - 4, "$lang $voice whisper loudness")
        }
    }
}
