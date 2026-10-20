package app.lamplight.engine.core

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import java.nio.FloatBuffer
import java.nio.LongBuffer
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Audio produced for one sentence. */
class Synthesis(val samples: FloatArray, val sampleRate: Int, val dropped: List<String>) {
    val durationMs: Long get() = samples.size * 1000L / sampleRate
}

/** The four ONNX graphs of Supertonic 3. */
class Sessions(
    val durationPredictor: OrtSession,
    val textEncoder: OrtSession,
    val vectorEstimator: OrtSession,
    val vocoder: OrtSession,
) : AutoCloseable {
    override fun close() {
        durationPredictor.close()
        textEncoder.close()
        vectorEstimator.close()
        vocoder.close()
    }
}

/**
 * Supertonic 3 text-to-speech on ONNX Runtime: text ids → duration → text embedding → N flow-matching steps
 * → vocoder. Mirrors packages/engine-web/src/engine.ts. Not thread-safe: one renderer thread owns an instance.
 */
class Supertonic(
    private val env: OrtEnvironment,
    private val sessions: Sessions,
    private val config: EngineConfig,
    private val indexer: ShortArray,
) {
    /** Token ids for model-ready text; unknown characters are dropped and reported. */
    fun tokenize(prepared: String): Pair<LongArray, List<String>> {
        val ids = ArrayList<Long>(prepared.length)
        val dropped = LinkedHashSet<String>()
        var i = 0
        while (i < prepared.length) {
            val cp = prepared.codePointAt(i)
            val id = if (cp < indexer.size) indexer[cp].toInt() else -1
            if (id >= 0) ids.add(id.toLong()) else dropped.add(String(Character.toChars(cp)))
            i += Character.charCount(cp)
        }
        return ids.toLongArray() to dropped.toList()
    }

    /**
     * Synthesises [text] (already normalised for speech) in [lang] with [voice] using [steps] flow-matching
     * steps. [rate] is the speaking rate baked into the audio; playback speed is applied by the player.
     */
    fun synthesize(text: String, lang: String, voice: VoiceStyle, steps: Int, rate: Float = 1.05f): Synthesis {
        val prepared = Prepare.forModel(text, lang)
        val (ids, dropped) = tokenize(prepared)
        val n = ids.size.toLong()
        val opened = ArrayList<AutoCloseable>()
        fun <T : AutoCloseable> T.tracked(): T = also { opened.add(it) }
        try {
            val textIds = OnnxTensor.createTensor(env, LongBuffer.wrap(ids), longArrayOf(1, n)).tracked()
            val textMask = OnnxTensor.createTensor(env, FloatBuffer.wrap(FloatArray(ids.size) { 1f }), longArrayOf(1, 1, n)).tracked()
            val styleTtl = OnnxTensor.createTensor(env, FloatBuffer.wrap(voice.ttl.data), voice.ttl.dims).tracked()
            val styleDp = OnnxTensor.createTensor(env, FloatBuffer.wrap(voice.dp.data), voice.dp.dims).tracked()

            val rawSeconds = sessions.durationPredictor.run(
                mapOf("text_ids" to textIds, "style_dp" to styleDp, "text_mask" to textMask),
            ).tracked().use { r -> (r.get("duration").get() as OnnxTensor).floatBuffer.get(0) }
            val seconds = max(0.05f, rawSeconds / rate)

            val te = sessions.textEncoder.run(
                mapOf("text_ids" to textIds, "style_ttl" to styleTtl, "text_mask" to textMask),
            ).tracked()
            val textEmb = te.get("text_emb").get() as OnnxTensor

            val chunk = config.baseChunkSize * config.chunkCompressFactor
            val wavLen = (seconds * config.sampleRate).roundToInt()
            val t = max(1, ceil(wavLen.toDouble() / chunk).toInt())
            val d = config.latentDim * config.chunkCompressFactor
            var latent = Seed.gaussian(FloatArray(d * t), Seed.forSentence(text, voice.id, steps))
            val latentShape = longArrayOf(1, d.toLong(), t.toLong())
            val latentMask = OnnxTensor.createTensor(env, FloatBuffer.wrap(FloatArray(t) { 1f }), longArrayOf(1, 1, t.toLong())).tracked()
            val total = OnnxTensor.createTensor(env, FloatBuffer.wrap(floatArrayOf(steps.toFloat())), longArrayOf(1)).tracked()
            for (k in 0 until steps) {
                OnnxTensor.createTensor(env, FloatBuffer.wrap(latent), latentShape).use { noisy ->
                    OnnxTensor.createTensor(env, FloatBuffer.wrap(floatArrayOf(k.toFloat())), longArrayOf(1)).use { current ->
                        sessions.vectorEstimator.run(
                            mapOf(
                                "noisy_latent" to noisy,
                                "text_emb" to textEmb,
                                "style_ttl" to styleTtl,
                                "text_mask" to textMask,
                                "latent_mask" to latentMask,
                                "total_step" to total,
                                "current_step" to current,
                            ),
                        ).use { r ->
                            val out = (r.get("denoised_latent").get() as OnnxTensor).floatBuffer
                            latent = FloatArray(out.remaining()).also { out.get(it) }
                        }
                    }
                }
            }
            val wav = OnnxTensor.createTensor(env, FloatBuffer.wrap(latent), latentShape).use { lat ->
                sessions.vocoder.run(mapOf("latent" to lat)).use { r ->
                    val buf = (r.get("wav_tts").get() as OnnxTensor).floatBuffer
                    val len = min(buf.remaining(), wavLen)
                    FloatArray(len).also { buf.get(it) }
                }
            }
            return Synthesis(wav, config.sampleRate, dropped)
        } finally {
            opened.asReversed().forEach { runCatching { it.close() } }
        }
    }

    companion object {
        /** Session options tuned for phones: bounded threads, full graph optimisation, no spinning. */
        fun sessionOptions(threads: Int): OrtSession.SessionOptions = OrtSession.SessionOptions().apply {
            setIntraOpNumThreads(threads)
            setInterOpNumThreads(1)
            setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
            addConfigEntry("session.intra_op.allow_spinning", "0")
        }
    }
}
