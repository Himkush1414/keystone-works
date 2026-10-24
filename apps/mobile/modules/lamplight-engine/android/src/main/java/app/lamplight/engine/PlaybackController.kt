package app.lamplight.engine

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.BatteryManager
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import app.lamplight.engine.core.Chunks
import app.lamplight.engine.core.Pacing
import app.lamplight.engine.core.Performance
import app.lamplight.engine.core.ReadAhead
import app.lamplight.engine.core.Seed
import org.json.JSONObject
import java.io.File
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.Executors
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock
import kotlin.math.max

/** How much care goes into each sentence. Steps are chosen per device from calibration. */
enum class Quality { LIVE, STUDIO, STUDIO_PLUS, AUTO }

/**
 * The narration engine's state machine: one document queue, one render thread, one audio stream. Owned by
 * the process (not by an Activity) so playback continues with the screen off and the app in the background.
 * The render thread works ahead of the listener ([ReadAhead]) at the quality this phone can sustain
 * ([Pacing]), one clause-sized piece at a time ([Chunks]), so the only silences are the ones the text asks for.
 */
class PlaybackController private constructor(private val context: Context) : StreamPlayer.Source {
    interface Listener {
        fun onState(state: Map<String, Any?>) {}
        fun onProgress(index: Int, positionMs: Long) {}
        fun onSentence(index: Int, durationMs: Long) {}
        fun onRender(docId: String, done: Int, total: Int) {}
        fun onError(code: String, message: String) {}
    }

    private val main = Handler(Looper.getMainLooper())
    private val listeners = CopyOnWriteArraySet<Listener>()
    val host = EngineHost(context.applicationContext)
    private val cache = AudioCache(context.applicationContext, MODEL_VERSION)
    private val prefs = context.getSharedPreferences("lamplight-engine", Context.MODE_PRIVATE)

    // ── state (guarded by lock) ──
    private val lock = ReentrantLock()
    private val ready = lock.newCondition()
    private val work = lock.newCondition()
    private var queue: QueueSpec? = null
    /** Rendered sentences by index; a sentence's pieces appear one by one while it renders. */
    private val renders = HashMap<Int, Rendered>()
    private var playhead = 0
    private var generation = 0
    private val durationsMs = HashMap<Int, Long>()
    private var prepare: PrepareJob? = null

    @Volatile var playing = false
        private set
    @Volatile var buffering = false
        private set
    @Volatile var speed = 1f
        private set
    @Volatile var quality = Quality.AUTO
        private set
    @Volatile private var currentIndex = 0
    @Volatile private var currentOffsetMs = 0L
    @Volatile private var sleepAtMs: Long? = null
    @Volatile private var sleepAtIndex: Int? = null
    private var fading = false

    private var player: StreamPlayer? = null

    private class PrepareJob(val spec: QueueSpec, val steps: Int, val chargingOnly: Boolean) {
        var next = 0
    }

    private class Part(val samples: FloatArray, val gapMs: Int)

    private class Rendered(val steps: Int) {
        val parts = ArrayList<Part>()
        var complete = false
        val durationMs: Long get() = parts.sumOf { it.samples.size * 1000L / SAMPLE_RATE + it.gapMs }
    }

    /** One model at a time: the render thread and calibration take turns. */
    private val engineLock = ReentrantLock()
    private val readAhead = ReadAhead(lookaheadMs = LOOKAHEAD_MS)
    private val pacing = Pacing().apply {
        val fixed = prefs.getFloat("pacingFixed", -1f)
        if (fixed >= 0) seed(fixed.toDouble(), prefs.getFloat("pacingPerStep", -1f).toDouble())
    }

    /** Cache files are encoded here, so the render thread never stops to compress audio. */
    private val cacheWriter = Executors.newSingleThreadExecutor { r ->
        Thread(r, "lamplight-cache").apply {
            priority = Thread.MIN_PRIORITY
            isDaemon = true
        }
    }

    // Started last, once everything it touches exists.
    private val renderThread = Thread(::renderLoop, "lamplight-render").apply {
        priority = Thread.NORM_PRIORITY + 1
        isDaemon = true
        start()
    }

    fun addListener(l: Listener) = listeners.add(l)
    fun removeListener(l: Listener) = listeners.remove(l)

    val queueSpec: QueueSpec? get() = lock.withLock { queue }

    // ── calibration and quality ──

    val liveSteps: Int get() = prefs.getInt("liveSteps", 4)
    val studioSteps: Int get() = prefs.getInt("studioSteps", 8)

