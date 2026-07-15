# 딥링크 · 앱 유도 · Deferred Deep Link 설계

> **작성일**: 2026-07-01 · **상태**: 설계(구현 전) · **브레인스토밍 산출물**
> **관련 목표**: 앱 심사 마무리 단계 — 앱/푸시 진입 시 해당 메뉴 이동, SNS 진입 시 설치 판별 → 앱 실행 또는 스토어 유도 → 설치 후 원래 화면 복귀

---

## 1. Context (왜)

앱 심사 마무리 단계에서 다음을 완성해야 한다.

1. **앱/푸시 진입 → 해당 메뉴 이동** — 딥링크는 되지만 **푸시는 항상 알림 목록으로만** 떨어짐.
2. **SNS(카카오톡/릴스/페북/네이버/X/인스타) 진입 → 설치 판별** → 설치 시 앱 실행+화면 이동, 미설치 시 **스토어(iOS/Android 분기) 이동**.
3. **설치 후 원래 눌렀던 메뉴로 복귀** (deferred deep link).

인프라(커스텀 스킴 `teamplus://`, Universal/App Links `teamplusweb.icetimes.co.kr`, `/get-app` 랜딩, `tryOpenAppWithFallback` 등)는 **대부분 이미 존재**하나, ① 앱 유도 훅이 미마운트(dead code) ② 패키지명/스토어ID 버그 ③ SNS 인앱브라우저 대응 없음 ④ 푸시 정밀 라우팅 미구현 ⑤ deferred 수신부 미구현 — 5개 갭이 있다.

---

## 2. 현황 진단 (3-트랙 조사 실측)

| 요구 | 현재 | 판정 | 근거 |
|------|------|------|------|
| 앱 진입 → 메뉴 이동 | `deep_link_handler.dart` 3종 입력(스킴/UL/카카오)→`teamplusNavigate`, 콜드스타트 pending-consume | ✅ | `deep_link_handler.dart:167-314`, `webview_screen.dart:1416-1422` |
| 푸시 탭 → 메뉴 이동 | `getInitialMessage`/`onMessageOpenedApp` 존재하나 **payload 무시하고 항상 `/notifications`(네이티브 목록)** | 🔴 | `main.dart:344-352`, `push_notification_service.dart:611-623` |
| SNS 진입 → 설치판별 → 앱/스토어 | `openInAppOrInstall()`+`tryOpenAppWithFallback()` 구현됐으나 **미마운트(dead code)**. SNS 인앱브라우저 감지·`intent://` 없음 | 🔴 | `useDeeplinkRouter.ts`(호출부 0건), `app-install.ts:181-249` |
| 미설치 → 스토어(분기) | `/get-app`+`getStoreUrl()` 존재. **패키지명 버그로 Play 링크 깨짐**, App Store 숫자 ID 미설정 | 🔴 | `env.ts:214`, `app-install.ts:27,65-92` |
| 설치 후 복귀(deferred) | referrer 전달 배선만, **네이티브 수신부 없음** | ❌ | `app-install.ts:84`, grep 0건 |

**부수 발견**: 단건 `createNotification` 푸시엔 `linkUrl` 미포함(배치만 포함) · 네이티브 알림목록 항목 onTap 라우팅 없음 · 웹 알림목록 항목→상세는 `linkUrl→href`로 정상 동작 · `share.ts`는 현재 URL 그대로 공유(딥링크 URL 빌더 `buildDeeplink`와 미연결).

---

## 3. 확정 결정 (사용자)

- **deferred 방식 = 경량 커스텀** — Android는 Play Install Referrer로 정확 복원, iOS는 서버토큰+클립보드 best-effort. **외부 SDK 0, 비용 0.**
- **App Store 숫자 ID = 미보유** → env `NEXT_PUBLIC_IOS_APP_STORE_ID` placeholder(검색 fallback) 유지, 출시 후 값 주입(코드 수정 불필요).
- 재사용 인프라: 스킴 `teamplus://`, Universal Links `teamplusweb.icetimes.co.kr`, package/bundle **`kr.co.teamplus`**.

---

## 4. 아키텍처 — 전체 플로우

