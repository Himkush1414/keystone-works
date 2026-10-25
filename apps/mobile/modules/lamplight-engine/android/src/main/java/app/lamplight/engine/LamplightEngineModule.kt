package app.lamplight.engine

import android.Manifest
import android.app.ActivityManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.media.AudioManager
import android.os.Build
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Handler
import android.os.Looper
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.DataOutputStream
import java.io.File
import java.io.FileOutputStream
import kotlin.math.roundToInt

/** JavaScript API of the narration engine (see ../../index.ts for the typed wrapper). */
@UnstableApi
class LamplightEngineModule : Module() {
    private val context get() = requireNotNull(appContext.reactContext) { "React context unavailable" }
    private val controller get() = PlaybackController.get(context)
    private var mediaController: ListenableFuture<MediaController>? = null
    private var preview: AudioTrack? = null
    private val lexicon by lazy { Lexicon(context.applicationContext) }

    private val listener = object : PlaybackController.Listener {
        override fun onState(state: Map<String, Any?>) = sendEvent("onState", state)
        override fun onProgress(index: Int, positionMs: Long) =
            sendEvent("onProgress", mapOf("index" to index, "positionMs" to positionMs))
        override fun onSentence(index: Int, durationMs: Long) =
            sendEvent("onSentence", mapOf("index" to index, "durationMs" to durationMs))
        override fun onRender(docId: String, done: Int, total: Int) =
            sendEvent("onRender", mapOf("docId" to docId, "done" to done, "total" to total))
        override fun onError(code: String, message: String) =
            sendEvent("onError", mapOf("code" to code, "message" to message))
    }