    /**
     * Measures real-time factors on this device and picks step counts. Narration already measures every
     * sentence it renders, so this only synthesises test sentences (between the render thread's pieces) when
     * too little has been read yet. Runs on the caller's thread.
     */
    fun calibrate(): Map<String, Any> {
        val (r4, r8) = if (pacing.measured >= CALIBRATION_SAMPLES) {
            pacing.rtf(4) to pacing.rtf(8)
        } else {
            val engine = host.engine()
            val voice = host.voice("F1")
            val text = "Reading by lamplight was once the only way to read at night, and the warm light shaped how stories were told."
            engineLock.withLock { engine.synthesize("Warm up.", "en", voice, 2) }
            fun rtf(steps: Int): Double = engineLock.withLock {
                val t0 = System.nanoTime()
                val r = engine.synthesize(text, "en", voice, steps)
                val workMs = (System.nanoTime() - t0) / 1_000_000
                pacing.record(steps, workMs, r.durationMs, text.length)
                workMs / r.durationMs.toDouble()
            }
            rtf(4) to rtf(8)
        }
        val perStep = max(0.0, (r8 - r4) / 4)
        val fixed = max(0.0, r4 - perStep * 4)
        fun projected(steps: Int) = fixed + perStep * steps
        val live = if (r4 > 0.8) 3 else 4
        val studio = listOf(12, 10, 8).firstOrNull { projected(it) <= 0.65 } ?: 8
        prefs.edit()
            .putInt("liveSteps", live)
            .putInt("studioSteps", studio)
            .putBoolean("studioRealtime", projected(studio) <= 0.65)
            .putFloat("rtf4", r4.toFloat())
            .putFloat("rtf8", r8.toFloat())
            .apply()
        Log.i(TAG, "calibrated rtf4=$r4 rtf8=$r8 live=$live studio=$studio threads=${host.threads}")
        return mapOf("rtf4" to r4, "rtf8" to r8, "liveSteps" to live, "studioSteps" to studio, "threads" to host.threads)
    }

    /** Steps the render-ahead aims for; [Pacing] goes lower (down to [FLOOR_STEPS]) when it must to keep up. */
    private fun targetSteps(): Int = when (quality) {
        Quality.LIVE -> liveSteps
        Quality.STUDIO, Quality.AUTO -> studioSteps
        Quality.STUDIO_PLUS -> STUDIO_PLUS_STEPS
    }

    private fun cachedSteps(): List<Int> = listOf(STUDIO_PLUS_STEPS, 12, 10, 8, liveSteps, 3).distinct()

    // ── queue control (called from the module, any thread) ──

    fun load(spec: QueueSpec, startIndex: Int, startMs: Long, playbackSpeed: Float, q: Quality) {
        lock.withLock {
            queue = spec
            renders.clear()
            durationsMs.clear()
            spec.segments.forEach { durationsMs[it.index] = estimateMs(it) }
            playhead = startIndex.coerceIn(0, max(0, spec.segments.lastIndex))
            currentIndex = playhead
            currentOffsetMs = startMs
            generation++
            work.signalAll()
            ready.signalAll()
        }
        speed = playbackSpeed
        quality = q
        ensurePlayer().setSpeed(speed)
        player?.start(playhead)
        emitState()
    }

    /** Replaces segments from [from] on (voice, dictionary or Clean Read changes); keeps playing. */
    fun updateSegments(from: Int, segments: List<Segment>) {
        lock.withLock {
            val q = queue ?: return
            val merged = q.segments.toMutableList()
            for (s in segments) if (s.index in merged.indices) merged[s.index] = s
            queue = QueueSpec(q.docId, q.title, q.author, q.artworkUri, merged, q.chapterStarts, q.chapterTitles)
            // The writer may already have the next sentence's first piece in the track: leave what it's on.
            val keep = max(currentIndex, player?.writingIndex ?: currentIndex)
            renders.keys.filter { it >= from && it > keep }.forEach { renders.remove(it) }
            for (s in segments) if (s.index > keep) durationsMs[s.index] = estimateMs(s)
            work.signalAll()
        }
    }

    fun play() {
        if (queue == null) return
        if (!requestFocus()) return
        playing = true
        registerNoisy()
        ensurePlayer().play()
        startTicker()
        emitState()
    }

    fun pause() {
        playing = false
        player?.pause()
        persistPosition()
        unregisterNoisy()
        emitState()
    }

