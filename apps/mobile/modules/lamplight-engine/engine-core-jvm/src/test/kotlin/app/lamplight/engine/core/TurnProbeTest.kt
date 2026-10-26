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
import kotlin.math.log10
import kotlin.math.max

/**
 * How lines end at a hand-over. [Chunks.trim] stops 60 ms after the last sound above -50 dB, which can take
 * the end of the last word's decay and the breath after it; [Chunks.release] follows the sound down to
 * -62 dB. Measures, on real renders at Studio+, how much each keeps, how loud the part [Chunks.trim] cuts
 * was, and that keeping it adds no clipping, clicks or hiss.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class TurnProbeTest {
    private val dir = System.getProperty("lamplight.engine.dir")?.let(::File)
    private lateinit var sessions: Sessions
    private lateinit var engine: Supertonic
    private lateinit var voices: Map<String, VoiceStyle>
    private val sr = 44_100

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

    private val lines = listOf(
        Triple("Are you coming tonight?", "en", "F5"),
        Triple("I can't. I have to work late again.", "en", "M2"),
        Triple("Again?", "en", "F2"),
        Triple("You promised me you would be there.", "en", "F3"),
        Triple("Then it wasn't very civil of you to offer it.", "en", "M1"),
        Triple("Have some wine.", "en", "M3"),
        Triple("Your hair wants cutting.", "en", "M4"),
        Triple("The boats were coming in, one by one.", "en", "F1"),
        Triple("तुम कहाँ जा रहे हो?", "hi", "F5"),
        Triple("बाज़ार। जल्दी आ जाऊँगा।", "hi", "M2"),
        Triple("बेटा, क्या बिगाड़ के डर से ईमान की बात न कहोगे?", "hi", "F4"),
        Triple("मुझे बुलाकर क्या करोगी?", "hi", "M1"),
    )

    private fun db(x: FloatArray, from: Int, to: Int): Double {
        var peak = 0f
        for (i in from until to) peak = max(peak, kotlin.math.abs(x[i]))
        return if (peak <= 1e-9f) -120.0 else 20 * log10(peak.toDouble())
    }

    @Test
    fun `a line keeps its last word's decay before the next voice, and nothing is added to it`() {
        val out = System.getProperty("lamplight.probe.out")?.let { File(it, "release").apply { mkdirs() } }
        val extras = ArrayList<Int>()
        val peaks = ArrayList<Double>()
        for ((text, lang, voice) in lines) {
            val raw = engine.synthesize(text, lang, voices.getValue(voice), 16, 1.05f, false).samples
            val trimmed = Chunks.trim(raw, sr)
            val released = Chunks.release(raw, sr)
            // The release starts with exactly the trimmed audio (before trim's own fade) and is never shorter.
            assertTrue(released.size >= trimmed.size, "$text: release shorter than trim")
            val extra = released.size - trimmed.size
            extras.add(extra * 1000 / sr)
            // How loud the part trim drops was: the peak of what release keeps beyond trim's end.
            val peak = if (extra > 0) db(released, trimmed.size - sr * Chunks.TRAIL_KEEP_MS / 1000, released.size) else -120.0
            peaks.add(peak)
            val qt = Quality.measure(trimmed, sr)
            val qr = Quality.measure(released, sr)
            println("turn  %-48s %s +%3d ms  tail peak %6.1f dB | trim %s | release %s".format(
                text.take(48), voice, extra * 1000 / sr, peak, qt, qr,
            ))
            assertEquals(qt.clipped, qr.clipped, "$text: release adds clipping")
            assertTrue(qr.clicks <= qt.clicks, "$text: release adds clicks")
            assertTrue(qr.hfDb <= qt.hfDb + 0.5, "$text: release adds hiss (${qt.hfDb} → ${qr.hfDb})")
            out?.let {
                AudioWav.write(File(it, "${voice}-${text.hashCode().toUInt()}-trim.wav"), trimmed + FloatArray(sr / 2), sr)
                AudioWav.write(File(it, "${voice}-${text.hashCode().toUInt()}-release.wav"), released + FloatArray(sr / 2), sr)
            }
        }
        println("turn  release keeps %d ms more on average (max %d), the part trim cut peaked at %.1f dB on average".format(
            extras.average().toInt(), extras.max(), peaks.filter { it > -120 }.average(),
        ))
        assertTrue(extras.all { it <= Chunks.RELEASE_MAX_MS + Chunks.RELEASE_FADE_MS })
    }
}