    override fun definition() = ModuleDefinition {
        Name("LamplightEngine")

        Events("onState", "onProgress", "onSentence", "onRender", "onError")

        OnStartObserving { controller.addListener(listener) }
        OnStopObserving { controller.removeListener(listener) }

        AsyncFunction("initialize") {
            controller.host.engine()
            mapOf(
                "voices" to controller.host.voiceIds(),
                "sampleRate" to PlaybackController.SAMPLE_RATE,
                "threads" to controller.host.threads,
                "liveSteps" to controller.liveSteps,
                "studioSteps" to controller.studioSteps,
                "modelVersion" to PlaybackController.MODEL_VERSION,
            )
        }

        AsyncFunction("calibrate") { controller.calibrate() }

        AsyncFunction("loadQueue") { path: String, startIndex: Int, startMs: Double, speed: Double, quality: String ->
            val spec = QueueSpec.parse(File(path).readText())
            connectSession()
            controller.load(spec, startIndex, startMs.toLong(), speed.toFloat(), parseQuality(quality))
        }

        AsyncFunction("fillSegments") { json: String ->
            controller.fillSegments(QueueSpec.parseSegments(org.json.JSONObject(json)))
        }

        AsyncFunction("updateSegments") { json: String ->
            // Only the segments sent: the file's `count` would otherwise stand pending placeholders over the rest.
            val segments = QueueSpec.parseSegments(org.json.JSONObject(json))
            val from = segments.minOfOrNull { it.index } ?: return@AsyncFunction
            controller.updateSegments(from, segments)
        }

        // Resolves once narration has started, or rejects with the reason it can't (code + plain message).
        AsyncFunction("play") { promise: Promise ->
            runOnMain {
                val failure = try {
                    controller.play()
                } catch (e: Throwable) {
                    EngineFailure.of(e)
                }
                if (failure == null) promise.resolve(null) else promise.reject(CodedException(failure.code, failure.message, null))
            }
        }
        AsyncFunction("pause") { runOnMain { controller.pause() } }
        AsyncFunction("stop") { runOnMain { controller.stop() } }
        AsyncFunction("seekTo") { index: Int -> controller.seekTo(index) }
        AsyncFunction("playFrom") { index: Int, promise: Promise ->
            runOnMain {
                val failure = try {
                    controller.playFrom(index)
                } catch (e: Throwable) {
                    EngineFailure.of(e)
                }
                if (failure == null) promise.resolve(null) else promise.reject(CodedException(failure.code, failure.message, null))
            }
        }

        AsyncFunction("getDiagnostics") { diagnostics() }
        AsyncFunction("runVoiceTest") { runVoiceTest() }
        AsyncFunction("skip") { delta: Int -> controller.skip(delta) }
        AsyncFunction("skipChapter") { delta: Int -> controller.skipChapter(delta) }
        AsyncFunction("setSpeed") { speed: Double -> controller.setPlaybackSpeed(speed.toFloat()) }
        AsyncFunction("setQuality") { quality: String -> controller.setQuality(parseQuality(quality)) }
        AsyncFunction("setSleepTimer") { minutes: Double?, endOfChapter: Boolean ->
            runOnMain { controller.setSleepTimer(minutes, endOfChapter) }
        }

        AsyncFunction("prepareOffline") { path: String, quality: String, chargingOnly: Boolean ->
            controller.prepareOffline(QueueSpec.parse(File(path).readText()), parseQuality(quality), chargingOnly)
        }
        AsyncFunction("cancelPrepare") { docId: String -> controller.cancelPrepare(docId) }

        AsyncFunction("getState") { controller.snapshot() }
        AsyncFunction("lastPosition") { controller.lastPosition() }
        AsyncFunction("cacheBytes") { controller.cacheBytes().toDouble() }
        AsyncFunction("clearCache") { controller.clearCache() }

        AsyncFunction("previewVoice") { text: String, lang: String, voice: String, steps: Int ->
            val audio = controller.host.engine().synthesize(text, lang, controller.host.voice(voice), steps)
            runOnMain {
                if (controller.playing) controller.pause()
                playPreview(audio.samples, audio.sampleRate)
            }
            audio.durationMs.toDouble()
        }
        AsyncFunction("stopPreview") { runOnMain { stopPreview() } }
        AsyncFunction("lookupWord") { request: String -> lexicon.lookup(request) }
        AsyncFunction("warmDictionary") { lexicon.warm() }

        AsyncFunction("synthesizeToFile") { text: String, lang: String, voice: String, steps: Int, path: String ->
            val audio = controller.host.engine().synthesize(text, lang, controller.host.voice(voice), steps)
            writeWav(File(path), audio.samples, audio.sampleRate)
            audio.durationMs.toDouble()
        }

        AsyncFunction("openPdf") { path: String, password: String? ->
            try {
                PdfText.open(context, path, password)
            } catch (e: PdfText.PdfError) {
                throw CodedException(e.code, e.message ?: e.code, e)
            }
        }
        AsyncFunction("pdfPages") { handle: Int, from: Int, to: Int ->
            try {
                PdfText.pages(handle, from, to)
            } catch (e: PdfText.PdfError) {
                throw CodedException(e.code, e.message ?: e.code, e)
            }
        }
        AsyncFunction("closePdf") { handle: Int -> PdfText.close(handle) }

        OnDestroy {
            controller.removeListener(listener)
            mediaController?.let { MediaController.releaseFuture(it) }
            stopPreview()
        }
    }