    fun stop() {
        pause()
        abandonFocus()
        lock.withLock {
            queue = null
            renders.clear()
            generation++
            ready.signalAll()
        }
        player?.release()
        player = null
        emitState()
    }

    fun seekTo(index: Int) {
        val q = queue ?: return
        val target = index.coerceIn(0, q.segments.lastIndex)
        lock.withLock {
            playhead = target
            currentIndex = target
            currentOffsetMs = 0
            renders.keys.filter { it < target - 2 }.forEach { renders.remove(it) }
            // A sentence cut short by the seek would leave the player waiting for pieces that never come.
            renders.entries.removeIf { !it.value.complete }
            generation++
            work.signalAll()
            ready.signalAll()
        }
        val wasPlaying = playing
        ensurePlayer().start(target)
        if (wasPlaying) player?.play()
        persistPosition()
        main.post { listeners.forEach { it.onProgress(target, 0) } }
        emitState()
    }

    fun skip(delta: Int) = seekTo(currentIndex + delta)

    fun skipChapter(delta: Int) {
        val q = queue ?: return
        val c = (q.chapterOf(currentIndex) + delta).coerceIn(0, q.chapterStarts.lastIndex)
        seekTo(q.chapterStarts[c])
    }

    fun setPlaybackSpeed(s: Float) {
        speed = s.coerceIn(0.5f, 3f)
        player?.setSpeed(speed)
        emitState()
    }

    fun setQuality(q: Quality) {
        quality = q
        lock.withLock { work.signalAll() }
        emitState()
    }

    /** Sleep after [minutes] (with a 10 s fade) or at the end of the current chapter; null cancels. */
    fun setSleepTimer(minutes: Double?, endOfChapter: Boolean) {
        sleepAtMs = minutes?.let { System.currentTimeMillis() + (it * 60_000).toLong() }
        sleepAtIndex = if (endOfChapter) queue?.chapterEnd(currentIndex) else null
        if (minutes == null && !endOfChapter) {
            fading = false
            player?.setVolume(1f)
        }
        emitState()
    }

    fun prepareOffline(spec: QueueSpec, q: Quality, chargingOnly: Boolean) {
        val steps = if (q == Quality.STUDIO_PLUS) STUDIO_PLUS_STEPS else studioSteps
        lock.withLock {
            prepare = PrepareJob(spec, steps, chargingOnly)
            work.signalAll()
        }
    }

    fun cancelPrepare(docId: String) = lock.withLock {
        if (prepare?.spec?.docId == docId) prepare = null
    }

    fun cacheBytes(): Long = cache.sizeBytes()
    fun clearCache() = cache.clear()

    fun snapshot(): Map<String, Any?> = mapOf(
        "docId" to queue?.docId,
        "playing" to playing,
        "buffering" to buffering,
        "index" to currentIndex,
        "positionMs" to currentOffsetMs,
        "speed" to speed.toDouble(),
        "quality" to quality.name.lowercase(),
        "sleepAt" to sleepAtMs,
        "sleepAtIndex" to sleepAtIndex,
        "engineLoaded" to host.isLoaded,
    )

    /** Estimated position in the whole document and its estimated total length, for media controls. */
    fun mediaPositionMs(): Pair<Long, Long> = lock.withLock {
        val q = queue ?: return 0L to 0L
        var before = 0L
        var total = 0L
        for (s in q.segments) {
            val d = (durationsMs[s.index] ?: 0L) + s.pauseMs
            if (s.index < currentIndex) before += d
            total += d
        }
        (before + currentOffsetMs) to total
    }

    fun seekToMediaPosition(ms: Long) {
        val q = queue ?: return
        var acc = 0L
        val target = lock.withLock {
            q.segments.firstOrNull { s ->
                acc += (durationsMs[s.index] ?: 0L) + s.pauseMs
                acc > ms
            }?.index ?: q.segments.lastIndex
        }
        seekTo(target)
    }

    // ── StreamPlayer.Source ──

