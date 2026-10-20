# ONNX Runtime uses JNI and reflection on its Java API.
-keep class ai.onnxruntime.** { *; }
# PdfBox-Android loads resources and optional classes reflectively.
-keep class com.tom_roush.pdfbox.** { *; }
-dontwarn com.tom_roush.pdfbox.**
-dontwarn org.bouncycastle.**
-dontwarn com.gemalto.jp2.**
