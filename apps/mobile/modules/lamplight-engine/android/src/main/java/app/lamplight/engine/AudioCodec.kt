package app.lamplight.engine

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import kotlin.math.abs
import kotlin.math.roundToInt

/**
 * Compact storage for rendered sentences: AAC-LC frames in a small private container
 * ("LPA1" | u32 sampleRate | u32 samples | u32 delay | u16 ascLen | asc | (u16 len | frame)*).
 * The exact sample count is stored so cached audio keeps the precise duration that read-along timing uses.
 */
object AudioCodec {
    private const val MIME = MediaFormat.MIMETYPE_AUDIO_AAC
    private const val BIT_RATE = 48_000
    private const val TIMEOUT_US = 10_000L

    /** Encoder priming in samples for this device's codec pair, measured once with an impulse. */
    @Volatile
    private var measuredDelay: Int = -1

    fun encode(pcm: FloatArray, sampleRate: Int, out: File) {
        val (frames, asc) = encodeFrames(pcm, sampleRate)
        val tmp = File(out.parentFile, out.name + ".tmp")
        DataOutputStream(FileOutputStream(tmp).buffered()).use { o ->
            o.writeBytes("LPA1")
            o.writeInt(sampleRate)
            o.writeInt(pcm.size)
            o.writeInt(delay(sampleRate))
            o.writeShort(asc.size)
            o.write(asc)
            for (f in frames) {
                o.writeShort(f.size)
                o.write(f)
            }
        }
        if (!tmp.renameTo(out)) {
            tmp.delete()
            error("could not move cache file into place")
        }
    }

    fun decode(file: File): FloatArray {
        DataInputStream(FileInputStream(file).buffered()).use { i ->
            val magic = ByteArray(4).also { i.readFully(it) }
            require(String(magic, Charsets.US_ASCII) == "LPA1") { "not a Lamplight audio file" }
            val sampleRate = i.readInt()
            val samples = i.readInt()
            val delay = i.readInt()
            val asc = ByteArray(i.readUnsignedShort()).also { i.readFully(it) }
            val frames = ArrayList<ByteArray>()
            while (i.available() > 0) frames.add(ByteArray(i.readUnsignedShort()).also { i.readFully(it) })
            val decoded = decodeFrames(frames, asc, sampleRate)
            val out = FloatArray(samples)
            val start = delay.coerceAtMost(maxOf(0, decoded.size - samples))
            System.arraycopy(decoded, start, out, 0, minOf(samples, decoded.size - start))
            return out
        }
    }