    override fun awaitPart(index: Int, part: Int): StreamPlayer.Pcm? {
        val gen = lock.withLock { generation }
        while (true) {
            lock.withLock {
                if (gen != generation) throw InterruptedException()
                val q = queue ?: return null
                if (index > q.segments.lastIndex) return null
                val seg = q.segments[index]
                if (seg.isSilent) return StreamPlayer.Pcm(index, FloatArray(0), seg.pauseMs)
                val r = renders[index]
                r?.parts?.getOrNull(part)?.let { p ->
                    if (buffering) setBuffering(false)
                    val last = r.complete && part == r.parts.lastIndex
                    return StreamPlayer.Pcm(index, p.samples, if (last) seg.pauseMs else p.gapMs, last)
                }
                // A sentence that finished with fewer pieces than asked for has nothing more to give.
                if (r != null && r.complete) return StreamPlayer.Pcm(index, FloatArray(0), seg.pauseMs)
                work.signalAll()
            }
            if (part == 0 && readFromCache(index, gen)) continue
            lock.withLock {
                if (renders[index]?.parts?.getOrNull(part) == null && gen == generation) {
                    if (playing && !buffering) setBuffering(true)
                    ready.await(250, java.util.concurrent.TimeUnit.MILLISECONDS)
                }
            }
        }
    }

    /** Loads sentence [index] from the disk cache if it's there (decoding takes a few ms, outside the lock). */
    private fun readFromCache(index: Int, gen: Int): Boolean {
        val seg = lock.withLock { if (renders[index] == null) queue?.segments?.getOrNull(index) else null } ?: return false
        val (steps, samples) = cache.best(seg, cachedSteps())?.let { (steps, key) -> cache.read(key)?.let { steps to it } } ?: return false
        lock.withLock {
            if (gen != generation || renders[index] != null) return false
            renders[index] = Rendered(steps).apply {
                parts.add(Part(samples, 0))
                complete = true
            }
            durationsMs[index] = samples.size * 1000L / SAMPLE_RATE
        }
        return true
    }

    override fun onUnderrun(index: Int) = setBuffering(true)

    override fun onEnded() {
        main.post {
            playing = false
            persistPosition()
            emitState()
        }
    }

    // ── render thread ──

    private fun renderLoop() {
        while (true) {
            try {
                val job = lock.withLock { nextJob() ?: run { work.await(2, java.util.concurrent.TimeUnit.SECONDS); null } } ?: continue
                runJob(job)
            } catch (e: InterruptedException) {
                return
            } catch (e: Throwable) {
                Log.e(TAG, "render failed", e)
                main.post { listeners.forEach { it.onError("render", e.message ?: e.javaClass.simpleName) } }
                Thread.sleep(500)
            }
        }
    }

    private class Job(val gen: Int, val segment: Segment, val steps: Int, val upgrade: Boolean, val prepare: PrepareJob?)

    /** Picks the most valuable work: the first sentence ahead with no audio, then upgrades, then offline prep. */
    private fun nextJob(): Job? {
        val q = queue
        if (q != null) {
            val plan = readAhead.next(
                count = q.segments.size,
                slot = { i ->
                    val s = q.segments[i]
                    val r = renders[i]?.takeIf { it.complete }
                    ReadAhead.Slot(r?.durationMs ?: durationsMs[i] ?: estimateMs(s), s.pauseMs, s.isSilent, r?.steps ?: 0)
                },
                playhead = max(currentIndex, playhead),
                offsetMs = if (playhead > currentIndex) 0 else currentOffsetMs,
                speed = speed,
                floor = FLOOR_STEPS,
                target = targetSteps(),
                pacing = pacing,
            )
            // A sentence the player is already in can't be swapped for a better render.
            if (plan != null && !(plan.upgrade && plan.index <= (player?.writingIndex ?: -1))) {
                return Job(generation, q.segments[plan.index], plan.steps, plan.upgrade, null)
            }
        }
        val p = prepare ?: return null
        if (p.chargingOnly && !isCharging()) return null
        if (isTooHot()) return null
        while (p.next < p.spec.segments.size) {
            val s = p.spec.segments[p.next]
            if (!s.isSilent && !cache.has(cache.key(s, p.steps))) return Job(generation, s, p.steps, false, p)
            p.next++
        }
        prepare = null
        main.post { listeners.forEach { it.onRender(p.spec.docId, p.spec.segments.size, p.spec.segments.size) } }
        return null
    }

