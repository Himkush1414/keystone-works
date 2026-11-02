package app.lamplight.engine.core

/**
 * How often something may be retried: at most [max] times in any [windowMs]. Rebuilding a dead audio output
 * usually works once; an output that keeps dying shouldn't be rebuilt in a loop.
 */
class RetryBudget(private val max: Int, private val windowMs: Long) {
    private val times = ArrayDeque<Long>()

    /** Records a retry at [now] and says whether it's allowed. */
    @Synchronized
    fun take(now: Long): Boolean {
        while (times.isNotEmpty() && now - times.first() >= windowMs) times.removeFirst()
        if (times.size >= max) return false
        times.addLast(now)
        return true
    }
}