```
[SNS 링크 클릭:  https://teamplusweb.icetimes.co.kr/classes/123]
        │  UA 감지: 일반 브라우저 vs SNS 인앱브라우저
   ┌────┴───────────────────────┬──────────────────────────────┐
   │ 일반 브라우저(Safari/Chrome)│ SNS 인앱(카톡/인스타/페북/X/네이버) │
   ▼                            ▼
 OS Universal/App Link 발동      인앱은 UL 차단 → 브릿지 페이지가 대응
  ├ 설치O → 앱 열림+화면 이동      ├ Android → intent://…;S.browser_fallback_url=스토어
  └ 설치X → 웹페이지 로드          ├ iOS 카톡 → kakaotalk://web/openExternal?url=…(→Safari)
             │                    └ iOS 인스타/페북 → "Safari에서 열기" 안내 + 링크복사
             ▼
     openInAppOrInstall: teamplus:// 1.5s 시도
             └ 미열림 → /get-app?redirect=/classes/123
                        ├ iOS → App Store (ID 또는 검색 fallback)
                        └ Android → Play (&referrer=<token>)
                                   ▼  설치 → 첫 실행
                          [deferred 복원 — 경량 커스텀]
                           ├ Android: install_referrer 읽음 → /classes/123 ✅
                           └ iOS: 서버토큰+클립보드 매칭 → /classes/123 🟡best-effort
```

**설계 원칙**: 각 단계는 독립 배포 가능한 단위. 기존 순수 함수(`deeplink.ts`·`app-install.ts`)와 딥링크 핸들러(`deep_link_handler.dart`)를 재사용하고, 신규 로직은 순수 함수로 분리해 단위 테스트한다.

---

## 5. Phase 0 — 식별자/스토어 URL 정정 (버그픽스, 최우선)

목표: 스토어 링크가 실제 앱으로 연결되게 한다.

| 파일 | 변경 |
|------|------|
| `teamplus-web/src/lib/env.ts:214` | `NEXT_PUBLIC_ANDROID_PACKAGE_NAME` 기본값 `kr.co.teamplus.app` → **`kr.co.teamplus`** |
| `teamplus-web/src/lib/app-install.ts:27` | `IOS_BUNDLE_ID = "com.teamplus.app"` → **`kr.co.teamplus`** |
| `teamplus-web/src/lib/env.ts:211` | `NEXT_PUBLIC_IOS_APP_STORE_ID` placeholder 유지(값 미정) — 검색 fallback 동작 확인 |
| `teamplus-home/src/lib/content.ts:75-78` | `APP_DOWNLOAD.googlePlay` = `https://play.google.com/store/apps/details?id=kr.co.teamplus` 채움. `appStore`는 출시 후 채움(현행 "출시예정" 유지 가능) |

- 실제 앱 식별자 근거: Android `applicationId=kr.co.teamplus`(`build.gradle.kts:35`), iOS `PRODUCT_BUNDLE_IDENTIFIER=kr.co.teamplus`(`project.pbxproj`).
- **검증**: `getStoreUrl('android')` → `…details?id=kr.co.teamplus` (실제 앱 페이지). `getStoreUrl('ios')` → App Store ID 미설정 시 검색 fallback(정상 동작 확인).

---

## 6. Phase 1 — SNS 진입 → 앱 실행/스토어 유도 활성화

목표: dead-code를 살리고, SNS 인앱브라우저를 대응한다.

### 6.1 SNS 인앱브라우저 감지 (신규 순수 함수)
`teamplus-web/src/lib/app-install.ts`에 추가 (또는 `environment.ts`):
```ts
export type InAppBrowser = 'kakaotalk' | 'instagram' | 'facebook' | 'naver' | 'twitter' | 'line' | 'other-webview' | null;
export function detectInAppBrowser(ua = navigator.userAgent): InAppBrowser;
```
- UA 매칭: `KAKAOTALK` → kakaotalk · `Instagram` → instagram · `FBAN|FBAV|FB_IAB` → facebook · `NAVER(inapp)` → naver · `Twitter` → twitter · `Line` → line · `; wv)` → other-webview.

### 6.2 브릿지 오픈 로직 강화 (`openInAppOrInstall` 확장)
기존 `useDeeplinkRouter.openInAppOrInstall()` + `tryOpenAppWithFallback()`를 다음으로 분기:
- **일반 브라우저**: 현행 유지 — `teamplus://<path>` 1.5s 시도 → 미열림 시 `/get-app?redirect=<path>`.
- **Android 인앱(카톡/인스타/…)**: `intent://<host>/<path>#Intent;scheme=https;package=kr.co.teamplus;S.browser_fallback_url=<store>;end` 로 이동. (카톡·크롬 계열 인앱이 honor)
- **iOS 카카오톡**: `kakaotalk://web/openExternal?url=<encoded Universal Link>` 로 Safari 탈출 유도.
- **iOS 인스타/페북/기타**: 커스텀 스킴·UL 모두 막히므로 **"Safari에서 열기" 안내 UI + 링크 복사** 표시(자동 이동 불가).

