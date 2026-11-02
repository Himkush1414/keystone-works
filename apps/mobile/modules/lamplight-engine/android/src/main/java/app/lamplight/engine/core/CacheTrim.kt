package app.lamplight.engine.core

/** Which cached files to remove so the cache fits its cap: least recently used first. Pure, so it's tested on the JVM. */
object CacheTrim {
    class Entry<T>(val item: T, val bytes: Long, val usedAt: Long)

    /** Entries to delete, oldest use first, until what remains is at most [capBytes]. */
    fun <T> victims(entries: List<Entry<T>>, capBytes: Long): List<T> {
        var total = entries.sumOf { it.bytes }
        if (total <= capBytes) return emptyList()
        val out = ArrayList<T>()
        for (e in entries.sortedBy { it.usedAt }) {
            if (total <= capBytes) break
            out.add(e.item)
            total -= e.bytes
        }
        return out
    }
}
