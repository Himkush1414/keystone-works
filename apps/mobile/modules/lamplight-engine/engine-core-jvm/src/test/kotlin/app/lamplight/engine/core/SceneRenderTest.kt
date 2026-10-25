package app.lamplight.engine.core

import ai.onnxruntime.OrtEnvironment
import org.json.JSONObject
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import java.io.File
import kotlin.math.ln

/**
 * Renders the sample scenes (packages/core/test/scenes.test.ts writes their queues) exactly as the player
 * would, line by line with their pauses, and measures the hand-overs: the silence the listener hears
 * between one speaker and the next. Writes one WAV per scene to -PprobeOut for listening.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SceneRenderTest {
    private val dir = System.getProperty("lamplight.engine.dir")?.let(::File)
    private lateinit var sessions: Sessions
    private lateinit var engine: Supertonic
    private lateinit var voices: Map<String, VoiceStyle>
    private val sr = 44_100

    @BeforeAll
    fun load() {
        assumeTrue(dir != null && File(dir, "manifest.json").exists(), "engine assets not available")
        val d = dir!!
        val env = OrtEnvironment.getEnvironment()
        val opts = Supertonic.sessionOptions(threads = 4)
        fun session(name: String) = env.createSession(File(d, "$name.onnx").absolutePath, opts)
        sessions = Sessions(session("duration_predictor"), session("text_encoder"), session("vector_estimator"), session("vocoder"))
        engine = Supertonic(env, sessions, EngineConfig.parse(File(d, "tts.json").readText()), Assets.indexer(File(d, "indexer.bin").readBytes()))
        voices = Assets.voices(File(d, "voices.bin").readBytes()).associateBy { it.id }
    }

    @AfterAll
    fun close() {
        if (::sessions.isInitialized) sessions.close()
    }

    private class Line(val text: String, val lang: String, val voice: String, val kind: String, val pauseMs: Int, val rate: Float, val gainDb: Float, val pitch: Float, val ending: String?, val runs: List<Run>?)

    /** The same steps as PlaybackController.runJob, piece by piece. */
    private fun render(l: Line): FloatArray {
        val pieces = Chunks.split(l.text, l.lang, l.runs)
        val joiner = Chunks.Joiner(sr)
        val out = ArrayList<Float>()
        val style = LineRender.Style(l.rate, l.gainDb, l.pitch, l.ending)
        pieces.forEachIndexed { k, p ->
            val last = k == pieces.lastIndex
            val raw = engine.synthesize(p.text, p.lang, voices.getValue(l.voice), 8, style.modelRate(1.05f), LineRender.continues(last, style))
            LineRender.piece(Chunks.trim(raw.samples, sr), sr, k, last, style, 0L, p.gapMs, joiner).forEach(out::add)
            if (!last) repeat(p.gapMs * sr / 1000) { out.add(0f) }
        }
        return out.toFloatArray()
    }

    @Test
    fun `speakers hand over like a conversation, and an interruption cuts in`() {
        val fixture = JSONObject(File(javaClass.getResource("/scenes.json")!!.toURI()).readText())
        val out = System.getProperty("lamplight.probe.out")?.let { File(it, "scenes").apply { mkdirs() } }
        for (name in fixture.keys()) {
            val segs = fixture.getJSONArray(name)
            val lines = (0 until segs.length()).map { segs.getJSONObject(it) }.filter { it.getString("text").isNotBlank() }.map { s ->
                Line(
                    s.getString("text"), s.getString("lang"), s.getString("voice"), s.getString("kind"), s.getInt("pauseMs"),
                    s.optDouble("rate", 1.0).toFloat(), s.optDouble("gainDb", 0.0).toFloat(), s.optDouble("pitch", 0.0).toFloat(),
                    s.optString("ending", "").ifEmpty { null },
                    s.optJSONArray("runs")?.let { r -> List(r.length()) { j -> r.getJSONObject(j).let { Run(it.getString("text"), it.getString("lang")) } } },
                )
            }
            val audio = lines.map(::render)
            if (System.getProperty("lamplight.probe") != null) audio.forEachIndexed { k, x ->
                println("onset $name $k ${Silences.levels(x, sr).take(30).map { it.toInt() }}")
            }
            val scene = ArrayList<Float>()
            val pitchByVoice = LinkedHashMap<String, MutableList<Double>>()
            audio.forEachIndexed { k, a ->
                val l = lines[k]
                // Each speaker's ordinary lines (no loudness change: not shouted, not whispered).
                if (l.kind == "dialogue" && l.gainDb > -2f && l.gainDb < 2f) pitchByVoice.getOrPut(l.voice) { ArrayList() }
                    .addAll(Prosody.pitch(a, sr))
                a.forEach(scene::add)
                if (k < audio.lastIndex) {
                    repeat(l.pauseMs * sr / 1000) { scene.add(0f) }
                    // Silence as the trimmer sees it: anything above its floor is sound (a soft nasal onset like
                    // "अँ" sits between -50 and -45 dB, and is speech, not a gap).
                    val tail = Silences.edges(a, sr, Chunks.TRIM_FLOOR_DB).second
                    val onset = Silences.edges(audio[k + 1], sr, Chunks.TRIM_FLOOR_DB).first
                    val heard = tail + l.pauseMs + onset
                    // TURN in perform/plan.ts: interrupt 40, quick 300, gap 520 (before a character's pause scale).
                    val tag = when {
                        l.ending == "cut" -> "interrupted"
                        l.pauseMs == 300 -> "quick hand-over"
                        l.pauseMs == 520 -> "hand-over"
                        else -> ""
                    }
                    if (tag.isNotEmpty()) println("scene  %-16s %-16s %4d ms heard (tail %d + pause %d + onset %d)  after \"%s\"".format(
                        name, tag, heard, tail, l.pauseMs, onset, l.text.takeLast(40),
                    ))
                    if (tag == "interrupted") assertTrue(heard <= 120, "$name: interruption heard as $heard ms")
                    if (tag == "hand-over") assertTrue(heard in 520..720, "$name: hand-over heard as $heard ms")
                    if (tag == "quick hand-over") assertTrue(heard in 300..500, "$name: quick hand-over heard as $heard ms")
                }
            }
            val medians = pitchByVoice.mapValues { (_, v) -> v.sorted().let { if (it.isEmpty()) 0.0 else it[it.size / 2] } }
            println("scene  %-16s pitch by voice: %s".format(name, medians.entries.joinToString { "${it.key} ${it.value.toInt()} Hz" }))
            val ordered = medians.values.filter { it > 0 }.sorted()
            for (k in 1 until ordered.size) {
                val gap = 12 * ln(ordered[k] / ordered[k - 1]) / ln(2.0)
                assertTrue(gap > 1.0 || medians.size < 2, "$name: two speakers within $gap st of each other ($medians)")
            }
            out?.let { AudioWav.write(File(it, "$name.wav"), scene.toFloatArray(), sr) }
        }
    }
}
