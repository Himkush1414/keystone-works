package app.lamplight.engine.core

import kotlin.math.max

/**
 * Learns how fast this phone renders speech from every piece it renders, and picks the step count for the
 * next one so it is ready before the audio already made runs out. Rendering cost per second of speech grows
 * with the steps (`fixed + perStep * steps`); the fit follows the phone as it warms, throttles or charges.
 * Thread-safe.
 */
class Pacing(fixed: Double = DEFAULT_FIXED, perStep: Double = DEFAULT_PER_STEP) {
    /** Recent real-time factor per step count (seconds of work per second of speech). */
    private val seen = HashMap<Int, Double>()
    private var priorFixed = fixed
    private var priorPerStep = perStep
    private var msPerCharEma = DEFAULT_MS_PER_CHAR
    private var samples = 0

    val measured: Int @Synchronized get() = samples

    /** Records one render: [renderMs] of work made [audioMs] of speech from [chars] characters. */
    @Synchronized
    fun record(steps: Int, renderMs: Long, audioMs: Long, chars: Int) {
        if (audioMs <= 0) return
        val r = renderMs.toDouble() / audioMs
        seen[steps] = seen[steps]?.let { it + ALPHA * (r - it) } ?: r
        if (chars > 0) msPerCharEma += ALPHA * (audioMs.toDouble() / chars - msPerCharEma)
        samples++
    }

    /** Predicted real-time factor at [steps]. */
    @Synchronized
    fun rtf(steps: Int): Double {
        seen[steps]?.let { return it }
        val (fixed, perStep) = fit()
        return max(MIN_RTF, fixed + perStep * steps)
    }

    /** Milliseconds of work to render [audioMs] of speech at [steps]. */
    fun renderMs(steps: Int, audioMs: Long): Long = (rtf(steps) * audioMs).toLong()

    /** Speech length for [chars] characters at pace [rate], from what this voice has actually produced. */
    @Synchronized
    fun estimateAudioMs(chars: Int, rate: Float): Long = (chars * msPerCharEma / rate).toLong()

    /**
     * The highest of [options] whose render of [audioMs] fits in [budgetMs]; the lowest when none fits (the
     * listener then waits as little as possible).
     */
    fun choose(options: List<Int>, audioMs: Long, budgetMs: Long): Int {
        val sorted = options.distinct().sorted()
        return sorted.lastOrNull { renderMs(it, audioMs) <= budgetMs } ?: sorted.first()
    }

    /** `fixed` and `perStep` by least squares over the step counts seen; the prior fills in what isn't known. */
    private fun fit(): Pair<Double, Double> {
        if (seen.size >= 2) {
            val n = seen.size
            val mx = seen.keys.sum().toDouble() / n
            val my = seen.values.sum() / n
            var sxy = 0.0
            var sxx = 0.0
            for ((x, y) in seen) {
                sxy += (x - mx) * (y - my)
                sxx += (x - mx) * (x - mx)
            }
            val slope = if (sxx > 0) max(0.0, sxy / sxx) else priorPerStep
            return max(0.0, my - slope * mx) to slope
        }
        val (k, r) = seen.entries.firstOrNull()?.toPair() ?: return priorFixed to priorPerStep
        // One step count seen: scale the prior's shape to it.
        val scale = r / max(MIN_RTF, priorFixed + priorPerStep * k)
        return priorFixed * scale to priorPerStep * scale
    }

    /** The fit as two numbers, to seed the next launch. */
    @Synchronized
    fun export(): Pair<Double, Double> = fit()

    @Synchronized
    fun seed(fixed: Double, perStep: Double) {
        if (fixed.isFinite() && perStep.isFinite() && fixed >= 0 && perStep > 0) {
            priorFixed = fixed
            priorPerStep = perStep
        }
    }

    companion object {
        /** A cautious guess for a mid-range phone until the first sentence has been measured. */
        const val DEFAULT_FIXED = 0.08
        const val DEFAULT_PER_STEP = 0.07
        private const val DEFAULT_MS_PER_CHAR = 66.0
        private const val ALPHA = 0.3
        private const val MIN_RTF = 0.01
    }
}
