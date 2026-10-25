package app.lamplight.engine.core

import java.text.Normalizer

/**
 * Model-ready text for Supertonic 3. Mirrors `prepareForModel` in packages/engine-web (checked by the parity
 * test). The replacement table and language tags follow Supertone's MIT-licensed reference implementation
 * (github.com/supertone-inc/supertonic, Copyright (c) 2025 Supertone Inc.).
 */
object Prepare {
    val MODEL_LANGUAGES = setOf(
        "en", "ko", "ja", "ar", "bg", "cs", "da", "de", "el", "es", "et", "fi", "fr", "hi", "hr", "hu",
        "id", "it", "lt", "lv", "nl", "pl", "pt", "ro", "ru", "sk", "sl", "sv", "tr", "uk", "vi",
    )

    private val replacements = listOf(
        Regex("[–‑—]") to "-",
        Regex("_") to " ",
        Regex("[“”]") to "\"",
        Regex("[‘’´`]") to "'",
        Regex("[\\[\\]|/#→←]") to " ",
        Regex("[♥☆♡©\\\\]") to "",
    )
    private val emoji = Regex("[\\x{1F000}-\\x{1FAFF}\\x{2600}-\\x{27BF}\\x{1F1E6}-\\x{1F1FF}]|\\x{FE0F}|\\x{200D}")
    private val spaceBeforePunct = Regex("\\s+([,.!?;:'])")
    private val doubleQuotes = Regex("\"{2,}")
    private val doubleApostrophes = Regex("'{2,}")
    private val spaces = Regex("\\s+")
    private val finalPunct = Regex("[.!?;:,'\")\\]}…。」』】〉》›»]$")

    private val trailingDash = Regex("\\s*-$")

    /**
     * [continues] marks a piece that the rest of its sentence follows: it ends on a comma, not the full stop
     * the reference adds, so the model doesn't drop its pitch and close the sentence mid-way.
     */
    fun forModel(text: String, lang: String, continues: Boolean = false): String {
        val base = lang.take(2).let { if (it in MODEL_LANGUAGES) it else "en" }
        var t = Normalizer.normalize(text, Normalizer.Form.NFKD).replace(emoji, "")
        for ((re, to) in replacements) t = t.replace(re, to)
        t = t.replace(spaceBeforePunct, "$1")
            .replace(doubleQuotes, "\"")
            .replace(doubleApostrophes, "'")
            .replace(spaces, " ")
            .trim()
        if (continues) t = t.replace(trailingDash, "")
        if (t.isNotEmpty() && !finalPunct.containsMatchIn(t)) t += if (continues) "," else "."
        return "<$base>$t</$base>"
    }
}
