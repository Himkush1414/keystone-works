package app.lamplight.engine

import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
import android.util.Log
import app.lamplight.engine.core.Assets
import app.lamplight.engine.core.EngineConfig
import app.lamplight.engine.core.Sessions
import app.lamplight.engine.core.Supertonic
import app.lamplight.engine.core.VoiceStyle
import java.io.FileInputStream
import java.nio.channels.FileChannel

/**
 * Owns the voice model: ONNX sessions memory-mapped straight from the APK (the .onnx assets are stored
 * uncompressed), voices, indexer and config. Loaded lazily on first use and released when idle so the app
 * gives memory back while it sits in the background.
 */
class EngineHost(private val context: Context) {
    private val env: OrtEnvironment = OrtEnvironment.getEnvironment()
    private var sessions: Sessions? = null
    private var engine: Supertonic? = null
    private var voices: Map<String, VoiceStyle> = emptyMap()
    var config: EngineConfig? = null
        private set

    /** Thread count for inference; set from calibration (2 by default, 4 on fast phones). */
    @Volatile
    var threads: Int = defaultThreads()

    @Synchronized
    fun engine(): Supertonic {
        engine?.let { return it }
        val t0 = System.nanoTime()
        val opts = Supertonic.sessionOptions(threads)
        fun session(name: String): OrtSession = loadSession("engine/$name.onnx", opts)
        val s = Sessions(session("duration_predictor"), session("text_encoder"), session("vector_estimator"), session("vocoder"))
        val cfg = EngineConfig.parse(readAsset("engine/tts.json").toString(Charsets.UTF_8))
        val indexer = Assets.indexer(readAsset("engine/indexer.bin"))
        voices = Assets.voices(readAsset("engine/voices.bin")).associateBy { it.id }
        sessions = s
        config = cfg
        return Supertonic(env, s, cfg, indexer).also {
            engine = it
            Log.i(TAG, "engine ready in ${(System.nanoTime() - t0) / 1_000_000} ms, threads=$threads")
        }
    }

    @Synchronized
    fun voice(id: String): VoiceStyle {
        engine()
        return voices[id] ?: voices.values.first()
    }

    @Synchronized
    fun voiceIds(): List<String> {
        engine()
        return voices.keys.toList()
    }

    val isLoaded: Boolean
        @Synchronized get() = engine != null

    /** Frees the model (~200 MB). The next synthesis loads it again. */
    @Synchronized
    fun release() {
        sessions?.close()
        sessions = null
        engine = null
        voices = emptyMap()
        Log.i(TAG, "engine released")
    }

    private fun loadSession(path: String, opts: OrtSession.SessionOptions): OrtSession =
        try {
            context.assets.openFd(path).use { fd ->
                FileInputStream(fd.fileDescriptor).channel.use { ch ->
                    val buf = ch.map(FileChannel.MapMode.READ_ONLY, fd.startOffset, fd.declaredLength)
                    env.createSession(buf, opts)
                }
            }
        } catch (e: java.io.FileNotFoundException) {
            // Compressed asset (should not happen with noCompress): fall back to reading it into memory.
            Log.w(TAG, "$path is compressed in the APK; loading into memory")
            env.createSession(readAsset(path), opts)
        }

    private fun readAsset(path: String): ByteArray = context.assets.open(path).use { it.readBytes() }

    companion object {
        private const val TAG = "LamplightEngine"

        fun defaultThreads(): Int {
            val cores = Runtime.getRuntime().availableProcessors()
            return when {
                cores >= 8 -> 4
                cores >= 6 -> 3
                else -> 2
            }
        }
    }
}
