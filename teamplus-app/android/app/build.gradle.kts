import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
    id("com.google.gms.google-services")
}

// key.properties 로드
val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    namespace = "kr.co.teamplus"
    compileSdk = 36
    ndkVersion = "28.2.13676358"

    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_11.toString()
    }

    defaultConfig {
        applicationId = "kr.co.teamplus"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = 24
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            keyAlias = keystoreProperties["keyAlias"] as String? ?: ""
            keyPassword = keystoreProperties["keyPassword"] as String? ?: ""
            storeFile = keystoreProperties["storeFile"]?.let { file(it as String) }
            storePassword = keystoreProperties["storePassword"] as String? ?: ""
        }
    }

    buildTypes {
        release {
            signingConfig = if (keystorePropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }
}

// === Google Play 16KB 페이지 크기 대응 (2026-06-18) ===
// flutter_jailbreak_detection 이 transitive 로 가져오는 RootBeer 0.1.0(JitPack)의
// libtoolChecker.so 가 4KB 정렬(ELF p_align 0x1000)이라 Android 15 16KB 페이지를
// 지원하지 못해 프로덕션 출시가 차단된다(검토 화면 "앱이 16KB 메모리 페이지 크기를
// 지원하지 않습니다" 오류). RootBeer 0.1.1+ 는 16KB 정렬 native lib 을 제공하므로
// mavenCentral 의 com.scottyab:rootbeer-lib:0.1.2 로 치환한다. (루팅 감지 기능 유지)
configurations.all {
    resolutionStrategy {
        dependencySubstitution {
            substitute(module("com.github.scottyab:rootbeer"))
                .using(module("com.scottyab:rootbeer-lib:0.1.2"))
                .because("16KB page size (Android 15) — libtoolChecker.so 16KB alignment")
        }
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

flutter {
    source = "../.."
}
