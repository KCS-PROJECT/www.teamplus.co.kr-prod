"use client";

/**
 * /team/create — 사용 중단(deprecated) 라우트
 *
 * 설계 정합화(2026-06-01): 감독 1인 = 가입 시 1팀 운영(멀티 팀 없음).
 *   가입 후 별도 팀 생성 기능은 존재하지 않으므로 팀 생성 화면을 폐지하고,
 *   진입(직접 URL·뒤로가기) 시 팀 목록(/team)으로 즉시 리다이렉트한다.
 *   근거: docs/Planning/SPEC_COACH_INVITE_SIGNUP.md(§감독 1인=1팀) ·
 *         docs/specs/260423_회의_기능재설계_설계서.md(팀 생성=가입 시 1회).
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePageReady } from "@/hooks/usePageReady";

export default function TeamCreateDeprecatedPage() {
  usePageReady(true);
  const router = useRouter();

  useEffect(() => {
    router.replace("/team");
  }, [router]);

  return null;
}
