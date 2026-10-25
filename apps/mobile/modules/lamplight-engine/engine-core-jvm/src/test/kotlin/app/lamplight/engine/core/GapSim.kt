package app.lamplight.engine.core

import kotlin.math.max

/**
 * Narrates a passage on a virtual clock the way the phone does: one renderer making pieces in the order a
 * policy asks for, one player that starts each piece as soon as the one before it (and its pause) is over,
 * or later if the piece isn't ready. Every millisecond the player waits beyond the text's own pauses is a
 * stall: the gap the listener hears because rendering fell behind.
 */
class GapSim(
    private val sentences: List<Line>,
    /** Renders one piece; returns its speech length and the work it took, both in ms. */
    private val render: (Piece, Int) -> Rendered,
) {
    class Line(val text: String, val lang: String, val pauseMs: Int, val runs: List<Run>? = null)
    class Rendered(val audioMs: Long, val workMs: Long)

    class Report(
        val firstAudioMs: Long,
        /** Extra wait before each piece after the first; 0 when it was ready in time. */
        val stalls: List<Long>,
        val listenedMs: Long,
        val stepsUsed: List<Int>,
    ) {
        val totalStallMs get() = stalls.sum()
        val maxStallMs get() = stalls.maxOrNull() ?: 0
        val stallCount get() = stalls.count { it > 0 }
        fun percentile(p: Double): Long = stalls.sorted().let { if (it.isEmpty()) 0 else it[((it.size - 1) * p).toInt()] }
        override fun toString() =
            "first audio ${firstAudioMs} ms, stalls ${stallCount}/${stalls.size}, total ${totalStallMs} ms, " +
                "max ${maxStallMs} ms, p95 ${percentile(0.95)} ms over ${listenedMs / 1000} s of speech; steps ${stepsUsed.distinct().sorted()}"
    }

    class Part(val audioMs: Long, val gapMs: Int, val readyAt: Long)
    class State(var parts: List<Part>? = null, var steps: Int = 0)

    /** A scheduling policy: given the playhead, the next sentence to render, its steps, and whether to cut it up. */
    fun interface Policy {
        fun next(sim: View): Job?
    }

    class Job(val index: Int, val steps: Int, val chunked: Boolean)

    inner class View(val playhead: Int, val offsetMs: Long, private val states: List<State>) {
        val count get() = sentences.size
        fun ready(i: Int) = states[i].steps > 0
        fun steps(i: Int) = states[i].steps
        fun audioMs(i: Int): Long? = states[i].parts?.sumOf { it.audioMs + it.gapMs }
        fun line(i: Int) = sentences[i]
    }

    fun run(policy: Policy, maxWorkMs: Long = 60 * 60_000): Report {
        val states = sentences.map { State() }
        val used = ArrayList<Int>()
        var t = 0L
        while (t < maxWorkMs) {
            val (playhead, offset) = playheadAt(states, t)
            val job = policy.next(View(playhead, offset, states))
            if (job == null) {
                // Far enough ahead: idle until the listener catches up, as the render thread does.
                if (states.all { it.steps > 0 }) break
                t += IDLE_MS
                continue
            }
            val line = sentences[job.index]
            val pieces = if (job.chunked) Chunks.split(line.text, line.lang, line.runs) else listOf(Piece(line.text, line.lang, 0))
            val parts = ArrayList<Part>()
            for ((k, p) in pieces.withIndex()) {
                val r = render(p, job.steps)
                t += r.workMs
                parts.add(Part(r.audioMs, if (k == pieces.lastIndex) line.pauseMs else p.gapMs, t))
            }
            val s = states[job.index]
            // An upgrade only lands if the sentence hasn't started playing.
            if (s.parts == null || startOf(states, job.index) > t) {
                s.parts = parts
                s.steps = job.steps
                used.add(job.steps)
            }
        }
        return report(states, used)
    }

    /** Start time of sentence [index] on the player's timeline, or Long.MAX_VALUE if it can't be known yet. */
    private fun startOf(states: List<State>, index: Int): Long {
        var end = 0L
        for (i in 0 until index) {
            val parts = states[i].parts ?: return Long.MAX_VALUE
            for (p in parts) end = max(end, p.readyAt) + p.audioMs + p.gapMs
        }
        val first = states[index].parts?.first() ?: return Long.MAX_VALUE
        return max(end, first.readyAt)
    }

    /** What the listener hears at time [t]: sentence and ms into it. */
    private fun playheadAt(states: List<State>, t: Long): Pair<Int, Long> {
        var end = 0L
        for ((i, s) in states.withIndex()) {
            val parts = s.parts ?: return i to 0L
            val first = parts.first()
            val start = max(end, first.readyAt)
            if (start > t) return i to 0L
            var e = end
            for (p in parts) e = max(e, p.readyAt) + p.audioMs + p.gapMs
            if (t < e) return i to (t - start)
            end = e
        }
        return states.size to 0L
    }

    private fun report(states: List<State>, used: List<Int>): Report {
        val stalls = ArrayList<Long>()
        var end = -1L
        var first = 0L
        var listened = 0L
        for (s in states) {
            for (p in s.parts ?: break) {
                if (end < 0) {
                    first = p.readyAt
                    end = p.readyAt
                } else {
                    stalls.add(max(0, p.readyAt - end))
                }
                end = max(end, p.readyAt) + p.audioMs + p.gapMs
                listened += p.audioMs
            }
        }
        return Report(first, stalls, listened, used)
    }

    companion object {
        private const val IDLE_MS = 100L

        /** Before this change: one whole sentence at a time, at a fixed step count, 30 s ahead. */
        fun fixed(steps: Int, lookaheadMs: Long = 30_000, estimate: (Line) -> Long) = Policy { v ->
            var ahead = -v.offsetMs
            for (i in v.playhead until v.count) {
                if (!v.ready(i)) return@Policy Job(i, steps, chunked = false)
                ahead += v.audioMs(i) ?: estimate(v.line(i))
                if (ahead > lookaheadMs) break
            }
            null
        }

        /** This change: [ReadAhead] with [Pacing] learning from every render, sentences cut by [Chunks]. */
        fun paced(pacing: Pacing, target: Int, floor: Int = ReadAhead.FLOOR_STEPS, readAhead: ReadAhead = ReadAhead()) = Policy { v ->
            readAhead.next(
                count = v.count,
                slot = { i ->
                    val line = v.line(i)
                    ReadAhead.Slot(
                        v.audioMs(i)?.minus(line.pauseMs) ?: pacing.estimateAudioMs(line.text.length, 1f),
                        line.pauseMs,
                        silent = false,
                        steps = v.steps(i),
                    )
                },
                playhead = v.playhead,
                offsetMs = v.offsetMs,
                speed = 1f,
                floor = floor,
                target = target,
                pacing = pacing,
            )?.let { Job(it.index, it.steps, chunked = true) }
        }
    }
}
