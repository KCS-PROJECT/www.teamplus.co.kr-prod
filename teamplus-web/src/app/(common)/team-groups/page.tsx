"use client";

/**
 * /team-groups — 그룹 관리 진입 페이지
 *
 * 햄버거 메뉴 "그룹관리" 클릭 시 진입.
 * 내가 관리하는 팀 목록을 보여주고, 카드 클릭 시 해당 팀의 그룹 목록(/team/[id]/groups)으로 이동.
 * 감독·코치·관리자만 의미 있는 페이지.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigation } from "@/components/ui/NavLink";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { MESSAGES } from "@/lib/messages";
import { isTeamManager } from "@/lib/team-roles";
import { api } from "@/services/api-client";
import { resolveImageSrc } from "@/lib/image-url";

interface ManagedTeam {
  id: string;
  name: string;
  shortName?: string | null;
  division?: string | null;
  logoUrl?: string | null;
}

export default function TeamGroupsLandingPage() {
  // 공통 AppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });


  const { navigate, replace } = useNavigation();
  const { user, isLoading: authLoading } = useSessionAuth();
  const canManage = isTeamManager(user);

  const [teams, setTeams] = useState<ManagedTeam[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [error, setError] = useState<string | null>(null);

  // [추가 2026-05-15 V04 D-1] 자동 진입 가드 — 한 번만 redirect 되도록 보호.
  //   teams 가 다시 fetch 되더라도 한 번 redirect 한 다음에는 동작하지 않음.
  //   (StrictMode 더블 마운트 / refresh 이벤트 등 회귀 차단)
  const autoRedirectedRef = useRef(false);

  const loadTeams = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.get<ManagedTeam[]>("/teams/my/managed");
      if (res.success && Array.isArray(res.data)) {
        setTeams(res.data);
      } else {
        setTeams([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : MESSAGES.team.loadError);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && canManage) void loadTeams();
  }, [authLoading, canManage, loadTeams]);

  // [추가 2026-05-15 V04 D-1] 관리 팀이 정확히 1개면 그룹 페이지로 자동 진입.
  //   사용자 보고: "팀 리스트에 1개만 노출되니 불필요한 단계가 생긴다."
  //   해결: 1개일 때는 listing 단계 생략 — replace 로 history 누적 차단.
  //   조건:
  //    · 로딩 완료 + 에러 없음 + 권한 보유 + 정확히 1개
  //    · autoRedirectedRef 로 중복 redirect 차단
  useEffect(() => {
    if (autoRedirectedRef.current) return;
    if (isLoading || error || !canManage) return;
    if (teams.length !== 1) return;
    autoRedirectedRef.current = true;
    void replace(`/team/${teams[0].id}/groups`);
  }, [isLoading, error, canManage, teams, replace]);

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="그룹관리" forceNative />

      <div className="px-4 pb-24 pt-4 space-y-4">
        {/* 안내 */}
        <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
          <p className="text-w-small text-blue-900 dark:text-blue-200 font-semibold">
            팀을 선택하면 해당 팀의 하위 그룹을 관리할 수 있어요.
          </p>
          <p className="text-w-caption text-blue-800 dark:text-blue-300 mt-1">
            그룹 = 팀 안의 작은 단위 (예: 선수반 A조, U10 평일반).
          </p>
        </div>

        {/* 권한 체크 */}
        {!authLoading && !canManage && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-w-small text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            {MESSAGES.team.permissionDenied}
          </div>
        )}

        {/* 에러 */}
        {!isLoading && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-w-small text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        {/* 비어있음 */}
        {!isLoading && !error && canManage && teams.length === 0 && (
          <div className="rounded-2xl border border-wline bg-white p-10 text-center dark:border-rink-700 dark:bg-rink-800">
            <p className="text-w-small text-wtext-3 dark:text-rink-300">
              관리할 수 있는 팀이 없습니다.
            </p>
            <button
              type="button"
              onClick={() => navigate("/team/create")}
              className="mt-4 inline-flex items-center bg-blue-700 text-white text-w-small font-bold px-4 py-2.5 rounded-lg hover:bg-blue-800"
            >
              + 하위그룹
            </button>
          </div>
        )}

        {/* 팀 카드 목록 */}
        {!isLoading && !error && teams.length > 0 && (
          <ul className="space-y-3">
            {teams.map((team) => (
              <li key={team.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/team/${team.id}/groups`)}
                  className="w-full text-left rounded-2xl border border-wline bg-white p-4 hover:border-blue-400 hover:shadow-sm transition-all dark:border-rink-700 dark:bg-rink-800 dark:hover:border-blue-700"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-lg bg-wline-2 dark:bg-rink-700 flex items-center justify-center text-wtext-3 dark:text-rink-300 text-w-caption font-semibold shrink-0 overflow-hidden">
                      {resolveImageSrc(team.logoUrl) ? (
                        // 외부 도메인일 수 있어 Image 대신 img — 페이지 빌드 안전
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolveImageSrc(team.logoUrl)}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        (team.shortName ?? team.name.slice(0, 2))
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-w-body-lg font-bold text-wtext-1 dark:text-white truncate">
                        {team.name}
                      </h3>
                      <p className="text-w-caption text-wtext-3 dark:text-rink-300 mt-1">
                        {team.division ? `${team.division} · ` : ""}그룹
                        관리하기 →
                      </p>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </MobileContainer>
  );
}
