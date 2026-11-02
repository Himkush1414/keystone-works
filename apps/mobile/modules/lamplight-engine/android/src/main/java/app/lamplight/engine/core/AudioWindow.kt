package app.lamplight.engine.core

/**
 * Which rendered sentences the player keeps in memory: the one being heard, the ones ahead of it, and a
 * couple behind (a short skip back replays them without waiting). Sentence audio is float PCM, about 176 KB
 * per second of speech, so everything further back is let go as soon as the listener moves on.
 */
object AudioWindow {
    /** Sentences kept behind the one being heard. */
    const val BEHIND = 2

    /** Indices in [held] that are no longer needed while sentence [current] plays. */
    fun stale(held: Collection<Int>, current: Int): List<Int> = held.filter { it < current - BEHIND }
}
