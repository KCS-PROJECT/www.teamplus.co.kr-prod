allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

val newBuildDir = rootProject.layout.buildDirectory.dir("../../build").get().asFile
rootProject.layout.buildDirectory.set(newBuildDir)

subprojects {
    project.layout.buildDirectory.set(File(newBuildDir, project.name))
}

subprojects {
    project.evaluationDependsOn(":app")

    tasks.withType<org.gradle.api.tasks.compile.JavaCompile>().configureEach {
        suppressJavacWarnings()
    }

    // AGP 8+ namespace 미지정 플러그인 호환 패치
    plugins.withId("com.android.library") {
        extensions.findByType<com.android.build.gradle.LibraryExtension>()?.let { android ->
            if (android.namespace.isNullOrEmpty()) {
                val manifest = file("src/main/AndroidManifest.xml")
                if (manifest.exists()) {
                    val pkg = Regex("""package="([^"]+)"""").find(manifest.readText())?.groupValues?.get(1)
                    if (!pkg.isNullOrEmpty()) {
                        android.namespace = pkg
                    }
                }
            }
        }
    }
}

gradle.projectsEvaluated {
    subprojects {
        tasks.withType<org.gradle.api.tasks.compile.JavaCompile>().configureEach {
            suppressJavacWarnings()

            if (project.name == "flutter_inappwebview_android") {
                logging.captureStandardOutput(org.gradle.api.logging.LogLevel.INFO)
                logging.captureStandardError(org.gradle.api.logging.LogLevel.INFO)
            }
        }
    }
}

fun org.gradle.api.tasks.compile.JavaCompile.suppressJavacWarnings() {
    options.isWarnings = false
    options.compilerArgs.removeAll(
        listOf(
            "-Xlint:all",
            "-Xlint:deprecation",
            "-Xlint:unchecked",
        )
    )
    options.compilerArgs.addAll(
        listOf(
            "-nowarn",
            "-Xlint:none",
            "-Xlint:-options",
            "-Xlint:-deprecation",
            "-Xlint:-unchecked",
        )
    )
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
