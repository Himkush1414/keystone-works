package app.lamplight.engine.core

import ai.onnxruntime.OrtEnvironment
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import java.io.File

/**
 * Renders real sentences with the real model, pieces and all, the way the player hears them, and scans the
 * audio for silences inside each sentence. "Before" is the old path (model padding left in, 4 ms edge fades,
 * the old gaps); "after" is today's (padding trimmed, overlapped joins, continuing pieces end on a comma).
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class GapScanTest {
    private val dir = System.getProperty("lamplight.engine.dir")?.let(::File)
    private lateinit var sessions: Sessions
    private lateinit var engine: Supertonic
    private lateinit var voices: Map<String, VoiceStyle>
    private val sr = 44_100
    private val steps = 8

    private class Case(val name: String, val text: String, val lang: String, val runs: List<Run>? = null)

    private val cases = listOf(
        Case("en commas", "When she finally reached the old house at the end of the lane, the door was already open, and a cold wind was moving through the empty rooms.", "en"),
        Case("en dashes", "He had promised himself — and he had meant it at the time — that he would never come back to this town again.", "en"),
        Case("en semicolon", "The rain had stopped at last; the streets were quiet, wet and shining under the lamps, and nobody at all was out.", "en"),
        Case("en titles", "Mister Bennet looked up from his book, took off his spectacles, and said that Doctor A. K. Sharma would arrive at nine a.m. tomorrow.", "en"),
        Case("en decimals", "The parcel weighed two point five kilograms, cost three pounds seventy-five to send, and took four whole days to arrive.", "en"),
        Case("en no breaks", "She walked slowly along the narrow path that wound between the tall dark trees towards the little cottage where her grandmother had lived for more than sixty years without ever once leaving the valley or wishing that she had gone anywhere else at all.", "en"),
        Case("en ellipsis", "I thought... no, never mind, it does not really matter any more now that everyone has finally gone home.", "en"),
        Case("hi commas", "मैं कल सुबह बाज़ार गया, और वहाँ मुझे मेरा पुराना दोस्त मिला, जिसे मैंने बरसों से नहीं देखा था।", "hi"),
        Case("hi dash", "वह एक पल के लिए रुकी — फिर बहुत धीरे से बोली कि अब बहुत देर हो चुकी है और कोई नहीं आएगा।", "hi"),
        Case(
            "hi→en→hi", "उसने धीरे से कहा so that I never forget this moment और फिर चुप हो गई।", "hi",
            listOf(Run("उसने धीरे से कहा", "hi"), Run("so that I never forget this moment", "en"), Run("और फिर चुप हो गई।", "hi")),
        ),
        Case(
            "en→hi→en", "My grandmother always used to say जो होता है अच्छे के लिए होता है and she truly believed it.", "en",
            listOf(Run("My grandmother always used to say", "en"), Run("जो होता है अच्छे के लिए होता है", "hi"), Run("and she truly believed it.", "en")),
        ),
        Case("en long clause", "Well, I suppose we could always try again tomorrow morning, if the weather holds and nobody else in the house objects to it.", "en"),
    )

    /** The gaps before this change, keyed by today's gap for the same punctuation. */
    private val oldGap = mapOf(Chunks.COMMA_GAP_MS to 90, Chunks.CLAUSE_GAP_MS to 180, Chunks.DASH_GAP_MS to 140, Chunks.SWITCH_GAP_MS to 30, 0 to 0)

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

    /** A sentence as heard: its audio and where each join sits (ms), with the gap that was asked for there. */
    private class Heard(val audio: FloatArray, val joins: List<Pair<Int, Int>>)

    private fun assemble(parts: List<Pair<FloatArray, Int>>): Heard {
        val out = ArrayList<Float>()
        val joins = ArrayList<Pair<Int, Int>>()
        parts.forEachIndexed { k, (samples, gap) ->
            samples.forEach(out::add)
            if (k < parts.lastIndex) {
                joins.add(out.size * 1000 / sr to gap)
                repeat(gap * sr / 1000) { out.add(0f) }
            }
        }
        return Heard(out.toFloatArray(), joins)
    }

    private fun before(c: Case, voice: VoiceStyle): Heard {
        val pieces = Chunks.split(c.text, c.lang, c.runs)
        return assemble(pieces.mapIndexed { k, p ->
            val raw = engine.synthesize(p.text, p.lang, voice, steps).samples
            val n = minOf(raw.size / 2, sr * 4 / 1000)
            val s = raw.copyOf()
            if (pieces.size > 1) for (i in 0 until n) {
                val g = i.toFloat() / n
                if (k > 0) s[i] *= g
                if (k < pieces.lastIndex) s[s.size - 1 - i] *= g
            }
            s to oldGap.getValue(p.gapMs)
        })
    }

    /** Exactly the steps PlaybackController.runJob takes (gain and breath aside). */
    private fun after(c: Case, voice: VoiceStyle): Heard {
        val pieces = Chunks.split(c.text, c.lang, c.runs)
        val joiner = Chunks.Joiner(sr)
        return assemble(pieces.mapIndexed { k, p ->
            val last = k == pieces.lastIndex
            val raw = engine.synthesize(p.text, p.lang, voice, steps, continues = !last)
            joiner.push(Chunks.trim(raw.samples, raw.sampleRate), p.gapMs, last) to p.gapMs
        })
    }

    /** The silent run around each join, in ms (0 if sound runs straight through). */
    private fun joinSilences(h: Heard): List<Int> {
        val gaps = Silences.inside(h.audio, sr, minMs = 10)
        return h.joins.map { (at, gap) ->
            gaps.firstOrNull { at + gap / 2 in it.startMs - 10..it.startMs + it.ms + 10 }?.ms ?: 0
        }
    }

    private fun longest(h: Heard) = Silences.inside(h.audio, sr, minMs = 10).maxOfOrNull { it.ms } ?: 0

    @Test
    fun `no silence inside a sentence is longer than its punctuation asks for`() {
        val rows = ArrayList<String>()
        var beforeOver500 = 0
        var afterOver500 = 0
        val beforeJoins = ArrayList<Int>()
        val afterJoins = ArrayList<Int>()
        val modelComma = ArrayList<Int>()
        for ((k, c) in cases.withIndex()) {
            val voice = voices.getValue(if (k % 2 == 0) "F1" else "M2")
            val whole = engine.synthesize(c.text, c.lang, voice, steps).samples
            val own = Silences.inside(whole, sr, minMs = 150).maxOfOrNull { it.ms } ?: 0
            modelComma.add(own)
            val b = before(c, voice)
            val a = after(c, voice)
            val bj = joinSilences(b)
            val aj = joinSilences(a)
            beforeJoins.addAll(bj)
            afterJoins.addAll(aj)
            beforeOver500 += Silences.inside(b.audio, sr, minMs = 500).size
            afterOver500 += Silences.inside(a.audio, sr, minMs = 500).size
            rows.add("%-14s joins %-22s before %-22s after %-22s longest before %4d after %4d model's own %4d".format(
                c.name, a.joins.map { it.second }, bj, aj, longest(b), longest(a), own,
            ))
            a.joins.zip(aj).forEach { (j, heard) ->
                val (_, asked) = j
                val ceiling = if (asked == 0) 150 else asked + 200
                assertTrue(heard <= ceiling, "${c.name}: join heard $heard ms, asked $asked ms")
            }
            assertTrue(longest(a) <= 600, "${c.name}: longest silence ${longest(a)} ms")
        }
        rows.forEach { println("gap scan  $it") }
        println("gap scan  joins: ${beforeJoins.size}; mean silence before ${beforeJoins.average().toInt()} ms (max ${beforeJoins.max()}), after ${afterJoins.average().toInt()} ms (max ${afterJoins.max()})")
        println("gap scan  silences ≥ 500 ms inside a sentence: before $beforeOver500, after $afterOver500")
        println("gap scan  the model's own longest pause inside a whole sentence: ${modelComma.min()}–${modelComma.max()} ms")
        assertTrue(afterOver500 == 0, "silences ≥ 500 ms after: $afterOver500")
    }

    @Test
    fun `the pause between sentences is the one the plan asks for`() {
        val voice = voices.getValue("F1")
        val a = engine.synthesize("The rain had stopped at last.", "en", voice, steps).samples
        val b = engine.synthesize("Nobody was out.", "en", voice, steps).samples
        val padded = Silences.edges(a, sr).second + Silences.edges(b, sr).first
        val ta = Chunks.trim(a, sr)
        val tb = Chunks.trim(b, sr)
        val trimmed = Silences.edges(ta, sr).second + Silences.edges(tb, sr).first
        println("gap scan  between sentences, on top of the planned pause: before $padded ms of model padding, after $trimmed ms")
        assertTrue(trimmed <= Chunks.LEAD_KEEP_MS + Chunks.TRAIL_KEEP_MS + 30, "edges left: $trimmed ms")
        // Trimming keeps every sound: what's cut is below the floor.
        val kept = Silences.levels(ta, sr).count { it > -45 }
        val all = Silences.levels(a, sr).count { it > -45 }
        assertTrue(kept >= all - 1, "frames with sound: $kept of $all")
    }
}
