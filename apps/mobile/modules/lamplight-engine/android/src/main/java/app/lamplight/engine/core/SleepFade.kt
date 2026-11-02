package app.lamplight.engine.core

/**
 * The sleep timer's fade: the volume goes down over [fadeMs], then narration pauses. Each fade has a token;
 * cancelling (or setting the timer again) retires it, so a fade loop that's still scheduled stops at its next
 * step instead of pausing a listener who just asked for more time. Main thread.
 */
class SleepFade(private val fadeMs: Long) {
    sealed interface Step {
        /** Set the volume to [volume] and step again shortly. */
        data class Volume(val volume: Float) : Step
        /** The fade is over: pause and restore the volume. */
        data object Done : Step
        /** This fade was cancelled or replaced: do nothing more. */
        data object Retired : Step
    }

    private var token = 0
    private var startedAt: Long? = null

    val active: Boolean get() = startedAt != null

    /** Starts a fade at [now] and returns its token. */
    fun start(now: Long): Int {
        startedAt = now
        return ++token
    }

    /** Ends any fade; its loop retires at its next step. */
    fun cancel() {
        startedAt = null
        token++
    }

    /** What fade [fade] does at [now]; a listener who paused meanwhile ends it at once. */
    fun step(fade: Int, now: Long, playing: Boolean): Step {
        val at = startedAt
        if (fade != token || at == null) return Step.Retired
        val t = (now - at).toFloat() / fadeMs
        if (t >= 1f || !playing) {
            startedAt = null
            token++
            return Step.Done
        }
        return Step.Volume((1f - t).coerceIn(0f, 1f))
    }
}
