package app.lamplight.engine

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * The on-device dictionary behind "What does this word mean here?" (built by tooling/scripts/build-dictionary.mjs
 * from WordNet and Wiktionary). It ships compressed in the APK and is unpacked once, on first use, to private
 * storage, where SQLite reads it in place. Lookups take a few milliseconds; choosing the sense is done in
 * packages/core (`explain`), so this only returns rows.
 */
class Lexicon(private val context: Context) {
    private var db: SQLiteDatabase? = null

    @Synchronized
    private fun open(): SQLiteDatabase {
        db?.let { return it }
        val file = File(context.noBackupFilesDir, "lexicon-$VERSION.db")
        if (!file.exists()) {
            val tmp = File(file.path + ".tmp")
            context.assets.open(ASSET).use { input -> tmp.outputStream().use { input.copyTo(it, 1 shl 16) } }
            if (!tmp.renameTo(file)) throw IllegalStateException("could not unpack the dictionary")
            context.noBackupFilesDir.listFiles { f -> f.name.startsWith("lexicon-") && f != file }?.forEach { it.delete() }
        }
        return SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READONLY).also { db = it }
    }

    /** Unpacks the dictionary ahead of the first question, off the main thread. */
    fun warm() {
        runCatching { open() }
    }

    /** [request] is `{"en": [...], "hi": [...]}` (packages/core `lookupRequest`); returns `LookupRows` as JSON. */
    fun lookup(request: String): String {
        val r = JSONObject(request)
        val en = r.optJSONArray("en").strings()
        val hi = r.optJSONArray("hi").strings()
        val d = open()
        val enRows = query(d, "SELECT word, pos, rank, gloss, example, syn, tagged FROM en WHERE word IN (%s) ORDER BY word, pos, rank", en)
        val forms = query(d, "SELECT form, word FROM hi_form WHERE form IN (%s)", hi)
        val hiWords = (hi + (0 until forms.length()).map { forms.getJSONObject(it).getString("word") }).distinct()
        val hiRows = query(
            d,
            "SELECT word, pos, rank, gloss, roman, syn, example, example_en AS exampleEn FROM hi WHERE word IN (%s) ORDER BY word, rank",
            hiWords,
        )
        // Hindi for the word and for the synonyms of its senses, each with its own gloss to match the sense.
        val synonyms = (0 until enRows.length()).flatMap { enRows.getJSONObject(it).optString("syn").split('|') }
        val lemmas = (en + synonyms).map { it.lowercase() }.filter { it.isNotBlank() }.distinct().take(MAX_ARGS)
        val enHi = query(
            d,
            "SELECT e.en, e.hi, e.rank, h.gloss FROM en_hi e JOIN hi h ON h.word = e.hi AND h.rank = 0 " +
                "WHERE e.en IN (%s) ORDER BY e.rank LIMIT 60",
            lemmas,
        )
        return JSONObject().put("en", enRows).put("hi", hiRows).put("enHi", enHi).put("hiForms", forms).toString()
    }

    private fun query(d: SQLiteDatabase, sql: String, args: List<String>): JSONArray {
        val out = JSONArray()
        if (args.isEmpty()) return out
        val list = args.take(MAX_ARGS)
        d.rawQuery(sql.format(list.joinToString(",") { "?" }), list.toTypedArray()).use { c ->
            while (c.moveToNext()) {
                val o = JSONObject()
                for (k in 0 until c.columnCount) {
                    when (c.getType(k)) {
                        android.database.Cursor.FIELD_TYPE_INTEGER -> o.put(c.getColumnName(k), c.getLong(k))
                        android.database.Cursor.FIELD_TYPE_NULL -> {}
                        else -> o.put(c.getColumnName(k), c.getString(k))
                    }
                }
                out.put(o)
            }
        }
        return out
    }

    private fun JSONArray?.strings(): List<String> =
        if (this == null) emptyList() else (0 until length()).map { getString(it) }.filter { it.isNotBlank() }.distinct()

    companion object {
        const val VERSION = "v1"
        const val ASSET = "dictionary/lexicon.db"
        private const val MAX_ARGS = 60
    }
}