    /** Everything the Diagnostics screen shows; each part is read on its own so one failure can't hide the rest. */
    private fun diagnostics(): Map<String, Any?> {
        val host = controller.host
        val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val activity = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val mem = ActivityManager.MemoryInfo().also { activity.getMemoryInfo(it) }
        val pkg = runCatching { context.packageManager.getPackageInfo(context.packageName, 0) }.getOrNull()
        fun part(block: () -> Any?): Any? = try {
            block()
        } catch (e: Throwable) {
            "unavailable: ${e.javaClass.simpleName}: ${e.message}"
        }
        return mapOf(
            "engine" to part {
                mapOf(
                    "status" to host.status.name.lowercase(),
                    "error" to host.failure?.toMap(),
                    "runtimeVersion" to host.runtimeVersion,
                    "threads" to host.threads,
                    "loadTimings" to host.loadTimings,
                    "modelVersion" to PlaybackController.MODEL_VERSION,
                    "modelLocation" to host.modelLocation,
                    "modelFiles" to host.modelFiles(),
                )
            },
            "player" to part { controller.snapshot() + controller.diagnostics() },
            "volume" to part {
                mapOf(
                    "media" to am.getStreamVolume(AudioManager.STREAM_MUSIC),
                    "max" to am.getStreamMaxVolume(AudioManager.STREAM_MUSIC),
                    "muted" to am.isStreamMute(AudioManager.STREAM_MUSIC),
                )
            },
            "device" to part {
                mapOf(
                    "manufacturer" to Build.MANUFACTURER,
                    "model" to Build.MODEL,
                    "android" to Build.VERSION.RELEASE,
                    "sdk" to Build.VERSION.SDK_INT,
                    "abis" to Build.SUPPORTED_ABIS.toList(),
                    "is64Bit" to android.os.Process.is64Bit(),
                    "cores" to Runtime.getRuntime().availableProcessors(),
                    "memoryClassMb" to activity.memoryClass,
                    "totalMemMb" to mem.totalMem / (1 shl 20),
                    "availMemMb" to mem.availMem / (1 shl 20),
                    "lowRam" to activity.isLowRamDevice,
                )
            },
            "app" to part {
                mapOf(
                    "version" to pkg?.versionName,
                    "debuggable" to ((context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0),
                    "notifications" to (Build.VERSION.SDK_INT < 33 ||
                        context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED),
                )
            },
            "log" to EngineLog.tail(50),
        )
    }

    /** Speaks one short sentence through the real engine and the speaker, timing each stage. */
    private fun runVoiceTest(): Map<String, Any?> {
        val t0 = System.nanoTime()
        return try {
            val engine = controller.host.engine()
            val loadMs = (System.nanoTime() - t0) / 1_000_000
            val t1 = System.nanoTime()
            val audio = engine.synthesize("This is Lamplight, reading to you.", "en", controller.host.voice("F1"), 4)
            val renderMs = (System.nanoTime() - t1) / 1_000_000
            runOnMain {
                if (controller.playing) controller.pause()
                playPreview(audio.samples, audio.sampleRate)
            }
            EngineLog.i("LamplightEngine", "voice test: load $loadMs ms, render $renderMs ms for ${audio.durationMs} ms of speech")
            mapOf("ok" to true, "loadMs" to loadMs, "renderMs" to renderMs, "audioMs" to audio.durationMs, "stages" to engine.lastTimings)
        } catch (e: Throwable) {
            val f = EngineFailure.of(e)
            EngineLog.e("LamplightEngine", "voice test failed", e)
            mapOf("ok" to false, "error" to f.toMap())
        }
    }

    private fun parseQuality(q: String): Quality = when (q) {
        "live" -> Quality.LIVE
        "studio" -> Quality.STUDIO
        "studioPlus" -> Quality.STUDIO_PLUS
        else -> Quality.AUTO
    }

    private fun runOnMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block() else Handler(Looper.getMainLooper()).post(block)
    }

    /** Connecting a controller starts the media session service; Media3 makes it foreground while playing. */
    private fun connectSession() = runOnMain {
        if (mediaController != null) return@runOnMain
        val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
        mediaController = MediaController.Builder(context, token).buildAsync()
    }

    private fun playPreview(samples: FloatArray, sampleRate: Int) {
        stopPreview()
        if (samples.isEmpty()) return
        val track = AudioTrack.Builder()
            .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_FLOAT).setSampleRate(sampleRate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
            .setBufferSizeInBytes(samples.size * 4)
            .setTransferMode(AudioTrack.MODE_STATIC)
            .build()
        track.write(samples, 0, samples.size, AudioTrack.WRITE_BLOCKING)
        track.play()
        preview = track
    }

    private fun stopPreview() {
        preview?.let {
            runCatching { it.stop() }
            it.release()
        }
        preview = null
    }

    private fun writeWav(file: File, samples: FloatArray, sampleRate: Int) {
        file.parentFile?.mkdirs()
        DataOutputStream(FileOutputStream(file).buffered()).use { o ->
            fun le32(v: Int) = o.write(byteArrayOf(v.toByte(), (v shr 8).toByte(), (v shr 16).toByte(), (v shr 24).toByte()))
            fun le16(v: Int) = o.write(byteArrayOf(v.toByte(), (v shr 8).toByte()))
            o.writeBytes("RIFF"); le32(36 + samples.size * 2); o.writeBytes("WAVEfmt ")
            le32(16); le16(1); le16(1); le32(sampleRate); le32(sampleRate * 2); le16(2); le16(16)
            o.writeBytes("data"); le32(samples.size * 2)
            for (s in samples) le16((s.coerceIn(-1f, 1f) * 32767f).roundToInt())
        }
    }
}
