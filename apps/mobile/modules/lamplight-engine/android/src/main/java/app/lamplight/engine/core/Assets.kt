package app.lamplight.engine.core

import java.nio.ByteBuffer
import java.nio.ByteOrder

/** A style tensor from the voice pack. */
class StyleTensor(val dims: LongArray, val data: FloatArray)

/** One voice preset: the text-to-latent style and the duration style. */
class VoiceStyle(val id: String, val ttl: StyleTensor, val dp: StyleTensor)

/**
 * Readers for the engine's compact asset formats (written by packages/engine-web/src/assets.ts):
 * `indexer.bin` = "LPI1" | u32 n | i16[n];  `voices.bin` = "LVS1" | u32 count | per voice: u8 idLen | id |
 * u32 ttlDims[3] | u32 dpDims[3] | f32 ttl[] | f32 dp[]  (all little-endian).
 */
object Assets {
    private fun ByteBuffer.magic(expected: String) {
        val m = String(ByteArray(4) { get() }, Charsets.US_ASCII)
        require(m == expected) { "Bad asset header: expected $expected, got $m" }
    }

    fun indexer(bytes: ByteArray): ShortArray {
        val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        buf.magic("LPI1")
        val n = buf.int
        return ShortArray(n) { buf.short }
    }

    fun voices(bytes: ByteArray): List<VoiceStyle> {
        val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        buf.magic("LVS1")
        val count = buf.int
        return List(count) {
            val idLen = buf.get().toInt() and 0xff
            val id = String(ByteArray(idLen) { buf.get() }, Charsets.US_ASCII)
            val dims = LongArray(6) { buf.int.toLong() and 0xffffffffL }
            val ttlDims = dims.copyOfRange(0, 3)
            val dpDims = dims.copyOfRange(3, 6)
            val ttl = FloatArray((ttlDims[0] * ttlDims[1] * ttlDims[2]).toInt()) { buf.float }
            val dp = FloatArray((dpDims[0] * dpDims[1] * dpDims[2]).toInt()) { buf.float }
            VoiceStyle(id, StyleTensor(ttlDims, ttl), StyleTensor(dpDims, dp))
        }
    }
}

/** The parts of tts.json the pipeline needs. */
data class EngineConfig(
    val sampleRate: Int,
    val baseChunkSize: Int,
    val chunkCompressFactor: Int,
    val latentDim: Int,
) {
    companion object {
        /** Reads tts.json. Small hand-rolled lookup: the file is ours and its shape is fixed per model version. */
        fun parse(json: String): EngineConfig {
            fun section(name: String): String {
                val start = json.indexOf("\"$name\"").also { require(it >= 0) { "tts.json: missing $name" } }
                val open = json.indexOf('{', start)
                var depth = 0
                for (i in open until json.length) {
                    when (json[i]) {
                        '{' -> depth++
                        '}' -> if (--depth == 0) return json.substring(open, i + 1)
                    }
                }
                error("tts.json: unbalanced $name")
            }
            fun topLevelInt(obj: String, key: String): Int {
                // Only consider keys at depth 1 of `obj`.
                var depth = 0
                var i = 0
                val needle = "\"$key\""
                while (i < obj.length) {
                    val c = obj[i]
                    if (c == '{') depth++ else if (c == '}') depth--
                    if (depth == 1 && obj.startsWith(needle, i)) {
                        val m = Regex("^\"$key\"\\s*:\\s*(-?\\d+)").find(obj.substring(i)) ?: error("tts.json: bad $key")
                        return m.groupValues[1].toInt()
                    }
                    i++
                }
                error("tts.json: missing $key")
            }
            val ae = section("ae")
            val ttl = section("ttl")
            return EngineConfig(
                sampleRate = topLevelInt(ae, "sample_rate"),
                baseChunkSize = topLevelInt(ae, "base_chunk_size"),
                chunkCompressFactor = topLevelInt(ttl, "chunk_compress_factor"),
                latentDim = topLevelInt(ttl, "latent_dim"),
            )
        }
    }
}
