/**
 * Root Route — Server-side redirect
 *
 * usePageReady: not applicable (server component, no client render — 즉시 302 redirect)
 *
 * ⚡ 기존 'use client' + AuthContext.useSessionAuth() + useEffect router.replace 패턴은
 *    클라이언트 hydration 후 토큰 검증을 기다려야 했고, 평균 200~400ms 의 빈
 *    스피너를 노출했다. 본 RSC 변환은 cookie 한 번만 읽고 서버에서 302 redirect 를
 *    수행하므로 클라이언트 JS 가 전혀 실행되지 않는다.
 *
 *    middleware.ts 가 /uploads, /.well-known 등을 처리하지만 root path 는 그대로
 *    이 페이지에 도달하므로 본 처리가 단일 진입점이 된다.
 *
 *    로그인 여부 판정은 middleware 와 같은 기준을 쓴다 — access 가 만료돼도 refresh 가
 *    살아 있으면 로그인 상태다(세션 = refresh 수명). access 만 보고 /login 으로 보내면
 *    로그인한 사용자가 로그인 페이지를 통째로 받았다 버리고 대시보드로 되돌아오게 되고,
 *    "층마다 로그인 여부 기준이 다른" 상태가 남는다(과거 리다이렉트 루프의 공통 원인).
 */

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  getDashboardPathByUserType,
  normalizeUserType,
} from "@/lib/auth-routing";

export const dynamic = "force-dynamic"; // cookies() 사용 — 정적 prerender 불가

interface JwtPayload {
  exp?: number;
  userType?: string;
}

function decodePayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf-8");
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

/** 만료 전이면 payload 반환 — 아니면 null. */
function decodeIfFresh(token: string | undefined): JwtPayload | null {
  if (!token) return null;
  const payload = decodePayload(token);
  if (!payload) return null;
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) return null;
  return payload;
}

export default async function Home() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("teamplus_access_token")?.value;

  // 1순위 — access 가 아직 유효하면 그대로 사용.
  let payload = decodeIfFresh(accessToken);

  // 2순위 — access 만료·부재라도 refresh 가 살아 있으면 로그인 상태.
  //   역할도 refresh payload 에서 읽는다(access 와 동일 claim + tokenType 만 추가) —
  //   만료된 토큰의 값을 쓰지 않고 "지금 유효한 토큰" 하나로 판정과 목적지를 함께 얻는다.
  //   실제 갱신은 목적지 화면의 첫 API 요청에서 일어난다(여기서는 쿠키만 읽는다).
  if (!payload) {
    payload = decodeIfFresh(cookieStore.get("teamplus_refresh_token")?.value);
  }

  // 3순위 — 네이티브 WebView 는 로그인·갱신이 Flutter 경유라 httpOnly refresh 쿠키가
  //   웹뷰에 없을 수 있다. middleware 와 같은 예외: teamplusApp UA + access 쿠키 존재를
  //   세션 흔적으로 보고, 만료된 access payload 에서 역할만 읽는다.
  if (!payload && accessToken) {
    const ua = (await headers()).get("user-agent") ?? "";
    if (ua.includes("teamplusApp")) payload = decodePayload(accessToken);
  }

  if (!payload) redirect("/login");

  const userType = normalizeUserType(payload.userType);
  if (!userType) redirect("/login");

  redirect(getDashboardPathByUserType(userType, "/login"));
}