### 6.3 훅 마운트 & 공유 URL 연결
| 파일 | 변경 |
|------|------|
| `teamplus-web/src/components/providers/ClientProviders.tsx` | `useDeeplinkRouter()` 마운트 → `?deeplink=`/`?redirect=` 자동 라우팅 활성화. 로더/인증 정책과 충돌 없게 최상위 client에서 1회 |
| `teamplus-web/src/lib/share.ts` | 공유 URL을 `buildDeeplink(path)` 의 `https`(Universal Link)로 생성하도록 연결 (`?from=share` 마커 부가) |
| `/get-app` (`app/(public)/get-app/page.tsx`) | 기존 유지 + `detectInAppBrowser()` 분기 안내(6.2) 추가 |

- 메시지: `MESSAGES.appInstall`(이미 존재) + "Safari에서 열기" 안내 문구 추가(`messages.ts`).
- **검증**: (a) 일반 모바일 브라우저에서 UL 클릭 → 설치 시 앱, 미설치 시 웹+배너 (b) 카톡 인앱(AOS)에서 `intent://` 로 앱/스토어 (c) 인스타 인앱(iOS)에서 Safari 안내 노출.

---

## 7. Phase 2 — 푸시 알림 클릭 → 해당 메뉴 정밀 이동

목표: 푸시 탭이 `linkUrl` 대상 화면으로 정확히 가게 한다.

### 7.1 Flutter — 푸시 소비자 딥라우팅
`teamplus-app/lib/main.dart:342-352` 소비자 교체:
```dart
PushNotificationService().notificationStream.listen((payload) {
  final path = _resolvePushPath(payload); // data['linkUrl'] 우선, 없으면 getRoute(type) 폴백
  if (path == null) { _routeToWebView('/notifications'); return; } // 웹 알림함(클릭가능)
  _routeToWebView(path); // DeepLinkHandler.onNavigateInWebView(path) 재사용
});
```
- `data['linkUrl']`(예 `/classes/123`, `/notice/45`)을 딥링크와 동일 경로로 WebView에 주입(`onNavigateInWebView`/`teamplusNavigate`).
- 목적지 없을 때 네이티브 `/notifications` 대신 **웹 `/notifications`**(항목 클릭→상세 동작)로.
- `NotificationPayload.getRoute()`(현재 dead code) 를 `type`-only 폴백으로 활용.

### 7.2 콜드스타트 레이스 수정
- `getInitialMessage` 로 받은 최초 payload를 `_pendingPushPath` 로 버퍼 → WebView `onLoadStop` 후 소비(딥링크 pending-consume 패턴 재사용). `context==null` 조용한 유실 제거.

### 7.3 Backend — 단건 푸시에도 linkUrl
`teamplus-backend/src/notifications/notifications.service.ts:169-177`(`sendFcmPushAsync`):
- `data = { notificationId, type }` → **`data = { notificationId, type, ...(linkUrl ? { linkUrl } : {}) }`** 로 확장(배치 발송과 동일 규격).
- `linkUrl`은 이미 내부 경로(`/`-prefixed, 외부 차단) 검증됨.

- **검증**: 공지 푸시 탭 → `/notice/45` 상세로 이동(포그라운드/백그라운드/종료 3상태). 단건/배치 모두 확인.

---

## 8. Phase 3 — Deferred Deep Link (경량 커스텀) · 출시 직후 fast-follow 권장

목표: 미설치 사용자가 설치 후 첫 실행에서 원래 경로로 복귀.

### 8.1 Android — Play Install Referrer (정확)
- 스토어 URL에 `&referrer=<opaque-token>` (기존 배선 `getStoreUrl` 활용). token은 서버가 발급(경로 매핑) 또는 경로를 직접 URL-safe 인코딩.
- Flutter: `play_install_referrer` 패키지(또는 platform channel)로 첫 실행 시 `InstallReferrerClient` 조회 → `referrer`에서 token 파싱 → 경로 복원 → `DeepLinkHandler` 라우팅 → **SharedPreferences 플래그로 1회만** 소비.

