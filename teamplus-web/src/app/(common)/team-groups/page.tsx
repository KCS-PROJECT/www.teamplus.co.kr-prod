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
import { Icon } from "@/components/ui/Icon";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { MESSAGES } from "@/lib/messages";
import { isTeamManager } from "@/lib/team-roles";
import { api } from "@/services/api-client";
import { resolveImageSrc } from "@/lib/image-url";
import { cn } from "@/lib/utils";

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

      <main className="flex-1 overflow-y-auto pb-24 bg-it-canvas dark:bg-puck">
        {/* 안내 — flat 흰 섹션 (카드 박스 제거) */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-5" aria-label="그룹관리 안내">
          <div className="flex items-start gap-2.5">
            <span aria-hidden="true" className="mt-0.5 w-[3px] h-9 rounded-sm bg-it-blue-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-it-ink-800 dark:text-white leading-[1.5]">
                팀을 선택하면 해당 팀의 하위 그룹을 관리할 수 있어요.
              </p>
              <p className="text-card-meta text-it-ink-500 dark:text-rink-300 mt-1 leading-[1.5]">
                그룹 = 팀 안의 작은 단위 (예: 선수반 A조, U10 평일반).
              </p>
            </div>
          </div>

          {/* 권한 체크 */}
          {!authLoading && !canManage && (
            <p className="mt-4 text-[13px] font-semibold text-it-red-500">
              {MESSAGES.team.permissionDenied}
            </p>
          )}

          {/* 에러 */}
          {!isLoading && error && (
            <p className="mt-4 text-[13px] font-semibold text-it-red-500">{error}</p>
          )}
        </section>

        {/* 비어있음 — flat 흰 섹션 */}
        {!isLoading && !error && canManage && teams.length === 0 && (
          <>
            <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
            <section className="bg-it-surface dark:bg-rink-800 px-5 py-14 text-center" aria-label="관리 팀 없음">
              <p className="text-card-body font-medium text-it-ink-700 dark:text-wtext-4">
                관리할 수 있는 팀이 없습니다.
              </p>
              <button
                type="button"
                onClick={() => navigate("/team/create")}
                className="mt-4 inline-flex items-center gap-1 bg-it-blue-500 text-white text-[14px] font-bold px-4 h-10 rounded-w-md hover:bg-it-blue-600 active:brightness-95 transition-colors motion-reduce:transition-none"
              >
                <Icon name="add" className="text-[18px]" aria-hidden="true" />
                하위그룹 만들기
              </button>
            </section>
          </>
        )}

        {/* 팀 목록 — flat 흰 섹션 (헤더 + hairline 구분 행) */}
        {!isLoading && !error && teams.length > 0 && (
          <>
            <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />
            <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-7" aria-label="관리 팀 목록">
              <div className="flex items-baseline gap-2 pb-1">
                <h2 className="text-it-ink-800 dark:text-white tracking-[-0.02em] font-extrabold text-[17px]">
                  관리 팀
                </h2>
                <span className="text-[15px] font-extrabold font-num tabular-nums text-it-blue-500">
                  {teams.length}
                </span>
              </div>
              <ul className="flex flex-col">
                {teams.map((team, idx) => {
                  const isLast = idx === teams.length - 1;
                  return (
                    <li key={team.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/team/${team.id}/groups`)}
                        aria-label={`${team.name} 그룹 관리하기`}
                        className={cn(
                          "w-full text-left flex items-center gap-3 py-[13px] min-h-[64px] transition-colors motion-reduce:transition-none active:brightness-95",
                          !isLast && "border-b border-it-line dark:border-rink-700",
                        )}
                      >
                        <div className="size-12 rounded-w-md bg-it-line dark:bg-rink-700 flex items-center justify-center text-it-ink-500 dark:text-rink-300 text-card-meta font-bold shrink-0 overflow-hidden">
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
                          <h3 className="text-[15.5px] font-bold leading-tight tracking-[-0.01em] text-it-ink-800 dark:text-white truncate">
                            {team.name}
                          </h3>
                          <p className="text-card-meta text-it-ink-500 dark:text-rink-300 mt-0.5">
                            {team.division ? `${team.division} · ` : ""}그룹 관리하기
                          </p>
                        </div>
                        <Icon
                          name="chevron_right"
                          className="shrink-0 text-[20px] text-it-ink-400 dark:text-wtext-4"
                          aria-hidden="true"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}
      </main>
    </MobileContainer>
  );
}