    private fun format(sampleRate: Int) = MediaFormat.createAudioFormat(MIME, sampleRate, 1).apply {
        setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
        setInteger(MediaFormat.KEY_BIT_RATE, BIT_RATE)
        setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16_384)
    }

    private fun encodeFrames(pcm: FloatArray, sampleRate: Int): Pair<List<ByteArray>, ByteArray> {
        val codec = MediaCodec.createEncoderByType(MIME)
        val frames = ArrayList<ByteArray>()
        var asc = ByteArray(0)
        try {
            codec.configure(format(sampleRate), null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            codec.start()
            val info = MediaCodec.BufferInfo()
            var inPos = 0
            var inputDone = false
            var outputDone = false
            while (!outputDone) {
                if (!inputDone) {
                    val idx = codec.dequeueInputBuffer(TIMEOUT_US)
                    if (idx >= 0) {
                        val buf = codec.getInputBuffer(idx) ?: error("no input buffer")
                        buf.clear()
                        buf.order(java.nio.ByteOrder.nativeOrder())
                        val n = minOf((pcm.size - inPos), buf.remaining() / 2)
                        for (k in 0 until n) {
                            buf.putShort((pcm[inPos + k].coerceIn(-1f, 1f) * 32767f).roundToInt().toShort())
                        }
                        inPos += n
                        val pts = inPos * 1_000_000L / sampleRate
                        if (inPos >= pcm.size) {
                            codec.queueInputBuffer(idx, 0, n * 2, pts, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            inputDone = true
                        } else {
                            codec.queueInputBuffer(idx, 0, n * 2, pts, 0)
                        }
                    }
                }
                val out = codec.dequeueOutputBuffer(info, TIMEOUT_US)
                if (out >= 0) {
                    val buf = codec.getOutputBuffer(out) ?: error("no output buffer")
                    val bytes = ByteArray(info.size)
                    buf.position(info.offset)
                    buf.get(bytes)
                    if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) asc = bytes
                    else if (bytes.isNotEmpty()) frames.add(bytes)
                    codec.releaseOutputBuffer(out, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
                } else if (out == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED && asc.isEmpty()) {
                    codec.outputFormat.getByteBuffer("csd-0")?.let { b -> asc = ByteArray(b.remaining()).also { b.get(it) } }
                }
            }
        } finally {
            runCatching { codec.stop() }
            codec.release()
        }
        return frames to asc
    }

    private fun decodeFrames(frames: List<ByteArray>, asc: ByteArray, sampleRate: Int): FloatArray {
        val fmt = MediaFormat.createAudioFormat(MIME, sampleRate, 1).apply {
            setByteBuffer("csd-0", java.nio.ByteBuffer.wrap(asc))
            setInteger(MediaFormat.KEY_IS_ADTS, 0)
        }
        val codec = MediaCodec.createDecoderByType(MIME)
        val out = FloatArrayBuilder(frames.size * 1024)
        try {
            codec.configure(fmt, null, null, 0)
            codec.start()
            val info = MediaCodec.BufferInfo()
            var next = 0
            var outputDone = false
            while (!outputDone) {
                if (next <= frames.size) {
                    val idx = codec.dequeueInputBuffer(TIMEOUT_US)
                    if (idx >= 0) {
                        val buf = codec.getInputBuffer(idx) ?: error("no input buffer")
                        buf.clear()
                        if (next == frames.size) {
                            codec.queueInputBuffer(idx, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                        } else {
                            buf.put(frames[next])
                            codec.queueInputBuffer(idx, 0, frames[next].size, next * 1024L * 1_000_000L / sampleRate, 0)
                        }
                        next++
                    }
                }
                val o = codec.dequeueOutputBuffer(info, TIMEOUT_US)
                if (o >= 0) {
                    val buf = codec.getOutputBuffer(o) ?: error("no output buffer")
                    buf.position(info.offset)
                    buf.limit(info.offset + info.size)
                    val shorts = buf.order(java.nio.ByteOrder.nativeOrder()).asShortBuffer()
                    while (shorts.hasRemaining()) out.add(shorts.get() / 32768f)
                    codec.releaseOutputBuffer(o, false)
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
                }
            }
        } finally {
            runCatching { codec.stop() }
            codec.release()
        }
        return out.toArray()
    }

    /** Priming delay of encoder + decoder, found by encoding an impulse and locating it after decoding. */
    private fun delay(sampleRate: Int): Int {
        if (measuredDelay >= 0) return measuredDelay
        val impulseAt = 4096
        val probe = FloatArray(16_384).also { it[impulseAt] = 0.9f }
        val (frames, asc) = encodeFrames(probe, sampleRate)
        val decoded = decodeFrames(frames, asc, sampleRate)
        var peak = 0
        for (k in decoded.indices) if (abs(decoded[k]) > abs(decoded[peak])) peak = k
        measuredDelay = (peak - impulseAt).coerceAtLeast(0)
        return measuredDelay
    }

    private class FloatArrayBuilder(initial: Int) {
        private var data = FloatArray(maxOf(16, initial))
        private var size = 0
        fun add(v: Float) {
            if (size == data.size) data = data.copyOf(data.size * 2)
            data[size++] = v
        }
        fun toArray(): FloatArray = data.copyOf(size)
    }
}
