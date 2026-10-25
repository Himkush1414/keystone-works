package app.lamplight.engine.core

import ai.onnxruntime.OrtEnvironment
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * A/B of the raw model output against each stage the player adds, at every step count the read-ahead can
 * choose (run with -Pprobe=1 -PprobeOut=<dir>; clips go to <dir>/ab).
 */
class AbProbeTest {
    @Test
    fun ab() {
        val d = System.getProperty("lamplight.engine.dir")?.let(::File)
        assumeTrue(d != null && File(d, "manifest.json").exists() && System.getProperty("lamplight.probe") != null)
        val env = OrtEnvironment.getEnvironment()
        val opts = Supertonic.sessionOptions(threads = 4)
        fun s(n: String) = env.createSession(File(d, "$n.onnx").absolutePath, opts)
        val e = Supertonic(env, Sessions(s("duration_predictor"), s("text_encoder"), s("vector_estimator"), s("vocoder")),
            EngineConfig.parse(File(d, "tts.json").readText()), Assets.indexer(File(d!!, "indexer.bin").readBytes()))
        val v = Assets.voices(File(d, "voices.bin").readBytes()).associateBy { it.id }
        val out = File(System.getProperty("lamplight.probe.out") ?: "build/probe", "ab").apply { mkdirs() }
        val sentences = listOf(
            "en1" to ("en" to "She walked slowly along the narrow path towards the little cottage, where a light was burning."),
            "en2" to ("en" to "I never thought I would see this house again, and yet here I am."),
            "hi1" to ("hi" to "मैं कल सुबह बाज़ार गया, और वहाँ मुझे मेरा पुराना दोस्त मिला।"),
        )
        val sr = 44_100
        // What the player does to a line, by the plan's typical values.
        val stages: List<Pair<String, (FloatArray) -> FloatArray>> = listOf(
            "raw" to { x -> x },
            "trim" to { x -> Chunks.trim(x, sr) },
            "wsola-identity" to { x -> Performance.shiftPitch(Chunks.trim(x, sr), sr, 0.01f, 1f) },
            "narration-var" to { x -> Performance.apply(Chunks.trim(x, sr), sr, 0f, false, 0L, 0.3f, 1.015f) },
            "sad" to { x -> Performance.apply(Chunks.trim(x, sr), sr, -2.5f, false, 0L, -1.5f, 0.9f) },
            "character-3st" to { x -> Performance.apply(Chunks.trim(x, sr), sr, 0f, false, 0L, -3f, 1f) },
        )
        val table = LinkedHashMap<String, MutableList<Quality.Report>>()
        for ((name, pair) in sentences) {
            val (lang, text) = pair
            for (voice in listOf("F1", "M2")) for (steps in listOf(2, 3, 4, 6, 8, 12, 16)) {
                val raw = e.synthesize(text, lang, v.getValue(voice), steps, 1.05f).samples
                for ((stage, f) in stages) {
                    val y = f(raw)
                    table.getOrPut("%-15s s%02d".format(stage, steps)) { ArrayList() }.add(Quality.measure(y, sr))
                    if (steps in setOf(3, 8, 16)) AudioWav.write(File(out, "$name-$voice-s%02d-$stage.wav".format(steps)), y, sr)
                }
            }
        }
        for ((k, rs) in table) {
            println("AB %s  clip %4.1f  clicks %5.1f  hf %6.1f dB  flat %.3f  harm %.3f  flux %.3f".format(
                k, rs.map { it.clipped }.average(), rs.map { it.clicks }.average(), rs.map { it.hfDb }.average(),
                rs.map { it.flatness }.average(), rs.map { it.harmonicity }.average(), rs.map { it.flux }.average(),
            ))
        }
    }
}
