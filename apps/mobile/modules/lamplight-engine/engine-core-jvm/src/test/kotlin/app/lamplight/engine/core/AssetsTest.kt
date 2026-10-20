package app.lamplight.engine.core

import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.nio.ByteBuffer
import java.nio.ByteOrder

class AssetsTest {
    private fun le(size: Int, block: ByteBuffer.() -> Unit): ByteArray =
        ByteBuffer.allocate(size).order(ByteOrder.LITTLE_ENDIAN).apply(block).array()

    @Test
    fun `reads the indexer format`() {
        val bytes = le(4 + 4 + 6) {
            put("LPI1".toByteArray())
            putInt(3)
            putShort(-1)
            putShort(0)
            putShort(8320)
        }
        assertArrayEquals(shortArrayOf(-1, 0, 8320), Assets.indexer(bytes))
    }

    @Test
    fun `reads the voice format`() {
        val bytes = le(8 + 1 + 2 + 24 + 4 * 3) {
            put("LVS1".toByteArray())
            putInt(1)
            put(2)
            put("F1".toByteArray())
            listOf(1, 1, 2, 1, 1, 1).forEach { putInt(it) }
            putFloat(0.5f)
            putFloat(-1f)
            putFloat(2f)
        }
        val v = Assets.voices(bytes).single()
        assertEquals("F1", v.id)
        assertArrayEquals(longArrayOf(1, 1, 2), v.ttl.dims)
        assertArrayEquals(floatArrayOf(0.5f, -1f), v.ttl.data)
        assertArrayEquals(floatArrayOf(2f), v.dp.data)
    }

    @Test
    fun `rejects wrong headers`() {
        assertThrows<IllegalArgumentException> { Assets.indexer("XXXX\u0000\u0000\u0000\u0000".toByteArray()) }
    }

    @Test
    fun `parses the model config without a JSON library`() {
        val json = """{"tts_version":"v1","ae":{"sample_rate":44100,"encoder":{"sample_rate":1},"base_chunk_size":512},
            "ttl":{"latent_dim":24,"text_encoder":{"latent_dim":9},"chunk_compress_factor":6}}"""
        assertEquals(EngineConfig(44100, 512, 6, 24), EngineConfig.parse(json))
    }
}
