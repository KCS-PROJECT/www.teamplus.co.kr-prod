"use client";

import { useEffect, useMemo, useState } from "react";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Icon } from "@/components/ui/Icon";
import { useDefaultUI } from "@/hooks/useNativeUI";
import { usePageReady } from "@/hooks/usePageReady";
import { cn } from "@/lib/utils";

/**
 * TimelineFeedPage - 타임라인 (활동 내역 피드)
 * Route: /timeline
 *
 * AppBar 의 "타임라인"(schedule 아이콘) 클릭 시 도달하는 화면.
 * 수업·결제·코치 메모를 시간순 피드 형태로 표시. body 영역만 신규 디자인.
 *
 * 디자인 사양 (사용자 참고자료 "04 · 타임라인" body 패턴):
 *  · 상단 5탭 필터 (전체/수업/결제/메모/안내) — 활성 탭 underline
 *  · 날짜 그룹 헤더 (ice-600 dot + 날짜)
 *  · 점선 세로 라인 + 좌측 dot indicator (수업·결제·메모 타입별 색 분기)
 *  · 수업 아이템 — 시간 + 제목 + 출석/결석 칩 + chevron
 *  · 결제 아이템 — 시간 + 제목 + 금액 (천단위 + 원)
 *  · 코치 메모 — sun 톤 노란 카드 + 좌측 sun-500 border
 *  · 프로모 배너 — rink-800 다크 카드 + 카드 아이콘 + chevron
 *  · 하단 floating pill (rink-900) — 필터/검색 아이콘
 *
 * 기능 구현 없음 (디자인 전용). 데이터는 정적 mock.
 */

type TabKey = "all" | "lesson" | "payment" | "note" | "info";

/* ───── 필터 (BottomSheet) ─────
   [추가 2026-05-17] 사용자 직접 지시 — 상단 필터 버튼 실제 기능 구현.
   탭(type) 위에 추가 차원으로 정렬·출석 상태·결제 금액을 누적 필터링.
   탭 = 1차 분류 (type), 필터 = 2차 정제. */
type SortKey = "newest" | "oldest";
type AttendanceKey = "출석" | "결석" | "지각";
type AmountKey = "all" | "50000" | "100000";

interface TimelineFilter {
  sort: SortKey;
  attendance: AttendanceKey[]; // 복수 선택
  amount: AmountKey;
}

const DEFAULT_FILTER: TimelineFilter = {
  sort: "newest",
  attendance: [],
  amount: "all",
};

const ATTENDANCE_OPTIONS: AttendanceKey[] = ["출석", "지각", "결석"];
const AMOUNT_OPTIONS: Array<{ key: AmountKey; label: string }> = [
  { key: "all", label: "전체" },
  { key: "50000", label: "5만원 이상" },
  { key: "100000", label: "10만원 이상" },
];

interface TimelineLesson {
  type: "lesson";
  time: string;
  title: string;
  sub: string;
  badge: "출석" | "결석" | "지각";
}

interface TimelinePayment {
  type: "payment";
  time: string;
  title: string;
  sub: string;
  amount: number;
}

interface TimelineNote {
  type: "note";
  time: string;
  title: string;
  body: string;
}

type TimelineItem = TimelineLesson | TimelinePayment | TimelineNote;

interface TimelineBanner {
  text: string;
  sub: string;
  icon: string;
}

interface TimelineDay {
  date: string;
  items: TimelineItem[];
  banner?: TimelineBanner;
}

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "all", label: "전체" },
  { key: "lesson", label: "수업" },
  { key: "payment", label: "결제" },
  { key: "note", label: "메모" },
  { key: "info", label: "안내" },
];

