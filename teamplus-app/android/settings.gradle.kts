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

    // [2026-09-05 Play 권장 조치 ③ 측정 전용] R8 Configuration Analyzer 용 R8 override.
    //   AGP 9.0.0 내장 R8(9.0.x) 에는 분석기(-Dcom.android.tools.r8.dumpkeepradiushtmltodirectory)
    //   가 없어(요구: R8 9.3.7-dev+, AGP 9.3 미만은 settings classpath override 방식)
    //   Gradle 속성 `-Pr8Analyzer` 가 **존재할 때만** R8 9.4.17 을 settings classpath 에 올린다.
    //   속성이 없으면 이 블록은 아무것도 추가하지 않는다 → 운영 빌드(R8 9.0.32) 불변.
    //   사용: cd android && JAVA_HOME=<JDK17+> ./gradlew :app:bundleRelease -Pr8Analyzer=true \
    //        -Dcom.android.tools.r8.dumpkeepradiushtmltodirectory=<절대경로>
    //   측정용 AAB 는 업로드하지 않는다. AGP 9.3+ 승급 시 :app:analyzeReleaseR8Config 로 대체하고 제거.
    val r8AnalyzerEnabled = providers.gradleProperty("r8Analyzer").isPresent
    buildscript {
        if (r8AnalyzerEnabled) {
            repositories {
                google()
                mavenCentral()
            }
            dependencies {
                classpath("com.android.tools:r8:9.4.17")
            }
        }
    }

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
