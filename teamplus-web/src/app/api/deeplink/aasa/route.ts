/**
 * iOS Universal Links — apple-app-site-association (AASA)
 *
 * 이 Route Handler는 `next.config.mjs`의 rewrites()를 통해
 *   `/.well-known/apple-app-site-association` → `/api/deeplink/aasa`
 * 로 매핑된다.
 *
 * 왜 `.well-known/*` 디렉토리를 직접 쓰지 않는가:
 *   1. Next.js app router는 `.`으로 시작하는 디렉토리를 숨김(private)으로 취급
 *   2. `trailingSlash: true` 설정 시 `/.well-known/...`이 308 리다이렉트되어
 *      iOS가 AASA를 못 읽음 (iOS는 리다이렉트 금지)
 *   → rewrite로 해결
 *
 * iOS는 이 파일을 다음 조건으로만 인식한다:
 *   1. Content-Type이 `application/json`이어야 한다
 *   2. HTTPS에서만 서빙되어야 한다
 *   3. 리다이렉트 없이 200 응답이어야 한다
 *
 * AASA 스펙: https://developer.apple.com/documentation/xcode/supporting-associated-domains
 *
 * TEAM_ID는 환경변수 `NEXT_PUBLIC_IOS_TEAM_ID`로 오버라이드할 수 있다. 미설정 시
 * TEAMPLUS 프로덕션 Apple Team ID `VG2U99V32J`(Xcode DEVELOPMENT_TEAM 과 동일)로
 * 서빙된다. Team ID 는 앱 바이너리에 이미 포함된 공개 식별자이므로 하드코딩 기본값이
 * 안전하며, 다른 팀/빌드에서 재사용 시에만 env 로 덮어쓰면 된다.
 *
 * Bundle ID 는 환경변수 `NEXT_PUBLIC_IOS_BUNDLE_ID` 로 주입한다(미설정 시
 * 기본 `kr.co.teamplus`). ⚠️ Xcode PRODUCT_BUNDLE_IDENTIFIER(프로덕션) 와
 * 반드시 일치해야 하며, 불일치 시 Universal Links 가 동작하지 않는다.
 */

import { NextResponse } from "next/server";
import { DEEPLINK_ALLOWED_PREFIXES } from "@/lib/deeplink";

/** 빌드 시점이 아닌 런타임에 응답 생성 */
export const dynamic = "force-dynamic";

const IOS_BUNDLE_ID =
  process.env.NEXT_PUBLIC_IOS_BUNDLE_ID ?? "kr.co.teamplus";

interface AASA {
  applinks: {
    details: Array<{
      appIDs: string[];
      components: Array<{
        "/": string;
        exclude?: boolean;
        comment?: string;
      }>;
    }>;
  };
  webcredentials: {
    apps: string[];
  };
}

function buildAASA(): AASA {
  const teamId = process.env.NEXT_PUBLIC_IOS_TEAM_ID ?? "VG2U99V32J";
  const appID = `${teamId}.${IOS_BUNDLE_ID}`;

  // Deeplink 화이트리스트 prefix를 AASA components로 변환.
  // iOS는 components 순서대로 매칭하며 첫 번째 일치 항목을 사용한다.
  const components: AASA["applinks"]["details"][0]["components"] = [
    // exclude: 민감한 경로는 앱이 아닌 웹에서 처리 (로그인, 관리자 등)
    { "/": "/login/*", exclude: true, comment: "인증은 웹에서만" },
    { "/": "/admin/*", exclude: true, comment: "어드민은 웹 전용" },
    { "/": "/api/*", exclude: true },
    { "/": "/.well-known/*", exclude: true },

    // include: allowlist prefix (하위 경로 매칭)
    ...DEEPLINK_ALLOWED_PREFIXES.map((prefix) => ({
      "/": `${prefix}/*`,
      comment: `deeplink: ${prefix}`,
    })),
    // 루트 경로 (정확 매칭)
    ...DEEPLINK_ALLOWED_PREFIXES.map((prefix) => ({
      "/": prefix,
      comment: `deeplink exact: ${prefix}`,
    })),
  ];

  return {
    applinks: {
      details: [
        {
          appIDs: [appID],
          components,
        },
      ],
    },
    webcredentials: {
      apps: [appID],
    },
  };
}

export function GET(): NextResponse {
  const body = buildAASA();
  return NextResponse.json(body, {
    status: 200,
    headers: {
      // iOS는 application/json Content-Type을 요구
      "Content-Type": "application/json",
      // 민감 정보 아님 — 1시간 CDN 캐시
      "Cache-Control": "public, max-age=0, s-maxage=3600, must-revalidate",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