const MOCK_DAYS: TimelineDay[] = [
  {
    date: "2024년 12월 13일",
    items: [
      {
        type: "lesson",
        time: "17:00",
        title: "주니어 입문반 · 3회차",
        sub: "출석 · 김도훈 코치",
        badge: "출석",
      },
      {
        type: "note",
        time: "18:12",
        title: "코치 메모",
        body: "정지 동작 안정적으로 통과! 다음엔 한 발 활주 도전해봐요.",
      },
    ],
  },
  {
    date: "2024년 12월 11일",
    items: [
      {
        type: "lesson",
        time: "17:00",
        title: "주니어 입문반 · 2회차",
        sub: "출석 · 김도훈 코치",
        badge: "출석",
      },
    ],
    banner: {
      text: "12월 정기 결제일이 다가오고 있어요",
      sub: "12.20 주니어 입문반 4회분",
      icon: "credit_card",
    },
  },
  {
    date: "2024년 12월 08일",
    items: [
      {
        type: "payment",
        time: "10:32",
        title: "스케이트 대여 · 12월",
        sub: "목동 아이스링크",
        amount: 30000,
      },
      {
        type: "lesson",
        time: "17:00",
        title: "주니어 입문반 · 1회차",
        sub: "결석 · 대체 1회 적립",
        badge: "결석",
      },
    ],
  },
  {
    date: "2024년 12월 01일",
    items: [
      {
        type: "payment",
        time: "09:00",
        title: "주니어 입문반 12회 · 12월",
        sub: "목동 아이스링크",
        amount: 200000,
      },
    ],
  },
];

function matchesTab(item: TimelineItem, tab: TabKey): boolean {
  if (tab === "all") return true;
  if (tab === "lesson") return item.type === "lesson";
  if (tab === "payment") return item.type === "payment";
  if (tab === "note") return item.type === "note";
  return false;
}

