package app.lamplight.engine.core

import org.json.JSONObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.io.File

/** The Kotlin core must match the TypeScript reference (packages/engine-web) exactly. */
class ParityTest {
    private val fixture = JSONObject(File(System.getProperty("lamplight.parity")).readText())

    @Test
    fun `prepares text exactly like the reference`() {
        val cases = fixture.getJSONArray("prepare")
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            assertEquals(c.getString("prepared"), Prepare.forModel(c.getString("text"), c.getString("lang")), c.getString("text"))
        }
    }

    @Test
    fun `hashes like the reference`() {
        val cases = fixture.getJSONArray("fnv")
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            assertEquals(c.getLong("hash"), Seed.fnv1a(c.getString("s")), c.getString("s"))
        }
        val seeds = fixture.getJSONArray("seeds")
        for (i in 0 until seeds.length()) {
            val c = seeds.getJSONObject(i)
            assertEquals(c.getLong("seed"), Seed.forSentence(c.getString("text"), c.getString("voice"), c.getInt("steps")))
        }
    }

    @Test
    fun `draws the same noise as the reference`() {
        val cases = fixture.getJSONArray("noise")
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val expected = c.getJSONArray("values")
            val actual = Seed.gaussian(FloatArray(expected.length()), c.getLong("seed"))
            for (k in 0 until expected.length()) {
                assertEquals(expected.getDouble(k).toFloat(), actual[k], 1e-6f, "seed ${c.getLong("seed")} #$k")
            }
        }
    }
}