### 8.2 iOS — 서버토큰 + 클립보드 (best-effort)
- 스토어 이동 직전(웹): `POST /api/v1/deeplink/defer {token, path, fp:{ipHash,ua,ts}}` (TTL 1h) + `navigator.clipboard.writeText('teamplus-defer:'+token)`.
- 첫 실행(앱): 클립보드 읽기 → `teamplus-defer:<token>` 매칭 시 `GET /deeplink/defer/resolve?token=` → path 복원. 실패 시 서버 fingerprint(IP+UA+시간창) 매칭 폴백. 1회 소비 후 클립보드/서버 엔트리 정리.
- ⚠️ **iOS 클립보드 읽기는 첫 실행 UX에 붙임 최소화**(사용자 액션 직후 또는 명시적 배너). 심사 프라이버시 리스크로 **승인 직후 업데이트** 권장.

### 8.3 Backend — deferred 저장소
`teamplus-backend`에 경량 모듈: `POST /deeplink/defer`(저장, TTL) · `GET /deeplink/defer/resolve`(token 또는 fingerprint 매칭). Redis(TTL) 활용 권장.

- **검증**: (Android) 미설치 상태 링크→Play→설치→첫 실행 시 원 경로 복원. (iOS) 클립보드 허용 시 복원, 거부 시 fingerprint 폴백 또는 홈 진입(graceful).

---

## 9. SNS 인앱브라우저 대응 매트릭스

| 앱 | Android | iOS |
|----|---------|-----|
| 카카오톡 | `intent://`(fallback=스토어) | `kakaotalk://web/openExternal?url=`(Safari 탈출) |
| 인스타그램 | `intent://` | "Safari에서 열기" 안내 + 링크복사 (UL/스킴 차단) |
| 페이스북 | `intent://` | 동일 안내 |
| 네이버 | `intent://` | UL 일부 동작, 미동작 시 안내 |
| X(트위터) | `intent://` | UL 대체로 동작, 미동작 시 안내 |

원칙: **Android는 `intent://` 로 대부분 자동 처리 가능**, **iOS 인앱은 자동 탈출이 제한적**이라 카카오 외에는 안내 UI가 최선.

---

## 10. 엣지케이스 · 에러 처리

- 스킴/UL 오픈 실패 → 항상 스토어 fallback (기존 timeout 로직).
- 잘못된/외부 도메인 target → `parseDeeplink` allowlist(`DEEPLINK_ALLOWED_PREFIXES`)로 차단(기존).
- App Store ID 미설정 → 검색 fallback(정상 취급).
- deferred 복원 실패 → 앱 홈으로 graceful (에러 아님).
- 콜드스타트 레이스 → pending 버퍼로 유실 방지.
- 네이티브 앱 내부에서 브릿지 페이지 진입 → 홈 redirect(기존 `/get-app` L45).

---

## 11. 테스트

- **단위(web)**: `detectInAppBrowser`(UA 매트릭스), `buildDeeplink`/`parseDeeplink`(기존), `getStoreUrl`(정정된 패키지명), `intent://` URL 빌더.
- **단위(backend)**: `sendFcmPushAsync` data에 linkUrl 포함(매퍼 spec), deferred 저장/조회.
- **Flutter**: `_resolvePushPath`(linkUrl 우선/type 폴백/null) 순수 함수 테스트, 콜드스타트 pending 소비.
- **수동 E2E**: 실기기 — (a) UL 설치/미설치 (b) 카톡·인스타 인앱 진입 (c) 푸시 3상태 딥라우팅 (d) Android referrer 복원.

---

## 12. 시퀀싱 권장

1. **P0 (즉시)** — 스토어 링크 정상화. 리스크 최소.
2. **P1 + P2 (출시 전)** — SNS 유도 + 푸시 정밀 라우팅. 심사 요건("알림 클릭 시 관련 화면 이동")에 부합.
3. **P3 (승인 직후 fast-follow)** — deferred. iOS 클립보드 심사 리스크 회피.

각 Phase는 개별 구현계획(writing-plans)으로 분리 진행.

---

## 13. Open Risks

- **iOS deferred는 100% 불가** — 클립보드 거부/미지원 시 홈 진입까지가 한계(문서에 명시, 사용자 동의됨).
- **iOS 인앱브라우저(인스타/페북) 자동 앱실행 불가** — 안내 UI가 최선.
- **iOS 클립보드 읽기 심사 리스크** — P3를 승인 후로 미루는 이유.
- **패키지명 통일 후 기존 env 오버라이드 확인** — 배포 환경에 `NEXT_PUBLIC_ANDROID_PACKAGE_NAME`가 잘못 세팅돼 있지 않은지 점검.
