package app.lamplight.engine

import android.content.ComponentName
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Handler
import android.os.Looper
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.DataOutputStream
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import kotlin.math.roundToInt

/** JavaScript API of the narration engine (see ../../index.ts for the typed wrapper). */
@UnstableApi
class LamplightEngineModule : Module() {
    private val context get() = requireNotNull(appContext.reactContext) { "React context unavailable" }
    private val controller get() = PlaybackController.get(context)
    private var mediaController: ListenableFuture<MediaController>? = null
    private var preview: AudioTrack? = null

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

        AsyncFunction("updateSegments") { json: String ->
            val spec = QueueSpec.parse(json)
            val from = spec.segments.minOfOrNull { it.index } ?: return@AsyncFunction
            controller.updateSegments(from, spec.segments)
        }

        AsyncFunction("play") { runOnMain { controller.play() } }
        AsyncFunction("pause") { runOnMain { controller.pause() } }
        AsyncFunction("stop") { runOnMain { controller.stop() } }
        AsyncFunction("seekTo") { index: Int -> controller.seekTo(index) }
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

        AsyncFunction("synthesizeToFile") { text: String, lang: String, voice: String, steps: Int, path: String ->
            val audio = controller.host.engine().synthesize(text, lang, controller.host.voice(voice), steps)
            writeWav(File(path), audio.samples, audio.sampleRate)
            audio.durationMs.toDouble()
        }

        AsyncFunction("extractPdf") { path: String, password: String? ->
            try {
                PdfText.extract(context, path, password)
            } catch (e: PdfText.PdfError) {
                throw CodedException(e.code, e.message ?: e.code, e)
            }
        }

        AsyncFunction("sha256File") { path: String -> sha256(File(path)) }

        OnDestroy {
            controller.removeListener(listener)
            mediaController?.let { MediaController.releaseFuture(it) }
            stopPreview()
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

    /** Hex SHA-256 of a file, streamed so a large book never sits in memory twice. */
    private fun sha256(file: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        file.inputStream().buffered(1 shl 16).use { input ->
            val buf = ByteArray(1 shl 16)
            while (true) {
                val n = input.read(buf)
                if (n < 0) break
                md.update(buf, 0, n)
            }
        }
        return md.digest().joinToString("") { "%02x".format(it) }
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
