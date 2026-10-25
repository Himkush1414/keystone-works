package app.lamplight.engine.core

/**
 * Decides what the renderer makes next so narration never waits on it: always the first sentence after the
 * playhead that has no audio yet, at the best quality that will still be ready before the audio already made
 * runs out; once [lookaheadMs] of speech is ready, it upgrades quick renders that are far enough ahead.
 * Pure, so the same plan runs on the phone and in the JVM gap test.
 */
class ReadAhead(
    val lookaheadMs: Long = 30_000,
    /** Kept in hand for scheduling jitter and the audio buffer. */
    val marginMs: Long = 1_200,
    /** An upgrade is only worth making for a sentence at least this far ahead. */
    val upgradeAfterMs: Long = 6_000,
) {
    /** What is known about one sentence: its length (measured once rendered), the pause after it, its quality. */
    class Slot(val audioMs: Long, val pauseMs: Int, val silent: Boolean, val steps: Int) {
        val ready: Boolean get() = silent || steps > 0
    }

    class Plan(val index: Int, val steps: Int, val upgrade: Boolean)

    /**
     * [playhead] and [offsetMs] say what is being heard; [speed] is the playback speed; step counts come from
     * [options] between [floor] and [target].
     */
    fun next(
        count: Int,
        slot: (Int) -> Slot,
        playhead: Int,
        offsetMs: Long,
        speed: Float,
        floor: Int,
        target: Int,
        pacing: Pacing,
    ): Plan? {
        // Never below the floor, even on a phone that can't keep up: a wait between sentences beats a broken voice.
        val low = maxOf(floor, FLOOR_STEPS)
        val choices = (STEP_OPTIONS + low + target).filter { it in low..target }.distinct()
        // Speech ready ahead of the listener, in real time (faster playback drains it sooner).
        var aheadMs = -offsetMs.toDouble()
        var i = playhead
        while (i < count) {
            val s = slot(i)
            if (!s.ready) {
                val budget = (aheadMs / speed).toLong() - marginMs
                // Slower than real time drains the buffer for the sentences after this one: only with plenty in hand.
                val affordable = choices.filter { it == low || pacing.rtf(it) * speed <= SUSTAINABLE_RTF || budget > lookaheadMs / 2 }
                return Plan(i, pacing.choose(affordable, s.audioMs, budget), false)
            }
            aheadMs += s.audioMs + s.pauseMs
            if (aheadMs > lookaheadMs * speed) break
            i++
        }
        // Plenty is ready: raise sentences rendered quickly to the target, nearest first.
        aheadMs = -offsetMs.toDouble()
        for (k in playhead until count) {
            val s = slot(k)
            val startsInMs = (aheadMs / speed).toLong()
            if (!s.silent && s.steps in 1 until target && startsInMs > upgradeAfterMs &&
                pacing.renderMs(target, s.audioMs) < startsInMs - marginMs
            ) return Plan(k, target, true)
            aheadMs += s.audioMs + s.pauseMs
            if (aheadMs > lookaheadMs * speed) break
        }
        return null
    }

    companion object {
        val STEP_OPTIONS = listOf(6, 8, 10, 12, 16)

        /**
         * The fewest steps ever used. Below this the model's output breaks (AbProbeTest, en and hi, F1 and M2):
         * at 2, 3 and 4 steps it clips (104, 6.5 and 2.2 samples a sentence) and carries 10 dB more energy
         * above 7 kHz (-14 to -17 dB against -26 to -27 dB), heard as a buzzing, broken voice. From 6 steps
         * up the measures are flat.
         */
        const val FLOOR_STEPS = 6

        /** Render work per second of speech that still leaves room to get ahead. */
        const val SUSTAINABLE_RTF = 0.8
    }
}
