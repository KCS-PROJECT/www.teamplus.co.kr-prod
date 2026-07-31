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
            // key.properties 가 있으면 release 키로 서명한다.
            // 없으면 예전엔 조용히 debug 키로 서명했는데(아래 주석), 그 결과 debug 서명된
            // AAB 가 Play Console 에 업로드되어 "디버그 모드로 서명" 거부를 유발했다.
            // → silent fallback 대신 명시적으로 실패시킨다(fail-loud).
            //   (이전: signingConfig = signingConfigs.getByName("debug"))
            //
            // [2026-07-15 FIX] 단, 이 블록은 Gradle **configuration 단계**에 평가되므로
            // 여기서 직접 throw 하면 assembleDebug 까지 전부 차단된다 — keystore 가
            // 없는 개발 PC(집 PC 등)에서 debug 빌드/에뮬레이터 실행이 불가능해지는
            // 회귀. fail-loud 는 release 태스크가 실제 실행 그래프에 오른 경우에만
            // 발동하도록 아래 `gradle.taskGraph.whenReady` 가드로 이동했다.
            signingConfig = if (keystorePropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                null // 서명 미설정 — release 실행 시 아래 가드가 명시적으로 실패시킴
            }

            // [2026-08-01 Play 권장 조치] R8 최적화 — 버전 13(1.0.2)까지 minify 가
            // 꺼져 있어 "최적화된 리소스 축소가 사용 설정되지 않음" 권장이 반복 노출됐다.
            // gradle.properties 의 android.r8.optimizedResourceShrinking=true 는
            // isShrinkResources=true 가 전제라 단독으로는 무의미했다(7/20 대응의 사각).
            // keep 규칙은 proguard-rules.pro (gson 기반 flutter_local_notifications 등).
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

// === release fail-loud 가드 (2026-07-15) ===
// key.properties 없이 release 계열 태스크(assembleRelease/bundleRelease/
// packageRelease 등)가 실행 그래프에 오르면 명시적으로 빌드를 실패시킨다.
// debug 빌드(assembleDebug)는 영향받지 않는다.
gradle.taskGraph.whenReady {
    val releaseRequested = allTasks.any {
        it.project.path == project.path && it.name.endsWith("Release")
    }
    if (releaseRequested && !keystorePropertiesFile.exists()) {
        throw GradleException(
            "release 빌드에 필요한 android/key.properties 가 없습니다. " +
            "키스토어 설정 파일을 배치한 뒤 다시 빌드하세요. " +
            "(debug 키로 서명된 AAB 는 Google Play 가 거부합니다)"
        )
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
