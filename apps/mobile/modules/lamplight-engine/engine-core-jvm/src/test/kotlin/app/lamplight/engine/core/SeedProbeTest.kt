package app.lamplight.engine.core

import ai.onnxruntime.OrtEnvironment
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import java.io.File

/**
 * Is there prosody to be had from the model itself? The flow-matching noise is seeded per sentence
 * ([Seed.forSentence]); another seed is another "take" of the same words. Renders five takes of each line
 * (the text plus trailing spaces, which the model never sees) and measures how much intonation range,
 * median pitch and length differ between takes, and whether any take is less clean. Run with -Pprobe=1.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SeedProbeTest {
    private val dir = System.getProperty("lamplight.engine.dir")?.let(::File)
    private lateinit var sessions: Sessions
    private lateinit var engine: Supertonic
    private lateinit var voices: Map<String, VoiceStyle>
    private val sr = 44_100

    @BeforeAll
    fun load() {
        assumeTrue(System.getProperty("lamplight.probe") != null, "probe only")
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

    @Test
    fun `takes of the same line differ in intonation by how much`() {
        val lines = listOf(
            Triple("Do not you want to know who has taken it?", "en", "F5"),
            Triple("It wasn't very civil of you to sit down without being invited.", "en", "M2"),
            Triple("The boats were coming in, one by one.", "en", "F1"),
            Triple("You promised me you would be there!", "en", "F3"),
            Triple("बेटा, क्या बिगाड़ के डर से ईमान की बात न कहोगे?", "hi", "F4"),
            Triple("तुम डरना नहीं अम्माँ, मैं सबसे पहले आऊँगा।", "hi", "M2"),
        )
        val out = System.getProperty("lamplight.probe.out")?.let { File(it, "takes").apply { mkdirs() } }
        for ((text, lang, voice) in lines) {
            val takes = (0 until 5).map { k ->
                val x = Chunks.trim(engine.synthesize(text + " ".repeat(k), lang, voices.getValue(voice), 16, 1.05f, false).samples, sr)
                out?.let { AudioWav.write(File(it, "$voice-${text.hashCode().toUInt()}-take$k.wav"), x, sr) }
                Prosody.profile(x, sr) to Quality.measure(x, sr)
            }
            val ranges = takes.map { it.first.f0Range }
            val medians = takes.map { it.first.f0Median }
            val lengths = takes.map { it.first.totalMs }
            println("takes %-50s %s range %.1f–%.1f st  median %d–%d Hz  length %d–%d ms  harm %.3f–%.3f  hf %.1f–%.1f dB".format(
                text.take(50), voice, ranges.min(), ranges.max(), medians.min().toInt(), medians.max().toInt(),
                lengths.min(), lengths.max(), takes.minOf { it.second.harmonicity }, takes.maxOf { it.second.harmonicity },
                takes.minOf { it.second.hfDb }, takes.maxOf { it.second.hfDb },
            ))
        }
    }
}
