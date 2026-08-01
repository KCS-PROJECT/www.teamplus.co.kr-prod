    pluginManagement {
    val flutterSdkPath =
        run {
            val properties = java.util.Properties()
            file("local.properties").inputStream().use { properties.load(it) }
            val flutterSdkPath = properties.getProperty("flutter.sdk")
            require(flutterSdkPath != null) { "flutter.sdk not set in local.properties" }
            flutterSdkPath
        }

    includeBuild("$flutterSdkPath/packages/flutter_tools/gradle")

    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

plugins {
    id("dev.flutter.flutter-plugin-loader") version "1.0.0"
    // [2026-08-01] AGP 8.11.1 → 9.0.0 · KGP 2.1.0 → 2.2.20 상향.
    // Play Console 권장 조치(R8 최적화) 의 "AGP 9.0 이상 업그레이드" 지적 해소 +
    // Flutter 3.41 Kotlin 2.2.20 미만 지원 중단 경고 해소 (warnKGPVersion=2.2.20).
    // Gradle wrapper 는 9.1.0 (AGP 9 최소 요구) — gradle-wrapper.properties.
    id("com.android.application") version "9.0.0" apply false
    id("org.jetbrains.kotlin.android") version "2.2.20" apply false
    id("com.google.gms.google-services") version "4.4.2" apply false
}

include(":app")