    /**
     * Renders one sentence piece by piece. For playback each piece is handed to the player as soon as it's
     * made; an upgrade is built aside and swapped in whole, and only if the player hasn't reached it.
     */
    private fun runJob(job: Job) {
        val seg = job.segment
        val i = seg.index
        val voice = host.voice(seg.voice)
        val pieces = Chunks.split(seg.text, seg.lang, seg.runs)
        val forPlayer = job.prepare == null && !job.upgrade
        // Heard before (or prepared offline): no need to render it again.
        if (forPlayer && readFromCache(i, job.gen)) return
        val rendered = Rendered(job.steps)
        if (forPlayer) lock.withLock {
            if (job.gen != generation || renders[i]?.complete == true) return
            renders[i] = rendered
        }
        for ((k, piece) in pieces.withIndex()) {
            if (job.gen != generation) return
            val t0 = System.nanoTime()
            val raw = engineLock.withLock { host.engine().synthesize(piece.text, piece.lang, voice, job.steps, BASE_RATE * seg.rate) }
            val workMs = (System.nanoTime() - t0) / 1_000_000
            if (raw.dropped.isNotEmpty()) Log.d(TAG, "dropped characters ${raw.dropped}")
            pacing.record(job.steps, workMs, raw.durationMs, piece.text.length)
            val seed = Seed.forSentence(piece.text, voice.id, job.steps)
            val performed = Performance.apply(raw.samples, raw.sampleRate, seg.gainDb, seg.breath && k == 0, seed)
            val samples = if (pieces.size == 1) performed
            else Chunks.fadeEdges(performed, raw.sampleRate, fadeIn = k > 0, fadeOut = k < pieces.lastIndex)
            val part = Part(samples, piece.gapMs)
            if (forPlayer) lock.withLock {
                if (job.gen != generation) return
                rendered.parts.add(part)
                ready.signalAll()
            } else rendered.parts.add(part)
        }
        rendered.complete = true
        if (pacing.measured % PACING_SAVE_EVERY == 0) savePacing()
        val whole = if (rendered.parts.size == 1) rendered.parts[0].samples else joined(rendered.parts)
        val key = cache.key(seg, job.steps)
        if (job.steps >= studioSteps || job.prepare != null) cacheWriter.execute { cache.write(key, whole, SAMPLE_RATE) }
        if (job.prepare != null) {
            val p = job.prepare
            p.next++
            if (p.next % 5 == 0) main.post { listeners.forEach { it.onRender(p.spec.docId, p.next, p.spec.segments.size) } }
            return
        }
        val duration = lock.withLock {
            if (job.gen != generation) return
            if (!job.upgrade && renders[i] !== rendered) return // replaced while rendering (voice or text change)
            if (job.upgrade) {
                val have = renders[i]
                val writing = player?.writingIndex ?: -1
                if (i <= writing || (have != null && have.steps >= job.steps)) return
                renders[i] = rendered
            }
            durationsMs[i] = rendered.durationMs
            // Keep memory bounded: drop audio well behind the playhead.
            renders.keys.filter { it < currentIndex - 2 }.forEach { renders.remove(it) }
            ready.signalAll()
            rendered.durationMs
        }
        // The sentence being heard now has its true length, for the word underline.
        if (i == currentIndex) main.post { listeners.forEach { it.onSentence(i, duration) } }
    }

    /** A sentence's pieces as one clip, gaps included, for the disk cache. */
    private fun joined(parts: List<Part>): FloatArray {
        val gaps = parts.dropLast(1).sumOf { it.gapMs * SAMPLE_RATE / 1000 }
        val out = FloatArray(parts.sumOf { it.samples.size } + gaps)
        var at = 0
        parts.forEachIndexed { k, p ->
            p.samples.copyInto(out, at)
            at += p.samples.size
            if (k < parts.lastIndex) at += p.gapMs * SAMPLE_RATE / 1000
        }
        return out
    }

    private fun savePacing() {
        val (fixed, perStep) = pacing.export()
        prefs.edit().putFloat("pacingFixed", fixed.toFloat()).putFloat("pacingPerStep", perStep.toFloat()).apply()
    }

    // ── ticker: progress, sentence changes, sleep timer ──

    private val tick = object : Runnable {
        override fun run() {
            val p = player ?: return
            val pos = p.position()
            if (pos != null) {
                val (index, offset) = pos
                if (index != currentIndex) {
                    currentIndex = index
                    lock.withLock { playhead = index; work.signalAll() }
                    persistPosition()
                    val d = lock.withLock { durationsMs[index] ?: 0L }
                    listeners.forEach { it.onSentence(index, d) }
                }
                currentOffsetMs = offset
                listeners.forEach { it.onProgress(index, offset) }
            }
            checkSleep()
            if (playing) main.postDelayed(this, TICK_MS)
        }
    }

    private fun startTicker() {
        main.removeCallbacks(tick)
        main.post(tick)
    }

    private fun checkSleep() {
        val byTime = sleepAtMs?.let { System.currentTimeMillis() >= it - FADE_MS } ?: false
        val byChapter = sleepAtIndex?.let { currentIndex >= it } ?: false
        if (!byTime && !byChapter) return
        if (!fading) {
            fading = true
            fadeOut(System.currentTimeMillis())
        }
    }

