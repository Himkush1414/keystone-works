package app.lamplight.engine.core

import java.io.File

/** The reading-gap passage (test resources), with the pauses the app's performance plan would give it. */
object Passage {
    const val SENTENCE_MS = 320
    const val PARAGRAPH_MS = 700
    const val SCENE_MS = 1_400

    fun lines(): List<GapSim.Line> {
        val raw = File(javaClass.getResource("/passage.txt")!!.toURI()).readLines().filter { !it.startsWith("#") }
        val out = ArrayList<GapSim.Line>()
        for ((k, line) in raw.withIndex()) {
            if (line.isBlank() || line == "***") continue
            val next = raw.getOrNull(k + 1)
            val pause = when {
                next == "***" -> SCENE_MS
                next == null || next.isBlank() -> PARAGRAPH_MS
                else -> SENTENCE_MS
            }
            val hindi = line.any { it in 'ऀ'..'ॿ' } || line.startsWith("Aarav")
            // The app's languageRuns hands an English phrase inside a Hindi line to the English voice.
            val cut = line.indexOf("so that")
            val runs = if (hindi && cut > 0) listOf(Run(line.substring(0, cut), "hi"), Run(line.substring(cut), "en")) else null
            out.add(GapSim.Line(line, if (hindi) "hi" else "en", pause, runs))
        }
        return out
    }
}