export default function TimelineFeedPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  // [수정 2026-05-19] stickers/badges 와 100% 동일한 검증된 프리셋으로 정렬.
  //   useNativeUI({ showStatusBar:true, showAppBar:false, showBottomNav:true }) 와
  //   완전 동일 옵션. <PageAppBar forceNative /> 가 Web 단일 헤더로 렌더된다.
  useDefaultUI();

  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [filter, setFilter] = useState<TimelineFilter>(DEFAULT_FILTER);

  // 활성 필터 여부 — 필터 버튼 dot indicator 표시 조건
  const isFilterActive = useMemo(
    () =>
      filter.sort !== DEFAULT_FILTER.sort ||
      filter.attendance.length > 0 ||
      filter.amount !== DEFAULT_FILTER.amount,
    [filter],
  );

  const filteredDays = useMemo<TimelineDay[]>(() => {
    // ── 1) 탭(type) 1차 분류 ─────────────────────────────────
    let days: TimelineDay[];
    if (activeTab === "all") {
      days = MOCK_DAYS;
    } else if (activeTab === "info") {
      days = MOCK_DAYS.filter((d) => d.banner).map((d) => ({
        ...d,
        items: [],
      }));
    } else {
      days = MOCK_DAYS.map((d) => ({
        ...d,
        items: d.items.filter((it) => matchesTab(it, activeTab)),
        banner: undefined,
      })).filter((d) => d.items.length > 0);
    }

    // ── 2) 출석 상태 필터 (lesson type 한정, 다중 선택) ──────
    if (filter.attendance.length > 0) {
      days = days
        .map((d) => ({
          ...d,
          items: d.items.filter((it) => {
            if (it.type === "lesson")
              return filter.attendance.includes(it.badge);
            // lesson 이 아닌 type 은 필터에 영향받지 않지만, 출석 필터 활성 시
            // 'lesson 만 보기' 의도와 충돌하지 않게 보존 (탭이 lesson 이면 자동 매칭)
            return true;
          }),
        }))
        .filter((d) => d.items.length > 0 || d.banner);
    }

    // ── 3) 결제 금액 필터 (payment type 한정, 단일 선택) ─────
    if (filter.amount !== "all") {
      const min = parseInt(filter.amount, 10);
      days = days
        .map((d) => ({
          ...d,
          items: d.items.filter((it) => {
            if (it.type === "payment") return it.amount >= min;
            return true;
          }),
        }))
        .filter((d) => d.items.length > 0 || d.banner);
    }

    // ── 4) 정렬 ──────────────────────────────────────────────
    if (filter.sort === "oldest") {
      days = [...days].reverse();
    }

    return days;
  }, [activeTab, filter]);

  return (
    <MobileContainer hasBottomNav={true} className="flex flex-col h-full">
      {/* [수정 2026-05-19 v2] 사용자 직접 지시 — AppBar 누락 회복 (재발).
          1) useDefaultUI() 로 Flutter Native AppBar 비활성화 (showAppBar:false)
          2) <PageAppBar forceNative /> 로 Web AppBar 를 Native 환경에서도 단일 헤더로 강제 노출
          3) variant="default" 명시 + showMenu/showSearch=true 명시로 SSR/hydration race 차단
          4) MobileContainer 에 'flex flex-col h-full' 명시 — notifications/badges/stickers 와 100% 동일
          (검증된 동일 패턴: notifications/badges/checklist/gift/stickers — [appbar-team5-#7] 표준) */}
      <PageAppBar
        title="타임라인"
        variant="default"
        forceNative
        showBack
        showMenu
      />


      {/* ── 검색바 + 필터 버튼 — 상단 액션 영역 ──────────────────────
          [수정 2026-05-17] 사용자 직접 지시: 기존 하단 floating pill(필터·검색)
          → 상단으로 이동하여 활용성 강화. 검색 input 은 항상 노출, 필터 버튼은
          tune 아이콘 단일 액션. 헤더-탭 사이 회색 배경 영역에 배치하여 탭과 자연 분리. */}
      <div className="shrink-0 bg-wsurface dark:bg-rink-900 px-5 pt-3 pb-3">
        <div className="flex items-center gap-2">
          {/* 검색 input — 회색 캔버스(bg-wbg) + 좌측 search 아이콘 */}
          <label className="relative flex-1 flex items-center">
            <Icon
              name="search"
              className="absolute left-3 text-[18px] text-wtext-3 dark:text-rink-300 pointer-events-none"
              aria-hidden="true"
            />
            <input
              type="search"
              placeholder="수업·결제·메모 검색"
              aria-label="타임라인 검색"
              className={cn(
                "w-full h-10 pl-10 pr-3 rounded-w-md",
                "bg-wbg dark:bg-rink-800 border border-wline-2 dark:border-rink-700",
                "text-[13.5px] text-wtext-1 dark:text-white placeholder:text-wtext-4 dark:placeholder:text-rink-400",
                "tracking-[-0.01em] focus:outline-none focus-visible:border-ice-500",
                "transition-colors motion-reduce:transition-none",
              )}
            />
          </label>
          {/* 필터 버튼 — BottomSheet 트리거. 활성 필터가 있으면 우상단 flame-500 dot indicator */}
          <button
            type="button"
            onClick={() => setIsFilterOpen(true)}
            aria-label={isFilterActive ? "필터 (적용 중)" : "필터"}
            aria-haspopup="dialog"
            aria-expanded={isFilterOpen}
            className={cn(
              "relative shrink-0 grid place-items-center w-10 h-10 rounded-w-md border",
              isFilterActive
                ? "bg-ice-500 border-ice-500 text-white"
                : "bg-wbg dark:bg-rink-800 border-wline-2 dark:border-rink-700 text-wtext-2 dark:text-rink-100",
              "transition-colors motion-reduce:transition-none",
              !isFilterActive && "hover:bg-wline-2 dark:hover:bg-rink-700",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40",
            )}
          >
            <Icon name="tune" className="text-[18px]" aria-hidden="true" />
            {isFilterActive && (
              <span
                aria-hidden="true"
                className="absolute -top-[3px] -right-[3px] w-2.5 h-2.5 rounded-full bg-flame-500 ring-2 ring-wsurface dark:ring-rink-900"
              />
            )}
          </button>
        </div>
      </div>

      {/* ── 탭 (전체/수업/결제/메모/안내) — 활성 탭 underline ───────── */}
      <nav
        className="shrink-0 bg-wsurface dark:bg-rink-900 border-b border-wline-2 dark:border-rink-700/60"
        aria-label="타임라인 필터"
      >
        <ul className="flex items-stretch gap-5 px-5 pt-3">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <li key={tab.key}>
                <button
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  aria-pressed={isActive}
                  className={cn(
                    "relative -mb-px pb-3 text-[14px] tracking-[-0.01em] transition-colors motion-reduce:transition-none",
                    isActive
                      ? "font-bold text-wtext-1 dark:text-white"
                      : "font-medium text-wtext-4 dark:text-rink-300 hover:text-wtext-2 dark:hover:text-rink-100",
                  )}
                >
                  {tab.label}
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 -bottom-px h-[2.5px] rounded-full bg-wtext-1 dark:bg-white"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── Body : 타임라인 피드 ─────────────────────────────────── */}
      {/* data-no-enter: globals.css 의 [data-mobile-shell] main > * stagger slideUp 비활성.
          타임라인은 진입 시 컴포넌트가 위로 올라오는 애니메이션 없이 즉시 표시. */}
      <main
        data-no-enter
        className="relative flex-1 overflow-y-auto bg-wbg dark:bg-rink-900"
      >
        {filteredDays.length === 0 ? (
          <div className="flex flex-col items-center justify-center pt-24 gap-3 px-6 text-center">
            <Icon
              name="schedule"
              className="text-[44px] text-wtext-4 dark:text-rink-500"
              aria-hidden="true"
            />
            <p className="text-card-body text-wtext-3 dark:text-rink-300">
              해당 항목이 없습니다.
            </p>
          </div>
        ) : (
          // pb-4 — 하단 floating pill 제거(2026-05-17) 후 MobileContainer 자동 pb-30 만으로 충분
          // relative — 자식 <li> 의 점선 대신 ol 전체에 걸친 단일 연속 점선을 absolute 로 배치하기 위한 컨테이너
          <ol className="relative pt-2 pb-4 space-y-[10px]">
            {/* 세로 연속 점선 — ol 전체 영역에 단일 라인으로 그려 day 사이 gap 까지 연결.
                [수정 2026-05-17 v2] 사용자 직접 지시 (2건 통합):
                  · 끊김 분석: dash gap 색 대비 부족 + 점선 시작/끝점이 첫·마지막 dot center 와
                    어긋나 `|` 자국이 dot 위·아래로 삐져나옴.
                  · 해결 1) inset 0 으로 ol 전체를 덮고 mask-image gradient 로 양 끝 28px 페이드
                          → dot center 위치를 정확히 계산하지 않아도 dot 안에서 자연스럽게 사라짐.
                  · 해결 2) 색상을 wtext-4/55 → wtext-3 (한 단계 더 진한 회색 #4b556a) 로 강화. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-[23px] top-0 bottom-0 w-px border-l border-dashed border-wtext-3/70 dark:border-rink-300/55"
              style={{
                // [수정 2026-05-17 v5] 사용자 직접 지시 — 마지막 day 의 ice dot ↔ row dot 사이 점선 가시성 회복.
                //   v4 mask: 아래쪽 transparent 56px + fade 56~80px(24px). 두 dot 사이(52px) 가
                //     fade 영역에 절반 이상 들어가 평균 30~50% opacity 로 흐려짐.
                //   v5 mask: fade out 영역을 dot 가시 영역 안쪽(40~50px from bottom)으로 좁혀,
                //     · 가운데 black 영역이 50px from bottom 까지 확장 → ice↔row 사이 점선 명확히 보임
                //     · dot 자체(40~50px) 의 bg-wsurface 가 fade 영역을 가려 시각적 자국 없음
                //     · dot 아래 40px hard transparent → row dot 아래 점선 0
                //   위쪽은 변경 없음 (첫 ice dot 위쪽 자국은 v3 이후 해결됨).
                maskImage:
                  'linear-gradient(to bottom, transparent 0, transparent 32px, black 56px, black calc(100% - 50px), transparent calc(100% - 40px), transparent 100%)',
                WebkitMaskImage:
                  'linear-gradient(to bottom, transparent 0, transparent 32px, black 56px, black calc(100% - 50px), transparent calc(100% - 40px), transparent 100%)',
              }}
            />
            {filteredDays.map((day) => {
              return (
              // 날짜 그룹 컨테이너 — 점선은 부모 ol 에 단일로 그려져 있음
              // ice dot 이 정확히 점선 라인 중앙(중심 = 23px)을 관통하는 시각 효과
              <li key={day.date} className="relative">
                {/* 날짜 헤더 — dot 을 inline flex child 로 배치하여 items-center 자동 baseline 정렬.
                    수치 의도:
                      · pl-[17.5px] + dot width 12 = dot center 23.5px → 점선 border center(23.5px) 와 정확히 일치
                        [수정 2026-05-17] 사용자 직접 지시 — 점선이 ice dot 정확히 가운데로 관통하도록
                        기존 pl-[17px](center 23px) → pl-[17.5px](center 23.5px). 다른 row dot(left-[-5.5px])
                        과도 동일 23.5px 정렬 일관성 확보.
                      · gap-2 (8px) → dot 우측 가장자리 ↔ 텍스트 left 사이 8px 시각 여백
                      · ring-[3px] ring-wbg → dot 주위 점선을 가려 "동그라미 위로 | 관통" 시각 강조
                      · pt-4 pb-1 비대칭 padding 유지 (디자인 의도) — dot 도 동일 line-box 안에 있어 자연 정렬 */}
                <div className="relative flex items-center gap-2 pt-4 pb-1 pl-[17.5px]">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "shrink-0 z-10 w-3 h-3 rounded-full bg-ice-500",
                      "ring-[3px] ring-wbg dark:ring-rink-900",
                    )}
                  />
                  <span className="font-num tabular-nums text-[13px] font-bold leading-none text-ice-600 dark:text-ice-300 tracking-[-0.01em]">
                    {day.date}
                  </span>
                </div>

                {/* 항목 리스트 — 점선은 위에서 이미 그렸으므로 추가 점선 없음.
                    pl-[23px] 유지하여 row 내부 node dot 의 left-[-5.5px] 가 동일 23px 라인에 정렬. */}
                <div className="relative pl-[23px]">
                  <ul>
                    {day.items.map((item, idx) => (
                      <li key={`${day.date}-${idx}`}>
                        <TimelineRow item={item} />
                      </li>
                    ))}
                    {day.banner && (
                      <li>
                        <PromoBannerRow banner={day.banner} />
                      </li>
                    )}
                  </ul>
                </div>
              </li>
              );
            })}
          </ol>
        )}
        {/* [제거 2026-05-17] 하단 floating filter pill — 사용자 지시로 상단으로 이동.
            검색 input + 필터 버튼이 PageAppBar 직하단 액션 영역에 통합됨. */}
      </main>

      {/* ── 필터 BottomSheet ─────────────────────────────────────── */}
      <FilterSheet
        open={isFilterOpen}
        initial={filter}
        onApply={(next) => {
          setFilter(next);
          setIsFilterOpen(false);
        }}
        onClose={() => setIsFilterOpen(false)}
      />
    </MobileContainer>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Row 컴포넌트
