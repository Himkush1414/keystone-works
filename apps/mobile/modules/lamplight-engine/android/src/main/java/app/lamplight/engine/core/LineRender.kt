package app.lamplight.engine.core

/**
 * What the player does to each rendered piece of a line, in one place: the player, the Diagnostics A/B
 * sample and the JVM scene test all call this, so what is measured and heard is what is played.
 */
object LineRender {
    /** How one line is said, as the queue gives it. */
    class Style(
        val rate: Float = 1f,
        val gainDb: Float = 0f,
        val pitch: Float = 0f,
        val ending: String? = null,
        val breath: Boolean = false,
    ) {
        /**
         * Natural (no pitch shift): the model speaks at the line's pace and nothing processes the voice. A pitch
         * shift (emotion processing on) renders one take at the base rate and shapes pitch and pace together.
         */
        val processed: Boolean get() = pitch != 0f

        fun modelRate(base: Float): Float = if (processed) base else base * rate
    }

    /** The model renders this piece as continuing (no closing pitch) unless it ends the line normally. */
    fun continues(last: Boolean, style: Style): Boolean = !last || style.ending == "cut"

    /**
     * One piece of a line, ready for the player, from its [trimmed] render ([Chunks.trim]): the line's ending
     * shaped (last piece only), pitch, pace and loudness applied, a breath before the first piece, joined to
     * the next.
     */
    fun piece(trimmed: FloatArray, sampleRate: Int, k: Int, last: Boolean, style: Style, seed: Long, gapMs: Int, joiner: Chunks.Joiner): FloatArray {
        val speech = if (last && style.ending != null) Performance.ending(trimmed, sampleRate, style.ending) else trimmed
        val performed = Performance.apply(
            speech, sampleRate, style.gainDb, style.breath && k == 0, seed, style.pitch, if (style.processed) style.rate else 1f,
        )
        return joiner.push(performed, gapMs, last)
    }
}
