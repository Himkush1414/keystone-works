package app.lamplight.engine

import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.content.Context
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
    enum class Status { NOT_LOADED, LOADING, READY, FAILED }

    // Lazy: if ONNX Runtime's native library can't load, the failure is reported where it's used instead of
    // breaking every call into the module.
    private val env: OrtEnvironment by lazy { OrtEnvironment.getEnvironment() }
    private var sessions: Sessions? = null
    private var engine: Supertonic? = null
    private var voices: Map<String, VoiceStyle> = emptyMap()
    var config: EngineConfig? = null
        private set

    /** Thread count for inference; set from calibration (2 by default, 4 on fast phones). */
    @Volatile
    var threads: Int = defaultThreads()

    @Volatile var status = Status.NOT_LOADED
        private set
    /** Why the last load failed, while [status] is FAILED. */
    @Volatile var failure: EngineFailure? = null
        private set
    /** Milliseconds per step of the last load: each graph, the voices, the whole. */
    val loadTimings: Map<String, Long> get() = synchronized(timings) { LinkedHashMap(timings) }
    private val timings = LinkedHashMap<String, Long>()

    val runtimeVersion: String get() = runCatching { env.version }.getOrElse { "unavailable (${it.javaClass.simpleName}: ${it.message})" }

    @Synchronized
    fun engine(): Supertonic {
        engine?.let { return it }
        status = Status.LOADING
        EngineLog.i(TAG, "loading the voice model, threads=$threads")
        try {
            val t0 = System.nanoTime()
            synchronized(timings) { timings.clear() }
            fun <T> timed(label: String, block: () -> T): T {
                val t = System.nanoTime()
                return block().also { synchronized(timings) { timings[label] = (System.nanoTime() - t) / 1_000_000 } }
            }
            val opts = timed("runtime") { Supertonic.sessionOptions(threads) }
            fun session(name: String): OrtSession = timed(name) { loadSession("engine/$name.onnx", opts) }
            val s = Sessions(session("duration_predictor"), session("text_encoder"), session("vector_estimator"), session("vocoder"))
            val cfg = EngineConfig.parse(readAsset("engine/tts.json").toString(Charsets.UTF_8))
            val indexer = Assets.indexer(readAsset("engine/indexer.bin"))
            voices = timed("voices") { Assets.voices(readAsset("engine/voices.bin")).associateBy { it.id } }
            sessions = s
            config = cfg
            val ms = (System.nanoTime() - t0) / 1_000_000
            synchronized(timings) { timings["total"] = ms }
            return Supertonic(env, s, cfg, indexer).also {
                engine = it
                failure = null
                status = Status.READY
                EngineLog.i(TAG, "voice model ready in $ms ms (runtime $runtimeVersion, ${voices.size} voices)")
            }
        } catch (e: Throwable) {
            sessions?.close()
            sessions = null
            status = Status.FAILED
            failure = EngineFailure.of(e)
            EngineLog.e(TAG, "voice model failed to load", e)
            throw e
        }
    }

    /** Each file of the voice model in the APK: size, and whether it's stored uncompressed (memory-mappable). */
    fun modelFiles(): List<Map<String, Any>> = MODEL_FILES.map { name ->
        val path = "engine/$name"
        val stored = runCatching { context.assets.openFd(path).use { it.declaredLength } }.getOrNull()
        val size = stored ?: runCatching { context.assets.open(path).use { s -> var n = 0L; val b = ByteArray(1 shl 16); while (true) { val r = s.read(b); if (r < 0) break; n += r }; n } }.getOrNull()
        mapOf("name" to name, "bytes" to (size ?: -1L).toDouble(), "present" to (size != null), "stored" to (stored != null))
    }

    /** Where the model is read from: inside the installed APK. */
    val modelLocation: String get() = "${context.applicationInfo.sourceDir}!/assets/engine"

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
        if (status == Status.READY) status = Status.NOT_LOADED
        EngineLog.i(TAG, "voice model released")
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
            EngineLog.w(TAG, "$path is compressed in the APK; loading it into memory")
            env.createSession(readAsset(path), opts)
        }

    private fun readAsset(path: String): ByteArray = context.assets.open(path).use { it.readBytes() }

    companion object {
        private const val TAG = "LamplightEngine"
        private val MODEL_FILES = listOf(
            "duration_predictor.onnx", "text_encoder.onnx", "vector_estimator.onnx", "vocoder.onnx",
            "tts.json", "indexer.bin", "voices.bin",
        )

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