// ──────────────────────────────────────────────────────────────────────

function TimelineRow({ item }: { item: TimelineItem }) {
  if (item.type === "note") return <NoteRow item={item} />;
  if (item.type === "payment") return <PaymentRow item={item} />;
  return <LessonRow item={item} />;
}

function LessonRow({ item }: { item: TimelineLesson }) {
  const isAbsent = item.badge === "결석";
  const isLate = item.badge === "지각";
  return (
    <div className="relative flex items-center gap-3 pl-3.5 pr-5 py-2.5">
      {/* node dot — row 수직 정중앙 정렬 (top-1/2 + -translate-y-1/2) →
          multi-line row(제목+서브 두 줄)에서도 시간/제목과 같은 baseline 유지. */}
      <span
        aria-hidden="true"
        className="absolute z-10 left-[-5.5px] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-wsurface dark:bg-rink-900 border-[2.5px] border-wtext-2 dark:border-rink-300"
      />
      <span className="w-14 font-num tabular-nums text-[12px] font-semibold text-wtext-3 dark:text-rink-300">
        {item.time}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[14px] font-bold text-wtext-1 dark:text-white tracking-[-0.01em] truncate">
            {item.title}
          </span>
          {/* 참고자료 Chip active=true 매칭 — 활성 배경(mint-500/flame-500/sun-500) + 흰 텍스트 */}
          <span
            className={cn(
              "shrink-0 inline-flex items-center h-[18px] px-[7px] rounded-full text-[10px] font-bold tracking-[-0.01em]",
              isAbsent
                ? "bg-flame-500 text-white"
                : isLate
                  ? "bg-sun-500 text-wtext-1"
                  : "bg-mint-500 text-white",
            )}
          >
            {item.badge}
          </span>
        </div>
        <p className="mt-0.5 text-[12px] text-wtext-3 dark:text-rink-300 truncate">
          {item.sub}
        </p>
      </div>
      <Icon
        name="chevron_right"
        className="shrink-0 text-[16px] text-wtext-4 dark:text-rink-300"
        aria-hidden="true"
      />
    </div>
  );
}

