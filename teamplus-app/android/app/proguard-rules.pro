# TEAMPLUS release R8 keep 규칙 (2026-08-01 · Play 권장 조치 R8 최적화 대응)
#
# Flutter 엔진/플러그인 자체 keep 은 Flutter Gradle Plugin 과 각 AAR 의
# consumer rules 가 자동 주입한다. 여기에는 그 밖에 리플렉션/직렬화로
# R8 full mode 에서 깨질 수 있는 최소 규칙만 명시한다.

# ── flutter_local_notifications ─────────────────────────────────────
# 알림 payload 를 gson 으로 (역)직렬화한다 — 클래스·제네릭 시그니처 유지 필수.
# (공식 README 권장 규칙)
-keep class com.dexterous.** { *; }
-keepattributes Signature
-keepattributes *Annotation*
-keepattributes EnclosingMethod
-keepattributes InnerClasses

# gson — TypeToken 제네릭 시그니처가 지워지면 런타임 파싱 실패
-keep class com.google.gson.** { *; }
-keep class * extends com.google.gson.reflect.TypeToken
-keep public class * implements java.lang.reflect.Type
-dontwarn sun.misc.**

# ── Play Core (deferred components 미사용) ──────────────────────────
# Flutter 엔진이 참조하지만 앱은 미포함 — R8 full mode missing class 경고 억제
-dontwarn com.google.android.play.core.**

# ── 컴파일 전용 어노테이션 ──────────────────────────────────────────
-dontwarn javax.annotation.**
-dontwarn org.checkerframework.**
-dontwarn kotlin.annotations.jvm.**
