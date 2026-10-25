package app.lamplight.engine.core

import ai.onnxruntime.OrtEnvironment
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import java.io.File

/** Exploratory: what each Supertonic 3 expression tag does to our model's audio (run with -Dlamplight.probe=1). */
class TagProbeTest {
    @Test
    fun probe() {
        val d = System.getProperty("lamplight.engine.dir")?.let(::File)
        assumeTrue(d != null && File(d, "manifest.json").exists() && System.getProperty("lamplight.probe") != null)
        val env = OrtEnvironment.getEnvironment()
        val opts = Supertonic.sessionOptions(threads = 4)
        fun s(n: String) = env.createSession(File(d, "$n.onnx").absolutePath, opts)
        val e = Supertonic(env, Sessions(s("duration_predictor"), s("text_encoder"), s("vector_estimator"), s("vocoder")),
            EngineConfig.parse(File(d, "tts.json").readText()), Assets.indexer(File(d!!, "indexer.bin").readBytes()))
        val v = Assets.voices(File(d, "voices.bin").readBytes()).associateBy { it.id }
        val tags = listOf("", "<laugh>", "<breath>", "<sigh>", "<surprise>", "<scream>", "<throatclear>", "<sad>", "<angry>", "<cough>", "<yawn>", "laugh")
        val lines = listOf("en" to "I really did not expect to see you here tonight.", "hi" to "मुझे सच में उम्मीद नहीं थी कि तुम आज रात यहाँ मिलोगे।")
        val out = File(System.getProperty("lamplight.probe.out") ?: "build/probe").apply { mkdirs() }
        for ((lang, text) in lines) for (voice in listOf("F1", "M2")) for (tag in tags) {
            val t = if (tag.isEmpty()) text else "$tag $text"
            var sum: Prosody.Profile? = null
            val r = e.synthesize(t, lang, v.getValue(voice), 8)
            val speech = Chunks.trim(r.samples, r.sampleRate)
            sum = Prosody.profile(speech, r.sampleRate)
            val dropped = r.dropped
            println("TAG $lang $voice %-14s total %5d ms voiced %5d ms f0 %5.0f Hz range %4.1f st rms %5.1f dB zcrHead %.3f dropped $dropped".format(
                tag.ifEmpty { "(none)" }, sum.totalMs, sum.voicedMs, sum.f0Median, sum.f0Range, sum.rmsDb,
                Prosody.zcr(speech.copyOfRange(0, minOf(speech.size, r.sampleRate * 6 / 10))),
            ))
            AudioWav.write(File(out, "$lang-$voice-${tag.trim('<', '>').ifEmpty { "none" }}.wav"), speech, r.sampleRate)
        }
    }
}

object AudioWav {
    fun write(f: File, x: FloatArray, sr: Int) {
        val data = java.nio.ByteBuffer.allocate(44 + x.size * 2).order(java.nio.ByteOrder.LITTLE_ENDIAN)
        data.put("RIFF".toByteArray()).putInt(36 + x.size * 2).put("WAVE".toByteArray()).put("fmt ".toByteArray())
            .putInt(16).putShort(1).putShort(1).putInt(sr).putInt(sr * 2).putShort(2).putShort(16)
            .put("data".toByteArray()).putInt(x.size * 2)
        x.forEach { data.putShort((it.coerceIn(-1f, 1f) * 32767).toInt().toShort()) }
        f.writeBytes(data.array())
    }
}
