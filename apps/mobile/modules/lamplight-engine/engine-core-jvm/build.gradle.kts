import java.security.MessageDigest
import java.net.URI

// JVM build of the engine core (the same sources the Android module ships) so the speech pipeline can be
// tested on any machine with the real voice model.
plugins {
    kotlin("jvm") version "2.2.20"
}

kotlin {
    jvmToolchain(17)
}

// The queue file format (Queue.kt) is plain Kotlin and org.json, so it's compiled here too and tested.
val queueSources = layout.buildDirectory.dir("generated/queue")
val copyQueueSource by tasks.registering(Copy::class) {
    from("../android/src/main/java/app/lamplight/engine") { include("Queue.kt") }
    into(queueSources)
}

// The PDF line extractor is written against PDFBox-Android; the same source compiles against Apache PDFBox
// once the package names are swapped (the two share their API).
val pdfSources = layout.buildDirectory.dir("generated/pdf")
val copyPdfSources by tasks.registering(Copy::class) {
    from("../android/src/main/java/app/lamplight/engine/pdf")
    into(pdfSources)
    filter { line: String -> line.replace("com.tom_roush.pdfbox", "org.apache.pdfbox") }
}

sourceSets {
    main {
        kotlin.srcDir("../android/src/main/java/app/lamplight/engine/core")
        kotlin.srcDir(copyQueueSource)
        kotlin.srcDir(copyPdfSources)
    }
}

dependencies {
    implementation("com.microsoft.onnxruntime:onnxruntime:1.31.0")
    implementation("org.apache.pdfbox:pdfbox:2.0.27")
    implementation("org.json:json:20250517")
    testImplementation(platform("org.junit:junit-bom:5.13.4"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

val assetsVersion = "supertonic3-int8-v1"
val assetsUrl = "https://github.com/Himkush1414/keystone-works/releases/download/engine-assets-v1/lamplight-engine-$assetsVersion.zip"
val assetsSha256 = "1e49e5788df8bb5655a296cad93c751620124ebbbf36fd504ef196b86dc6bd76"
val assetsZip = layout.buildDirectory.file("engine-assets/lamplight-engine-$assetsVersion.zip")
val assetsDir = layout.buildDirectory.dir("engine-assets/$assetsVersion")

/** Downloads the engine asset pack once and refuses it unless the SHA-256 matches. */
val downloadEngineAssets by tasks.registering {
    outputs.file(assetsZip)
    doLast {
        val target = assetsZip.get().asFile
        fun sha(f: File) = MessageDigest.getInstance("SHA-256").digest(f.readBytes()).joinToString("") { "%02x".format(it) }
        if (target.exists() && sha(target) == assetsSha256) return@doLast
        target.parentFile.mkdirs()
        URI(assetsUrl).toURL().openStream().use { input -> target.outputStream().use { input.copyTo(it) } }
        val actual = sha(target)
        if (actual != assetsSha256) {
            target.delete()
            throw GradleException("Engine assets checksum mismatch: $actual")
        }
    }
}

val extractEngineAssets by tasks.registering(Copy::class) {
    dependsOn(downloadEngineAssets)
    from(zipTree(assetsZip))
    into(assetsDir)
}

tasks.test {
    useJUnitPlatform()
    if (!project.hasProperty("skipModel")) {
        dependsOn(extractEngineAssets)
        systemProperty("lamplight.engine.dir", assetsDir.get().asFile.absolutePath)
    }
    systemProperty("lamplight.parity", file("src/test/resources/parity.json").absolutePath)
    project.findProperty("pdfs")?.let { systemProperty("lamplight.pdfs", it.toString()) }
    project.findProperty("probe")?.let { systemProperty("lamplight.probe", it.toString()) }
    project.findProperty("probeOut")?.let { systemProperty("lamplight.probe.out", it.toString()) }
    testLogging {
        events("passed", "skipped", "failed")
        showStandardStreams = true
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
    }
    maxHeapSize = "2g"
}
