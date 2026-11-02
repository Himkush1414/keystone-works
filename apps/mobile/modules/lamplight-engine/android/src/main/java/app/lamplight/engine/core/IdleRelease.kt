package app.lamplight.engine.core

/**
 * When to free the voice model, which holds about 370 MB of native memory once loaded. It stays loaded while
 * narration plays and for [AFTER_MS] after its last use, so a short pause never costs a reload (about a
 * second); after that, an idle app gives the memory back (performance budget: 120 MB when not playing).
 */
object IdleRelease {
    const val AFTER_MS = 3 * 60_000L

    fun due(nowMs: Long, lastUseMs: Long, loaded: Boolean, playing: Boolean): Boolean =
        loaded && !playing && nowMs - lastUseMs >= AFTER_MS
}