    private fun fadeOut(startedAt: Long) {
        val p = player ?: return
        val t = (System.currentTimeMillis() - startedAt).toFloat() / FADE_MS
        if (t >= 1f || !playing) {
            pause()
            p.setVolume(1f)
            fading = false
            sleepAtMs = null
            sleepAtIndex = null
            emitState()
            return
        }
        p.setVolume(1f - t)
        main.postDelayed({ fadeOut(startedAt) }, 100)
    }

    // ── audio focus and noisy output ──

    private val audio = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private var resumeOnGain = false
    private val focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(
            AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build(),
        )
        .setWillPauseWhenDucked(true)
        .setOnAudioFocusChangeListener({ change ->
            when (change) {
                AudioManager.AUDIOFOCUS_LOSS -> {
                    resumeOnGain = false
                    pause()
                }
                AudioManager.AUDIOFOCUS_LOSS_TRANSIENT, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                    // Speech can't be understood under other audio, so pause rather than duck.
                    resumeOnGain = playing
                    pause()
                }
                AudioManager.AUDIOFOCUS_GAIN -> if (resumeOnGain) {
                    resumeOnGain = false
                    play()
                }
            }
        }, main)
        .build()

    private fun requestFocus(): Boolean =
        audio.requestAudioFocus(focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED

    private fun abandonFocus() = audio.abandonAudioFocusRequest(focusRequest)

    private val noisy = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, i: Intent?) {
            if (i?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) pause()
        }
    }
    private var noisyRegistered = false

    private fun registerNoisy() {
        if (noisyRegistered) return
        androidx.core.content.ContextCompat.registerReceiver(
            context.applicationContext,
            noisy,
            IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY),
            androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        noisyRegistered = true
    }

    private fun unregisterNoisy() {
        if (!noisyRegistered) return
        runCatching { context.applicationContext.unregisterReceiver(noisy) }
        noisyRegistered = false
    }

    // ── helpers ──

    private fun ensurePlayer(): StreamPlayer = player ?: StreamPlayer(SAMPLE_RATE, this).also { player = it }

    private fun setBuffering(b: Boolean) {
        buffering = b
        emitState()
    }

    private fun emitState() {
        val s = snapshot()
        main.post { listeners.forEach { it.onState(s) } }
    }

    private fun estimateMs(s: Segment): Long =
        if (s.isSilent) 0
        else pacing.estimateAudioMs(s.text.length, s.rate).coerceAtLeast(400) + if (s.breath) Performance.BREATH_MS else 0

    private fun isCharging(): Boolean {
        val bm = context.getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        return bm.isCharging
    }

    private fun isTooHot(): Boolean {
        val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.currentThermalStatus >= PowerManager.THERMAL_STATUS_SEVERE
    }

    /** Atomically records where the listener is, so a killed app resumes at the right sentence. */
    fun persistPosition() {
        val q = queue ?: return
        val json = JSONObject()
            .put("docId", q.docId)
            .put("index", currentIndex)
            .put("offsetMs", currentOffsetMs)
            .put("speed", speed.toDouble())
            .put("updatedAt", System.currentTimeMillis())
            .toString()
        val file = File(context.filesDir, "playback.json")
        val tmp = File(context.filesDir, "playback.json.tmp")
        runCatching {
            tmp.writeText(json)
            tmp.renameTo(file)
        }
    }

    fun lastPosition(): String? = runCatching { File(context.filesDir, "playback.json").readText() }.getOrNull()

    companion object {
        private const val TAG = "LamplightPlayback"

        /** The model's own speaking rate (Supertonic.synthesize default); a line's rate multiplies it. */
        private const val BASE_RATE = 1.05f
        const val MODEL_VERSION = "supertonic3-int8-v1"
        const val SAMPLE_RATE = 44_100
        const val STUDIO_PLUS_STEPS = 16
        /** The fewest steps narration drops to when the phone is falling behind. */
        private const val FLOOR_STEPS = 3
        private const val CALIBRATION_SAMPLES = 6
        private const val PACING_SAVE_EVERY = 10
        private const val LOOKAHEAD_MS = 30_000L
        private const val TICK_MS = 100L
        private const val FADE_MS = 10_000L

        @Volatile private var instance: PlaybackController? = null

        fun get(context: Context): PlaybackController =
            instance ?: synchronized(this) { instance ?: PlaybackController(context.applicationContext).also { instance = it } }
    }
}
