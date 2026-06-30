"use client";

/**
 * /team/[id]/edit — 팀 정보 수정 페이지
 *
 * [수정 2026-05-15 T04 web-router] 페이지 정체성을 "하위그룹 수정"에서 "팀 정보 수정"으로 정정.
 *   - 팀 슬로건 수정 버튼 ((common)/team/[id]/page.tsx)이 이 경로로 라우팅됨에도
 *     불구하고 슬로건 입력 필드가 없어 사실상 잘못된 페이지였음 (T04 라우팅 버그).
 *   - 슬로건/팀 소개 필드 추가 + 라벨/타이틀을 팀 단위로 교정.
 *   - 하위그룹(`/team/[id]/groups/[groupId]/edit`)은 별도 페이지가 존재.
 *
 * 참고자료 "04f · 하위그룹 수정 (개선)" 디자인 베이스를 그대로 유지하되,
 * 데이터 모델(슬로건/팀 소개)을 팀 단위로 확장.
 *
 * 기능 보존:
 *  - getTeam → updateTeam 흐름 그대로 (slogan/description 추가)
 *  - 권한 체크 / 로딩 / 에러 / 토스트 / router 이동 모두 유지
 *  - TeamForm 외부 컴포넌트 의존 제거 (이 페이지는 04f 디자인 inline 구현)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { useNativeUI } from '@/hooks/useNativeUI';
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { usePageReady } from "@/hooks/usePageReady";
import { useSessionAuth } from "@/hooks/useSessionAuth";
import { MESSAGES } from "@/lib/messages";
import { emitRefresh, REFRESH_KEYS } from "@/lib/refresh-bus";
import { isTeamManager, isTeamManagerOf } from "@/lib/team-roles";
import { cn } from "@/lib/utils";
import { getTeam, updateTeam } from "@/services/team.service";
import type { TeamDetail } from "@/services/team.service";
import { AvatarUploader } from "@/components/shared/AvatarUploader";
import { VenuePicker } from "@/components/common/VenuePicker";
import { resolveImageSrc } from "@/lib/image-url";

// [제거 2026-05-18 W2.B #4] AGE_OPTIONS 상수 삭제 — 연령 필드 제거에 따른 cleanup.
//   (division 값 자체는 폼 상태에 그대로 보존 → 백엔드 호환성 유지)

export default function TeamEditPage() {
  // 공통 AppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });


  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useSessionAuth();
  // [수정 2026-05-21] 2단계 권한 게이트.
  //  1단계 (canManageGlobal): 글로벌 역할 — admin/director/academy_director/coach 만 페이지 진입.
  //  2단계 (canManage): team 로드 후 본인 멤버십 — pending coach 는 수정 차단 후 상세로 리다이렉트.
  const canManageGlobal = isTeamManager(user);

  const teamId = useMemo(() => {
    const raw = params?.id;
    return Array.isArray(raw) ? raw[0] : (raw ?? "");
  }, [params]);

  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [loading, setLoading] = useState(true);
  usePageReady(!loading);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // 2단계 — team 로드 후 본인 멤버십 검증. team 이 null 이면 false 반환되므로
  //  로드 완료 후에만 의미 있는 값. pending coach 차단용.
  const canManage = isTeamManagerOf(user, team);

  // [추가 2026-05-21 v2] 권한 거부 토스트 1회만 노출 보장 (StrictMode 재실행 + 1·2단계
  //  useEffect + loadTeam 403 처리가 동시에 트리거될 때 중복 방지).
  const deniedToastShownRef = useRef(false);

  // ── 폼 상태 (04f 디자인 inline) ─────────────────
  // [제거 2026-05-21 시나리오 B] shortName state — Phase 2 잔재 컬럼.
  //   백엔드 updateTeam 이 저장하지 않는 죽은 입력 UI 였음. teamCode read-only 로 대체.
  const [name, setName] = useState("");
  // [2026-06-01] 팀 코드 — 가입 시 미설정(null)이므로 팀 관리에서 입력·변경. 빈 값이면 해제.
  const [teamCode, setTeamCode] = useState("");
  // [모집 대상] teams.division 컬럼 재활용 — 자유 텍스트(예: "초등 저학년"). 리그 부문 무관.
  const [division, setDivision] = useState<string>("");
  // [지역] teams.location 컬럼 재활용 — 자유 텍스트(예: "서울 강남구"). 홈 경기장(venueId)과 별개.
  const [region, setRegion] = useState<string>("");
  const [logoUrl, setLogoUrl] = useState("");
  const logoUrlRef = useRef(logoUrl);
  // [메인/보조 컬러 입력 UI 제거] primaryColor/secondaryColor 는 입력·전송하지 않음.
  //  데이터 모델(teams.primary_color/secondary_color)·팀 상세 표시·타입은 추후 팀 컬러
  //  기능 재도입 시 참고용으로 보존. 이 수정 화면에서는 입력을 받지 않으므로 기존 값을
  //  건드리지 않는다(submit 페이로드에서 제외 → updateTeam undefined → 무변경).
  // [추가 2026-05-15 T04 web-router] 팀 단위 필드 — 슬로건/팀 소개.
  //  슬로건 수정 동선이 이 페이지로 라우팅되므로 필수.
  const [slogan, setSlogan] = useState("");
  const [description, setDescription] = useState("");
  // [추가 2026-05-22] 홈 링크장 — DB 등록 Venue 마스터에서 선택 (VenuePicker 공통 컴포넌트).
  const [venueId, setVenueId] = useState("");

  // ── 권한 체크 (1단계: 글로벌 역할) ────────────────────────────
  //  학부모/학생 등 글로벌 관리 역할이 없는 사용자 즉시 차단.
  useEffect(() => {
    if (!authLoading && user && !canManageGlobal) {
      if (!deniedToastShownRef.current) {
        deniedToastShownRef.current = true;
        toast.error(MESSAGES.team.permissionDenied);
      }
      router.replace(`/team/${teamId}`);
    }
  }, [authLoading, user, canManageGlobal, router, teamId, toast]);

  // ── 권한 체크 (2단계: 팀 단위) ────────────────────────────
  //  team 로드 완료 후 본인 멤버십 검증. pending coach 는 수정 차단 후 상세로.
  useEffect(() => {
    if (!team || !user) return;
    if (!canManage) {
      if (!deniedToastShownRef.current) {
        deniedToastShownRef.current = true;
        toast.error(MESSAGES.team.permissionDenied);
      }
      router.replace(`/team/${teamId}`);
    }
  }, [team, user, canManage, router, teamId, toast]);

  // ── 팀 로드 ─────────────────────────────
  useEffect(() => {
    if (!teamId || !canManageGlobal) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      const res = await getTeam(teamId);
      if (cancelled) return;
      if (res.success && res.data) {
        setTeam(res.data);
        setName(res.data.name ?? "");
        setTeamCode(res.data.teamCode ?? "");
        setDivision(res.data.division ?? "");
        setRegion(res.data.location ?? "");
        setLogoUrl(res.data.logoUrl ?? "");
        logoUrlRef.current = res.data.logoUrl ?? "";
        // [추가 2026-05-15 T04 web-router] 팀 단위 필드 로드.
        setSlogan(res.data.slogan ?? "");
        setDescription(res.data.description ?? "");
        setVenueId(res.data.venueId ?? "");
      } else if (res.error?.statusCode === 403) {
        // [추가 2026-05-21] 백엔드 권한 가드(403) — 매니저가 본인 권한 없는 팀에
        //  직접 URL 진입한 경우. 토스트 + 상세로 redirect.
        //  StrictMode 재실행 시 deniedToastShownRef 가드로 토스트 중복 방지.
        if (!deniedToastShownRef.current) {
          deniedToastShownRef.current = true;
          toast.error(MESSAGES.team.permissionDenied);
        }
        router.replace(`/team/${teamId}`);
        return;
      } else {
        setLoadError(res.error?.message || MESSAGES.team.loadError);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, canManageGlobal]);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!name.trim()) {
        toast.error(MESSAGES.team.nameRequired);
        return;
      }
      // 팀 코드는 선택 — 입력했으면 형식 검증(영문/숫자/-/_ · 3~32자). 빈 값이면 해제(null).
      const trimmedCode = teamCode.trim();
      if (trimmedCode) {
        if (
          trimmedCode.length < 3 ||
          trimmedCode.length > 32 ||
          !/^[A-Za-z0-9_\-]+$/.test(trimmedCode)
        ) {
          toast.error(MESSAGES.team.codeInvalidFormat);
          return;
        }
      }
      setSubmitting(true);
      setServerError(null);
      try {
        const res = await updateTeam(teamId, {
          clubName: name.trim(),
          teamCode: trimmedCode,
          division: division.trim() || undefined,
          location: region.trim() || undefined,
          logoUrl: logoUrlRef.current.trim() || undefined,
          slogan: slogan.trim() || undefined,
          description: description.trim() || undefined,
          venueId,
        });
        if (res.success) {
          toast.success(MESSAGES.team.updateSuccess);
          // [추가 2026-05-15 V04 A-4] 팀 정보(slogan/division/logo/color 등) 변경 후
          //   상위 화면(team list, parent dashboard, team/[id] 상세 등)에서 캐시 invalidation
          //   신호 송출. router.replace 만으로는 동일 URL stale data 가 잡히지 않을 수 있음.
          emitRefresh(REFRESH_KEYS.TEAM);
          emitRefresh([REFRESH_KEYS.TEAM, teamId]);
          router.replace(`/team/${teamId}`);
        } else {
          setServerError(res.error?.message || MESSAGES.error.general);
        }
      } catch {
        setServerError(MESSAGES.error.network);
      } finally {
        setSubmitting(false);
      }
    },
    [
      teamId,
      name,
      teamCode,
      division,
      region,
      slogan,
      description,
      venueId,
      router,
      toast,
    ],
  );

  // ── 권한/로딩 가드 ─────────────────────────
  // [2026-05-14] PageAppBar 에 forceNative 추가 — useNativeUI({ showAppBar: false }) 와 함께 사용 시
  //  네이티브(Flutter WebView) 환경에서 PageAppBar 가 null 반환되어 헤더가 사라지던 버그 수정.
  //  PageAppBar 컴포넌트 로직: `if (isNative && !forceNative) return null;` → forceNative 강제.
  // [수정 2026-05-21] canManage(팀 단위) 대신 canManageGlobal 사용 — team 로드 전에는
  //  myApprovalStatus 가 없어 canManage 가 false 가 되므로, 빈 화면이 깜빡이는 회귀를 방지.
  //  pending coach 는 위 2단계 useEffect 에서 별도 redirect 처리.
  if (authLoading || !user || !canManageGlobal) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title="팀 정보 수정" onBack={() => router.back()} forceNative />
        <main className="flex-1 bg-it-canvas dark:bg-puck" />
      </MobileContainer>
    );
  }

  if (loading) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title="팀 정보 수정" onBack={() => router.back()} forceNative />
        <main className="flex-1 bg-it-canvas dark:bg-puck" />
      </MobileContainer>
    );
  }

  // [추가 2026-05-21] 2단계 권한 가드 — team 로드 후 pending coach / 무관 팀 진입 매니저
  //  즉시 빈 화면. useEffect 의 redirect 가 비동기로 트리거되는 동안 form 이 한 프레임
  //  보이는 회귀 차단. canManage 는 isTeamManagerOf(user, team) — 'approved' 멤버만 통과.
  if (team && !canManage) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title="팀 정보 수정" onBack={() => router.back()} forceNative />
        <main className="flex-1 bg-it-canvas dark:bg-puck" />
      </MobileContainer>
    );
  }

  if (loadError || !team) {
    return (
      <MobileContainer hasBottomNav>
        <PageAppBar title="팀 정보 수정" onBack={() => router.back()} forceNative />
        <main className="flex-1 flex items-center justify-center bg-it-canvas dark:bg-puck">
          <EmptyState
            icon="error_outline"
            title={loadError || MESSAGES.team.notFound}
            description={MESSAGES.team.retryHint}
            actionLabel="목록으로"
            onAction={() => router.push("/team")}
          />
        </main>
      </MobileContainer>
    );
  }

  // ── 04f 디자인 본문 ───────────────────────
  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="팀 정보 수정" onBack={() => router.back()} forceNative />
      <main
        className="hide-scrollbar flex-1 overflow-y-auto bg-it-canvas dark:bg-puck"
        role="main"
        aria-label="팀 정보 수정"
      >
        {/* flat 흰 섹션 — 폼 전체를 흰 배경으로 묶음 (카드 박스 제거) */}
        <form onSubmit={handleSubmit} className="bg-it-surface dark:bg-it-blue-950 px-5 pt-5 pb-6">
          {/* ── 1) 팀 로고 (첨부파일) ── AvatarUploader (category=IMAGE · refType=team_logo). */}
          <Field label="팀 로고" hint="이미지 파일 업로드 (최대 10MB)">
            <div className="flex items-center gap-4">
              <AvatarUploader
                currentUrl={resolveImageSrc(logoUrl, team?.updatedAt) ?? null}
                size={92}
                label="팀 로고 변경"
                refType="team_logo"
                refId={teamId}
                // 팀 로고는 비-인물 컨텍스트 → 도메인 아이콘(sports_hockey) + 사각형(클럽 엠블럼) 컨벤션.
                placeholderIcon="sports_hockey"
                shape="square"
                onUploaded={(file) => {
                  setLogoUrl(file.url);
                  logoUrlRef.current = file.url;
                }}
              />
              <div className="flex-1 text-[13px] font-semibold text-it-ink-500 dark:text-it-ink-300">
                <p>JPG · PNG · WebP</p>
                <p>정사각형 권장 (예: 512×512)</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-it-ink-500 dark:text-it-ink-300">
              {MESSAGES.team.logoRightsNotice}
            </p>
          </Field>

          {/* ── 2) 팀 이름 (필수) ── */}
          <Field label="팀 이름" required>
            <div
              className={cn(
                "h-12 rounded-w-md bg-it-fill dark:bg-it-blue-950 px-4 flex items-center",
                "border-[1.5px] border-it-line-strong dark:border-it-blue-900",
                "transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none",
                "focus-within:border-it-blue-500 focus-within:ring-2 focus-within:ring-it-blue-500/20",
              )}
            >
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="팀 이름"
                // focus-visible-disabled — 전역 a11y outline 과 wrapper ring 의 "이중 파란선" 회귀 방지.
                className="flex-1 bg-transparent border-0 outline-none focus-visible-disabled text-[16px] font-extrabold text-it-ink-800 dark:text-white tracking-tight placeholder:text-it-ink-400 placeholder:font-medium"
                maxLength={32}
              />
            </div>
          </Field>

          {/* ── 3) 팀 코드 (편집 가능, 선택) ──
              가입 시 미설정(null) 정책 — 감독이 여기서 고유 코드를 입력·변경. 영문/숫자/-/_ 3~32자.
              미입력 시 미설정(해제). 코드는 코치/학부모 초대 식별 보조용(가입 시 팀 선택은 팀 ID 기준). */}
          <Field
            label={MESSAGES.team.fieldTeamCode}
            hint={MESSAGES.team.fieldTeamCodeHint}
          >
            <div
              className={cn(
                "h-12 rounded-w-md bg-it-fill dark:bg-it-blue-950 px-4 flex items-center",
                "border-[1.5px] border-it-line-strong dark:border-it-blue-900",
                "transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none",
                "focus-within:border-it-blue-500 focus-within:ring-2 focus-within:ring-it-blue-500/20",
              )}
            >
              <input
                type="text"
                value={teamCode}
                onChange={(e) => setTeamCode(e.target.value)}
                placeholder="예: RUBY-DUCKS (선택)"
                className="flex-1 bg-transparent border-0 outline-none focus-visible-disabled text-[15.5px] font-extrabold text-it-ink-800 dark:text-white tracking-tight tabular-nums uppercase placeholder:text-it-ink-400 placeholder:font-medium placeholder:normal-case"
                maxLength={32}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          </Field>

          {/* ── 4) 팀 슬로건 (선택) ── */}
          <Field label={MESSAGES.team.fieldSlogan} hint="한 줄 인용문 (선택)">
            <div
              className={cn(
                "h-12 rounded-w-md bg-it-fill dark:bg-it-blue-950 px-4 flex items-center",
                "border-[1.5px] border-it-line-strong dark:border-it-blue-900",
                "transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none",
                "focus-within:border-it-blue-500 focus-within:ring-2 focus-within:ring-it-blue-500/20",
              )}
            >
              <input
                type="text"
                value={slogan}
                onChange={(e) => setSlogan(e.target.value)}
                placeholder={MESSAGES.team.fieldSloganPlaceholder}
                className="flex-1 bg-transparent border-0 outline-none focus-visible-disabled text-[15.5px] font-bold italic text-it-ink-800 dark:text-white tracking-tight placeholder:text-it-ink-400 placeholder:font-medium placeholder:not-italic"
                maxLength={80}
              />
            </div>
          </Field>

          {/* ── 5) 팀 소개 (선택) ── */}
          <Field label={MESSAGES.team.fieldDescription} hint="팀에 대한 짧은 소개 (선택)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={MESSAGES.team.fieldDescriptionPlaceholder}
              rows={6}
              maxLength={500}
              className="w-full min-h-[160px] rounded-w-md bg-it-fill dark:bg-it-blue-950 border-[1.5px] border-it-line-strong dark:border-it-blue-900 px-4 py-3 text-[15px] font-semibold text-it-ink-800 dark:text-white tracking-tight outline-none focus-visible-disabled placeholder:text-it-ink-400 placeholder:font-medium resize-none transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none focus:border-it-blue-500 focus:ring-2 focus:ring-it-blue-500/20"
            />
          </Field>

          {/* ── 6) 모집 대상 (선택) ── teams.division 컬럼 재활용(자유 텍스트). 리그 부문(TeamDivision)과 무관. */}
          <Field label={MESSAGES.team.fieldDivision} hint={MESSAGES.team.fieldDivisionHint}>
            <div
              className={cn(
                "h-12 rounded-w-md bg-it-fill dark:bg-it-blue-950 px-4 flex items-center",
                "border-[1.5px] border-it-line-strong dark:border-it-blue-900",
                "transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none",
                "focus-within:border-it-blue-500 focus-within:ring-2 focus-within:ring-it-blue-500/20",
              )}
            >
              <input
                type="text"
                value={division}
                onChange={(e) => setDivision(e.target.value)}
                placeholder={MESSAGES.team.fieldDivisionPlaceholder}
                className="flex-1 bg-transparent border-0 outline-none focus-visible-disabled text-[15.5px] font-bold text-it-ink-800 dark:text-white tracking-tight placeholder:text-it-ink-400 placeholder:font-medium"
                maxLength={40}
              />
            </div>
          </Field>

          {/* ── 7) 지역 (선택) ── teams.location 컬럼 재활용(자유 텍스트). 홈 경기장(venueId)과 별개. */}
          <Field label={MESSAGES.team.fieldRegion} hint={MESSAGES.team.fieldRegionHint}>
            <div
              className={cn(
                "h-12 rounded-w-md bg-it-fill dark:bg-it-blue-950 px-4 flex items-center",
                "border-[1.5px] border-it-line-strong dark:border-it-blue-900",
                "transition-[border-color,box-shadow] duration-150 motion-reduce:transition-none",
                "focus-within:border-it-blue-500 focus-within:ring-2 focus-within:ring-it-blue-500/20",
              )}
            >
              <input
                type="text"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder={MESSAGES.team.fieldRegionPlaceholder}
                className="flex-1 bg-transparent border-0 outline-none focus-visible-disabled text-[15.5px] font-bold text-it-ink-800 dark:text-white tracking-tight placeholder:text-it-ink-400 placeholder:font-medium"
                maxLength={40}
              />
            </div>
          </Field>

          {/* ── 8) 홈 링크장 (선택) ── 공통 VenuePicker(검색형) — 장소명 검색 시 매칭 목록 노출. */}
          <Field label="홈 링크장" hint="장소명을 검색해 선택">
            <VenuePicker
              value={venueId}
              onChange={setVenueId}
              placeholder="홈 링크장 검색"
              ariaLabel="홈 링크장"
            />
          </Field>

          {/* [메인/보조 컬러 입력 제거] 팀 컬러는 현재 화면 전반에서 활용되지 않아 입력을
              받지 않는다. 데이터 모델·팀 상세 표시는 보존 — 추후 팀 컬러 기능 도입 시 ColorField
              입력 위젯을 이 위치에 복원하면 된다(git 이력: ICETIMES 이전 Hero primaryColor 반영). */}

          {serverError && (
            <div className="rounded-w-md bg-it-red-50 dark:bg-it-red-500/10 border-[1.5px] border-it-red-200 dark:border-it-red-500/40 px-3.5 py-3 mb-5">
              <p className="text-[13px] font-semibold text-it-red-600 dark:text-it-red-300">
                {serverError}
              </p>
            </div>
          )}
        </form>
      </main>

      {/* ── 스티키 액션바 (취소 + 수정하기) ──
          [2026-05-09] BottomNav 높이 = 60px + safe-area-inset-bottom (iOS 34px+ / Android 제스처바 24~48px).
            기존 `bottom: 64` 하드코딩은 safe-area-inset-bottom 미고려 → iOS PWA/WebView 에서 액션바 하단이
            BottomNav 에 가려지는 현상. team/page.tsx FAB 와 동일한 calc 패턴으로 일관성 확보.
            액션바 하단을 BottomNav 상단에 정확히 붙여 모든 디바이스에서 잘리지 않도록 보정. */}
      <div
        className="absolute left-0 right-0 z-30 bg-it-surface dark:bg-it-blue-950 border-t border-it-line dark:border-it-blue-900 px-5 py-2.5 grid grid-cols-3 gap-2.5"
        style={{
          bottom: 'calc(60px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
        }}
        aria-label="팀 정보 수정 액션바"
      >
        <button
          type="button"
          onClick={() => router.back()}
          className="h-[50px] rounded-w-md bg-it-surface dark:bg-it-blue-950 border-[1.5px] border-it-line-strong dark:border-it-blue-900 text-it-ink-700 dark:text-it-ink-200 text-[15px] font-extrabold tracking-tight hover:bg-it-fill dark:hover:bg-it-blue-900 transition-colors motion-reduce:transition-none active:brightness-95"
        >
          취소
        </button>
        <button
          type="button"
          onClick={() => handleSubmit()}
          disabled={submitting || !name.trim()}
          aria-disabled={submitting || !name.trim()}
          className="col-span-2 h-[50px] rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 text-white text-[15px] font-extrabold tracking-tight inline-flex items-center justify-center transition-colors duration-150 ease-ios motion-reduce:transition-none active:brightness-95 disabled:bg-it-line-strong dark:disabled:bg-it-blue-900 disabled:cursor-not-allowed"
        >
          {submitting ? MESSAGES.common.saving : MESSAGES.common.edit}
        </button>
      </div>
    </MobileContainer>
  );
}

// ─── Field ───────────────────────────────────────
function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-[18px]">
      <div className="flex items-center gap-1 mb-2">
        <span className="text-[14px] font-extrabold text-it-ink-800 dark:text-white tracking-tight">
          {label}
        </span>
        {required && (
          <span className="text-it-red-500 text-[14px] font-extrabold">*</span>
        )}
      </div>
      {children}
      {hint && (
        <div className="mt-1.5 text-[13px] font-semibold text-it-ink-500 dark:text-it-ink-300">
          {hint}
        </div>
      )}
    </div>
  );
}
