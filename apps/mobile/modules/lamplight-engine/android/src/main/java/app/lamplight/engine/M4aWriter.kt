package app.lamplight.engine

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import java.io.Closeable
import java.io.FileDescriptor
import kotlin.math.roundToInt

/**
 * Streams mono float PCM into an AAC-LC `.m4a` file, the format every phone, car and audiobook app plays.
 * Audio goes in as it's rendered (a chapter is never held in memory whole); [finish] writes the index.
 * One writer per file; not thread-safe.
 */
class M4aWriter(fd: FileDescriptor, private val sampleRate: Int, bitRate: Int = BIT_RATE) : Closeable {
    private val codec = MediaCodec.createEncoderByType(MIME)
    private val muxer = MediaMuxer(fd, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    private val info = MediaCodec.BufferInfo()
    private var track = -1
    private var queued = 0L
    private var finished = false

    /** Samples written so far, at [sampleRate]. */
    val samples: Long get() = queued

    init {
        val format = MediaFormat.createAudioFormat(MIME, sampleRate, 1).apply {
            setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
            setInteger(MediaFormat.KEY_BIT_RATE, bitRate)
            setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, INPUT_BYTES)
        }
        try {
            codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            codec.start()
        } catch (e: Exception) {
            codec.release()
            muxer.release()
            throw e
        }
    }

    fun write(pcm: FloatArray) {
        var at = 0
        while (at < pcm.size) {
            at += feed(pcm, at, pcm.size - at)
            drain(false)
        }
    }

    /** [count] samples of silence, without allocating them all at once. */
    fun silence(count: Int) {
        var left = count
        while (left > 0) {
            val n = minOf(left, ZEROS.size)
            write(if (n == ZEROS.size) ZEROS else ZEROS.copyOf(n))
            left -= n
        }
    }

    /** Ends the stream and completes the file. */
    fun finish() {
        if (finished) return
        while (true) {
            val idx = codec.dequeueInputBuffer(TIMEOUT_US)
            if (idx >= 0) {
                codec.queueInputBuffer(idx, 0, 0, pts(), MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                break
            }
            drain(false)
        }
        drain(true)
        if (track >= 0) muxer.stop()
        finished = true
    }

    override fun close() {
        runCatching { codec.stop() }
        codec.release()
        runCatching { muxer.release() }
    }

    private fun pts(): Long = queued * 1_000_000L / sampleRate

    /** Queues up to one input buffer of [pcm] from [from]; returns how many samples it took (0 if none was free). */
    private fun feed(pcm: FloatArray, from: Int, count: Int): Int {
        val idx = codec.dequeueInputBuffer(TIMEOUT_US)
        if (idx < 0) return 0
        val buf = codec.getInputBuffer(idx) ?: error("no input buffer")
        buf.clear()
        buf.order(java.nio.ByteOrder.nativeOrder())
        val n = minOf(count, buf.remaining() / 2)
        for (k in 0 until n) buf.putShort((pcm[from + k].coerceIn(-1f, 1f) * 32767f).roundToInt().toShort())
        val at = pts()
        queued += n
        codec.queueInputBuffer(idx, 0, n * 2, at, 0)
        return n
    }

    /** Moves encoded frames into the file; with [untilEnd], until the encoder has flushed everything. */
    private fun drain(untilEnd: Boolean) {
        while (true) {
            val out = codec.dequeueOutputBuffer(info, TIMEOUT_US)
            when {
                out == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    track = muxer.addTrack(codec.outputFormat)
                    muxer.start()
                }
                out == MediaCodec.INFO_TRY_AGAIN_LATER -> if (!untilEnd) return
                out >= 0 -> {
                    val buf = codec.getOutputBuffer(out) ?: error("no output buffer")
                    val config = info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0
                    if (!config && info.size > 0 && track >= 0) {
                        buf.position(info.offset)
                        buf.limit(info.offset + info.size)
                        muxer.writeSampleData(track, buf, info)
                    }
                    codec.releaseOutputBuffer(out, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
                }
            }
        }
    }

    companion object {
        private const val MIME = MediaFormat.MIMETYPE_AUDIO_AAC
        /** Mono speech at 64 kbps: clear, and about 29 MB an hour. */
        const val BIT_RATE = 64_000
        private const val INPUT_BYTES = 16_384
        private const val TIMEOUT_US = 10_000L
        private val ZEROS = FloatArray(4_096)
    }
}
