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
 *    이 페이지에 도달하므로 본 처리가 단일 진입점이 된다. 토큰이 만료되었거나
 *    파싱 불가능한 경우는 모두 /login 폴백.
 */

import { cookies } from "next/headers";
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

export default async function Home() {
  const token = (await cookies()).get("teamplus_access_token")?.value;
  if (!token) redirect("/login");

  const payload = decodePayload(token);
  if (!payload) redirect("/login");

  // 만료 검증
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) {
    redirect("/login");
  }

  const userType = normalizeUserType(payload.userType);
  if (!userType) redirect("/login");

  redirect(getDashboardPathByUserType(userType, "/login"));
}
