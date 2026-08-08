/**
 * Android App Links — assetlinks.json (Digital Asset Links)
 *
 * 이 Route Handler는 `next.config.mjs`의 rewrites()를 통해
 *   `/.well-known/assetlinks.json` → `/api/deeplink/assetlinks`
 * 로 매핑된다.
 *
 * Android의 autoVerify 요구 사항:
 *   1. Content-Type이 `application/json`이어야 한다
 *   2. HTTPS에서만 서빙되어야 한다 (AndroidManifest의 scheme="https"와 일치)
 *   3. `sha256_cert_fingerprints`가 실제 서명 인증서와 일치해야 한다
 *
 * 스펙: https://developer.android.com/training/app-links/verify-android-applinks
 *
 * SHA256 fingerprint 취득 방법:
 *   keytool -list -v -keystore <release.keystore> -alias <alias>
 *
 * 환경변수 `NEXT_PUBLIC_ANDROID_SHA256_FINGERPRINTS` (콤마 구분)로 추가 주입.
 * 여러 값 지원 — debug/release/upload key 모두 등록 가능. 아래 DEFAULT_FINGERPRINTS
 * 와 병합·중복제거되므로, env 미설정이어도 운영 검증에 필요한 지문은 항상 서빙된다.
 *
 * ⚠️ 2026-06-15 수정: Play Console 딥링크 페이지가 `teamplusweb.icetimes.co.kr` 을
 *    "도메인 검사 실패(문제 1개)"로 표시하던 원인 = 서빙 파일에 Play 앱 서명 키 지문
 *    누락. 권장 assetlinks.json 의 두 지문을 DEFAULT_FINGERPRINTS 로 하드코딩한다.
 *    (지문은 앱 바이너리·Play Console 에 공개된 식별자이므로 하드코딩이 안전 —
 *     AASA 라우트가 Team ID 를 하드코딩하는 것과 동일한 근거.)
 *
 * ⚠️ 2026-08-08 수정: 종전 하드코딩 지문 2종(4C:73:A9:… / 90:DF:23:…)이 현재
 *    Play Console 실측값과 불일치하여 도메인 검증이 계속 실패
 *    ("웹 도메인이 앱과 연결되어 있지 않음" 경고)하던 것을 교정.
 *    현행 지문 출처(둘 다 실측):
 *      - Play 앱 서명 키: Play Console > 앱 서명(keymanagement) 페이지 SHA-256
 *      - 업로드 키: `keytool -list -v -keystore android/keystore/teamplus-release.jks`
 *        (Play Console 업로드 키 인증서 SHA-256 과 일치 확인)
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ANDROID_PACKAGE = "kr.co.teamplus";

/**
 * `kr.co.teamplus` 의 기본 SHA-256 인증서 지문 2종 (2026-08-08 Play Console 실측).
 *   - 3C:C0:59:... → Play 앱 서명 키 인증서 (Google 이 배포본을 서명 —
 *                    실제 스토어 설치 앱의 App Links 검증에 필수)
 *   - 92:A0:A1:... → 업로드 키 인증서 (개발자 업로드/직접 설치 빌드,
 *                    teamplus-release.jks alias teamplus-release)
 * 둘 다 있어야 스토어 배포(Play 서명 키)·직접 설치(업로드 키) 모두 검증 통과.
 */
const DEFAULT_FINGERPRINTS = [
  "3C:C0:59:32:D5:EA:37:D5:55:FA:95:26:8E:2C:23:AD:6C:6C:58:5A:71:9A:8C:8F:33:02:35:D3:31:B8:6A:2E",
  "92:A0:A1:78:67:13:EC:BC:2A:DB:9B:F1:FF:5E:A3:27:5C:75:5D:92:AC:BB:8A:3D:C4:CA:4C:47:A8:EF:DC:FF",
];

interface AssetLinkStatement {
  relation: string[];
  target: {
    namespace: "android_app";
    package_name: string;
    sha256_cert_fingerprints: string[];
  };
}

/** SHA256 핑거프린트 포맷 검증: `XX:XX:...` 32세그먼트 */
function isValidSha256Fingerprint(fp: string): boolean {
  return /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(fp.trim().toUpperCase());
}

function buildAssetLinks(): AssetLinkStatement[] {
  const rawFingerprints =
    process.env.NEXT_PUBLIC_ANDROID_SHA256_FINGERPRINTS ?? "";
  const envFingerprints = rawFingerprints
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter((s) => s.length > 0);

  // 기본 지문(업로드 키 + Play 앱 서명 키) + env 추가 지문을 병합·중복제거·검증.
  // → env 가 비거나 일부만 설정돼도 운영 검증에 필요한 지문은 항상 포함된다.
  const fingerprints = Array.from(
    new Set(
      [...DEFAULT_FINGERPRINTS, ...envFingerprints].map((s) => s.toUpperCase()),
    ),
  ).filter(isValidSha256Fingerprint);

  return [
    {
      relation: [
        "delegate_permission/common.handle_all_urls",
        "delegate_permission/common.get_login_creds",
      ],
      target: {
        namespace: "android_app",
        package_name: ANDROID_PACKAGE,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

export function GET(): NextResponse {
  const body = buildAssetLinks();
  return NextResponse.json(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=0, s-maxage=3600, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