function PaymentRow({ item }: { item: TimelinePayment }) {
  return (
    <div className="relative flex items-center gap-3 pl-3.5 pr-5 py-2.5">
      {/* node dot — row 수직 정중앙 정렬 → 시간/제목/금액과 같은 baseline. */}
      <span
        aria-hidden="true"
        className="absolute z-10 left-[-5.5px] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-wsurface dark:bg-rink-900 border-[2.5px] border-wtext-2 dark:border-rink-300"
      />
      <span className="w-14 font-num tabular-nums text-[12px] font-semibold text-wtext-3 dark:text-rink-300">
        {item.time}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-bold text-wtext-1 dark:text-white tracking-[-0.01em] truncate">
          {item.title}
        </p>
        <p className="mt-0.5 text-[12px] text-wtext-3 dark:text-rink-300 truncate">
          {item.sub}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="font-num tabular-nums text-[15px] font-extrabold text-wtext-1 dark:text-white">
          {item.amount.toLocaleString()}
          <span className="ml-0.5 text-[12px] font-semibold text-wtext-2 dark:text-rink-100">
            원
          </span>
        </span>
        <Icon
          name="chevron_right"
          className="text-[16px] text-wtext-4 dark:text-rink-300"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function NoteRow({ item }: { item: TimelineNote }) {
  return (
    <div className="relative pl-3.5 pr-5 py-2">
      <span
        aria-hidden="true"
        className="absolute left-[-5.5px] top-[14px] w-3 h-3 rounded-full bg-sun-100 border-[2.5px] border-sun-500"
      />
      {/* 참고자료 매칭 — bg #FFF8E0, headerColor #9a7900 (sun.offText)
          [수정 2026-05-17] 좌측 세로 표시(border-l-[3px] border-sun-500) 제거 — 사용자 직접 지시. */}
      <div
        className="rounded-[14px] px-3.5 py-3 bg-[#FFF8E0] dark:bg-amber-950/40"
      >
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#9a7900] dark:text-amber-300">
          <Icon
            name="chat_bubble_outline"
            className="text-[12px]"
            aria-hidden="true"
          />
          <span>{item.title}</span>
          <span aria-hidden="true">·</span>
          <span className="font-num tabular-nums">{item.time}</span>
        </div>
        <p className="mt-1 text-[13px] leading-[1.55] text-wtext-1 dark:text-white">
          “{item.body}”
        </p>
      </div>
    </div>
  );
}

function PromoBannerRow({ banner }: { banner: TimelineBanner }) {
  return (
    <div className="pl-3.5 pr-5 py-2">
      <div
        className={cn(
          "flex items-center gap-3 rounded-[14px] px-4 py-3.5 text-white",
          "bg-rink-800 dark:bg-rink-700",
        )}
      >
        <span
          aria-hidden="true"
          className="grid place-items-center w-9 h-9 rounded-[10px] bg-white/10"
        >
          <Icon
            name={banner.icon}
            className="text-[18px] text-white"
            aria-hidden="true"
          />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold leading-[1.4] truncate">
            {banner.text}
          </p>
          <p className="mt-0.5 text-[11px] text-white/70 truncate">
            {banner.sub}
          </p>
        </div>
        <Icon
          name="chevron_right"
          className="shrink-0 text-[16px] text-white/70"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// FilterSheet — 필터 BottomSheet
// [추가 2026-05-17] 사용자 직접 지시 — 상단 필터 버튼 실제 기능 구현.
// [수정 2026-05-17 v4] 표준 BottomSheet 컴포넌트(src/components/ui/BottomSheet.tsx) 로 전환.
//   · createPortal 로 MobileContainer overflow 클리핑 우회 → BottomNav 위로 자연스럽게 stacking
//   · 핸들 바·헤더·close X·body scroll lock·ESC 닫기·오버레이 클릭 닫기·useNativeScrim 모두 자동
//   · animate-sheet-up + animate-overlay-in 표준 모션
//   · footer 슬롯에 safe-area-inset-bottom 자동 적용
// ──────────────────────────────────────────────────────────────────────

function FilterSheet({
  open,
  initial,
  onApply,
  onClose,
}: {
  open: boolean;
  initial: TimelineFilter;
  onApply: (next: TimelineFilter) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<TimelineFilter>(initial);

  // open 토글 시 draft 를 page filter 와 동기화 — 모달 재오픈 시 직전 적용 상태부터 시작
  useEffect(() => {
    if (open) setDraft(initial);
  }, [open, initial]);

  const toggleAttendance = (k: AttendanceKey) => {
    setDraft((d) => ({
      ...d,
      attendance: d.attendance.includes(k)
        ? d.attendance.filter((x) => x !== k)
        : [...d.attendance, k],
    }));
  };

  return (
    <BottomSheet
      isOpen={open}
      onClose={onClose}
      title="필터"
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDraft(DEFAULT_FILTER)}
            className={cn(
              "h-12 px-5 rounded-w-md border text-[14px] font-bold tracking-[-0.01em]",
              "bg-wsurface dark:bg-rink-800 border-wline-2 dark:border-rink-700",
              "text-wtext-2 dark:text-rink-100",
              "transition-colors motion-reduce:transition-none",
              "hover:bg-wbg dark:hover:bg-rink-900/40",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40",
            )}
          >
            초기화
          </button>
          <button
            type="button"
            onClick={() => onApply(draft)}
            className={cn(
              "flex-1 h-12 rounded-w-md bg-ice-500 text-white text-[14px] font-extrabold tracking-[-0.01em]",
              "transition-colors motion-reduce:transition-none",
              "hover:bg-ice-700 active:brightness-95",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40",
            )}
          >
            적용
          </button>
        </div>
      }
    >
      <div className="space-y-5 pt-1">
        {/* 정렬 */}
        <FilterSection label="정렬">
          <FilterChip
            selected={draft.sort === "newest"}
            onClick={() => setDraft((d) => ({ ...d, sort: "newest" }))}
          >
            최신순
          </FilterChip>
          <FilterChip
            selected={draft.sort === "oldest"}
            onClick={() => setDraft((d) => ({ ...d, sort: "oldest" }))}
          >
            오래된순
          </FilterChip>
        </FilterSection>

        {/* 출석 상태 (다중) */}
        <FilterSection label="출석 상태" hint="복수 선택 가능">
          {ATTENDANCE_OPTIONS.map((k) => (
            <FilterChip
              key={k}
              selected={draft.attendance.includes(k)}
              onClick={() => toggleAttendance(k)}
            >
              {k}
            </FilterChip>
          ))}
        </FilterSection>

        {/* 결제 금액 */}
        <FilterSection label="결제 금액">
          {AMOUNT_OPTIONS.map((opt) => (
            <FilterChip
              key={opt.key}
              selected={draft.amount === opt.key}
              onClick={() => setDraft((d) => ({ ...d, amount: opt.key }))}
            >
              {opt.label}
            </FilterChip>
          ))}
        </FilterSection>
      </div>
    </BottomSheet>
  );
}

function FilterSection({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-1.5 mb-2.5">
        <h3 className="text-[13.5px] font-extrabold text-wtext-1 dark:text-white tracking-[-0.01em]">
          {label}
        </h3>
        {hint && (
          <span className="text-[11.5px] font-medium text-wtext-3 dark:text-wtext-4">
            {hint}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  );
}

function FilterChip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "h-9 px-3.5 rounded-w-pill border text-[13px] font-bold tracking-[-0.01em]",
        "transition-colors motion-reduce:transition-none",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40",
        selected
          ? "bg-ice-500 border-ice-500 text-white"
          : "bg-wbg dark:bg-rink-900 border-wline-2 dark:border-rink-700 text-wtext-2 dark:text-rink-100 hover:bg-wline-2 dark:hover:bg-rink-700",
      )}
    >
      {children}
    </button>
  );
}
