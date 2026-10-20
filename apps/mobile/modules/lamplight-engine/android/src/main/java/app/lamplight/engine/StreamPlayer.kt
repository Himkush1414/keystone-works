package app.lamplight.engine

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.media.PlaybackParams
import android.os.Process
import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * Streams generated speech through one AudioTrack. A writer thread pulls each sentence's PCM in order from
 * [source] (blocking until it's rendered), writes it with the pause that follows it, and records which frames
 * belong to which sentence so the playhead can be mapped back to text precisely. Speed changes use the
 * platform's pitch-preserving time stretch.
 */
class StreamPlayer(
    private val sampleRate: Int,
    private val source: Source,
) {
    interface Source {
        /** Blocks until sentence [index] is ready; returns null when [index] is past the end. */
        fun awaitPcm(index: Int): Pcm?
        fun onUnderrun(index: Int)
        fun onEnded()
    }

    class Pcm(val index: Int, val samples: FloatArray, val pauseMs: Int)

    private data class Span(val index: Int, val startFrame: Long, val frames: Long, val speechFrames: Long)

    private val track: AudioTrack = AudioTrack.Builder()
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build(),
        )
        .setAudioFormat(
            AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_FLOAT)
                .setSampleRate(sampleRate)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build(),
        )
        .setBufferSizeInBytes(
            maxOf(
                AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_FLOAT) * 4,
                sampleRate * 4 / 2, // ~0.5 s
            ),
        )
        .setTransferMode(AudioTrack.MODE_STREAM)
        .build()

    private val spans = ArrayList<Span>()
    private val framesWritten = AtomicLong(0)
    private val running = AtomicBoolean(false)
    private var writer: Thread? = null
    @Volatile private var nextIndex = 0
    @Volatile private var generation = 0
    @Volatile private var volume = 1f

    /** Starts (or restarts) writing from sentence [index]. */
    @Synchronized
    fun start(index: Int) {
        stopWriter()
        track.pause()
        track.flush()
        synchronized(spans) { spans.clear() }
        framesWritten.set(0)
        baseHeadFrames = track.playbackHeadPosition.toLong() and 0xffffffffL
        nextIndex = index
        running.set(true)
        val gen = ++generation
        writer = Thread({ writeLoop(gen) }, "lamplight-audio").apply {
            priority = Thread.MAX_PRIORITY
            start()
        }
    }

    fun play() = track.play()

    fun pause() = track.pause()

    val isPlaying: Boolean get() = track.playState == AudioTrack.PLAYSTATE_PLAYING

    fun setSpeed(speed: Float) {
        try {
            track.playbackParams = PlaybackParams().setSpeed(speed).setPitch(1f).allowDefaults()
        } catch (e: IllegalArgumentException) {
            Log.w(TAG, "speed $speed not supported", e)
        }
    }

    fun setVolume(v: Float) {
        volume = v.coerceIn(0f, 1f)
        track.setVolume(volume)
    }

    @Synchronized
    fun release() {
        stopWriter()
        runCatching { track.stop() }
        track.release()
    }

    private var baseHeadFrames = 0L

    /**
     * Frames played since the last [start]. The head position counts frames of the source rate, so it stays
     * correct at any playback speed; the UI interpolates between the 10 Hz progress events for smoothness.
     */
    private fun playedFrames(): Long {
        val raw = track.playbackHeadPosition.toLong() and 0xffffffffL
        return (raw - baseHeadFrames).coerceIn(0, framesWritten.get())
    }

    /** The sentence being heard and how far into its speech (ms), or null before any audio has played. */
    fun position(): Pair<Int, Long>? {
        val played = playedFrames()
        synchronized(spans) {
            if (spans.isEmpty()) return null
            var lo = 0
            var hi = spans.lastIndex
            while (lo < hi) {
                val mid = (lo + hi + 1) / 2
                if (spans[mid].startFrame <= played) lo = mid else hi = mid - 1
            }
            val s = spans[lo]
            val into = (played - s.startFrame).coerceIn(0, s.speechFrames)
            return s.index to into * 1000 / sampleRate
        }
    }

    private fun stopWriter() {
        running.set(false)
        generation++
        writer?.interrupt()
        writer?.join(500)
        writer = null
    }

    private fun writeLoop(gen: Int) {
        Process.setThreadPriority(Process.THREAD_PRIORITY_URGENT_AUDIO)
        try {
            while (running.get() && gen == generation) {
                val index = nextIndex
                val pcm = source.awaitPcm(index) ?: run {
                    drainThenEnd(gen)
                    return
                }
                if (gen != generation) return
                val pause = (pcm.pauseMs.toLong() * sampleRate / 1000).toInt()
                val start = framesWritten.get()
                synchronized(spans) { spans.add(Span(index, start, pcm.samples.size.toLong() + pause, pcm.samples.size.toLong())) }
                if (!writeFully(pcm.samples, gen)) return
                if (pause > 0 && !writeFully(FloatArray(pause), gen)) return
                nextIndex = index + 1
                trimSpans()
            }
        } catch (_: InterruptedException) {
            // restarted or released
        }
    }

    private fun writeFully(samples: FloatArray, gen: Int): Boolean {
        var off = 0
        while (off < samples.size) {
            if (!running.get() || gen != generation) return false
            val n = track.write(samples, off, samples.size - off, AudioTrack.WRITE_BLOCKING)
            if (n < 0) {
                Log.e(TAG, "AudioTrack write failed: $n")
                return false
            }
            off += n
            framesWritten.addAndGet(n.toLong())
        }
        return true
    }

    private fun drainThenEnd(gen: Int) {
        while (running.get() && gen == generation && playedFrames() < framesWritten.get()) Thread.sleep(50)
        if (gen == generation) source.onEnded()
    }

    /** Keeps the span list short: drop spans that finished playing long ago. */
    private fun trimSpans() {
        val played = playedFrames()
        synchronized(spans) {
            while (spans.size > 64 && spans[1].startFrame + spans[1].frames < played) spans.removeAt(0)
        }
    }

    companion object {
        private const val TAG = "LamplightAudio"
    }
}
