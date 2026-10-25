package app.lamplight.engine.core

import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Measures every 16-bit mono WAV in -PabDir (clips pulled from a phone or the emulator) with [Quality]. */
class WavQualityTest {
    private fun read(f: File): Pair<FloatArray, Int> {
        val b = ByteBuffer.wrap(f.readBytes()).order(ByteOrder.LITTLE_ENDIAN)
        val sr = b.getInt(24)
        var at = 12
        while (at + 8 <= b.limit()) {
            val id = String(ByteArray(4) { b.get(at + it) })
            val size = b.getInt(at + 4)
            if (id == "data") return FloatArray(size / 2) { b.getShort(at + 8 + it * 2) / 32768f } to sr
            at += 8 + size
        }
        error("no data chunk in $f")
    }

    @Test
    fun measure() {
        val dir = System.getProperty("lamplight.ab.dir")?.let(::File)
        assumeTrue(dir != null && dir.isDirectory)
        for (f in dir!!.listFiles { x -> x.extension == "wav" }!!.sortedBy { it.name }) {
            val (x, sr) = read(f)
            println("WAV %-28s %s".format(f.name, Quality.measure(x, sr)))
        }
    }
}
