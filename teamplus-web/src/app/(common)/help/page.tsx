"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, type ReactNode } from "react";
import { NavLink } from "@/components/ui/NavLink";
import { MobileContainer } from "@/components/layout/MobileContainer";
import { PageAppBar } from "@/components/layout/PageAppBar";
import { useNativeUI } from "@/hooks/useNativeUI";
import { api } from "@/services/api-client";
import { useAppSettingsContext } from "@/contexts/AppSettingsContext";
import { usePageReady } from "@/hooks/usePageReady";

/**
 * HelpCenterPage - 도움말 센터 (공통 사용자 전용)
 * Route: /help
 *
 * 목적: 모든 역할(admin/director/coach/parent/teen/child)이 공통으로 사용하는
 *       지원 채널을 한 화면에서 접근. 분산된 FAQ/약관/공지/피드백을 허브화.
 *
 * 데이터 소스:
 * - GET /api/v1/app/faqs (상단 인기 FAQ 3개)
 * - GET /api/v1/app/settings (연락처, 버전)
 *
 * 디자인 (2026-05-15 ref: app/screen-help.jsx M3 · 도움말 body 100% 일치):
 * - 통일 회색(wline-2) 톤의 2x2 메뉴 카드 (4가지 색 분기 제거)
 * - 카드 box-shadow 강조, border 제거
 * - 섹션 헤더 정상 한글 표기 (uppercase / tracking-wider 제거)
 * - 아이콘 박스 44×44 통일
 * - 직접 문의: 이메일만 (전화 카드 제거)
 * - Footer: 원형 info 아이콘 + 중앙 정렬
 * - AppBar/BottomNav 불가침 — MobileContainer body 영역만 변경.
 */

interface FAQPreview {
  id: string;
  category: string;
  question: string;
  answer: string;
  sortOrder: number;
  isActive: boolean;
}

interface ShortcutItem {
  icon: ReactNode;
  label: string;
  description: string;
  href: string;
}

/*
  Shortcut SVG — ref: app/screen-help.jsx M3 · 도움말 2×2 메뉴
  ref 색상: stroke={T.text2} (#2a3247) → `stroke="currentColor"`로 통일 후
  부모 wrapper 가 text-wtext-2 적용.
  ref svg 크기: 20×20, viewBox 0 0 20 20.
*/
const ICON_FAQ = (
  <>
    <path
      d="M5 4h11v10H10l-3 2.5V14H5V4z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <circle cx="10" cy="8.5" r="0.7" fill="currentColor" />
    <path
      d="M8.5 7.5c0-1 .7-1.6 1.5-1.6s1.5.6 1.5 1.5c0 1-1.5 1-1.5 2"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      fill="none"
    />
  </>
);

const ICON_FEEDBACK = (
  <>
    <rect
      x="3"
      y="4"
      width="14"
      height="10"
      rx="2"
      stroke="currentColor"
      strokeWidth="1.6"
    />
    <path
      d="M6 7h8M6 10h5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M7 14l-1 3 3-1"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </>
);

const ICON_NOTICE = (
  <path
    d="M4 7v6l2 1v2h2l-1-3 8-1 1 1V4l-1 1-8-1L4 5z"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinejoin="round"
  />
);

const ICON_POLICY = (
  <>
    <path
      d="M5 3h7l3 3v11H5z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <path
      d="M12 3v3h3M7.5 9h5M7.5 12h5"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </>
);

const SHORTCUTS: ShortcutItem[] = [
  {
    icon: ICON_FAQ,
    label: "자주 묻는 질문",
    description: "회원가입·결제·출석 등 자주 묻는 질문",
    href: "/faq",
  },
  {
    icon: ICON_FEEDBACK,
    label: "피드백 보내기",
    description: "오류 신고·개선 제안·문의사항",
    href: "/feedback",
  },
  {
    icon: ICON_NOTICE,
    label: "공지사항",
    description: "새로운 기능과 주요 안내",
    href: "/notices",
  },
  {
    icon: ICON_POLICY,
    label: "약관 및 정책",
    description: "이용약관·개인정보 처리방침",
    href: "/terms",
  },
];

export default function HelpCenterPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  // 공통 AppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const { settings } = useAppSettingsContext();
  const [topFaqs, setTopFaqs] = useState<FAQPreview[]>([]);
  const [isLoadingFaqs, setIsLoadingFaqs] = useState(true);

  // 인기 FAQ 상위 3개 프리뷰
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoadingFaqs(true);
      const res = await api.get<FAQPreview[]>("/app/faqs");
      if (cancelled) return;
      if (res.success && Array.isArray(res.data)) {
        const top = res.data
          .filter((f) => f.isActive !== false)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
          .slice(0, 3);
        setTopFaqs(top);
      }
      setIsLoadingFaqs(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const supportEmail = settings?.supportEmail ?? "admin@teamplus.com";
  const appVersion = settings?.appVersion ?? "1.0.0";
  const appName = settings?.appName ?? "TEAMPLUS";

  // 이메일 문의 링크 — 기본 제목/본문을 채워 CS 분류 용이
  const mailtoHref = (() => {
    const subject = encodeURIComponent(`[${appName} v${appVersion}] 문의`);
    const body = encodeURIComponent(
      "아래에 문의 내용을 자유롭게 작성해주세요.\n\n---\n\n(자동 첨부) TEAMPLUS 고객센터로 문의를 남기셨습니다.",
    );
    return `mailto:${supportEmail}?subject=${subject}&body=${body}`;
  })();

  return (
    <MobileContainer hasBottomNav>
      {/* [2026-05-13 이슈 D13] forceNative — App/Web 동일 AppBar.
          위 useNativeUI({showAppBar:false}) 가 Flutter Native AppBar 끔 (이중 헤더 방지). */}
      <PageAppBar title="도움말" forceNative />

      {/*
        Body 영역 — ref: app/screen-help.jsx HelpScreen 의 inner scroll container.
        ref: padding: "20px 20px 100px". MobileContainer 가 pb-30(120px) 강제하므로
        하단 100px 은 컨테이너에서 보장되어 main 자체는 pt-5 px-5 만 부여.
      */}
      <main className="flex-1 overflow-y-auto px-5 pt-5">
        {/* Intro — ref: 22px font-extrabold text1 letter-spacing -0.03em / 13px text3 mt-1.5
            ref div 는 line-height 명시 없음 → default(normal) 유지를 위해 leading 미지정. */}
        <section>
          <h2 className="text-card-section font-extrabold text-wtext-1 dark:text-white tracking-[-0.03em]">
            무엇을 도와드릴까요?
          </h2>
          <p className="mt-1.5 text-card-body font-medium text-wtext-3 dark:text-wtext-4 leading-[1.5]">
            자주 묻는 질문을 확인하거나 고객센터로 문의해주세요.
          </p>
        </section>

        {/* 2×2 Menu Grid — ref: gap 10, gridTemplateColumns 1fr 1fr */}
        <section className="mt-5">
          <div className="grid grid-cols-2 gap-2.5">
            {SHORTCUTS.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                aria-label={`${item.label} — ${item.description}`}
                /*
                  ref:
                    background: T.surface, border: none, borderRadius: 16,
                    boxShadow: "0 2px 8px rgba(20,24,38,0.04)",
                    padding: "16px 16px 18px", flex column, gap 12, minHeight 150
                */
                className="
                  group flex flex-col gap-3 min-h-[150px]
                  rounded-2xl bg-wsurface dark:bg-rink-800
                  px-4 pt-4 pb-[18px]
                  shadow-[0_2px_8px_rgba(20,24,38,0.04)]
                  dark:shadow-[0_2px_8px_rgba(0,0,0,0.25)]
                  transition-transform motion-reduce:transition-none
                  active:scale-[0.98]
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40
                "
              >
                {/* ref: 44×44 borderRadius 12 background T.line2 + 20×20 inline SVG */}
                <div className="w-11 h-11 rounded-xl bg-wline-2 dark:bg-rink-700 grid place-items-center text-wtext-2 dark:text-wtext-4">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    aria-hidden="true"
                  >
                    {item.icon}
                  </svg>
                </div>
                <div>
                  {/* ref: 14px font-extrabold text1 letter-spacing -0.02em */}
                  <p className="text-card-body font-extrabold text-wtext-1 dark:text-white tracking-[-0.02em]">
                    {item.label}
                  </p>
                  {/* ref: 11px text3 mt 4 lineHeight 1.45 font-weight 500 */}
                  <p className="mt-1 text-card-meta font-medium text-wtext-3 dark:text-wtext-4 leading-[1.45]">
                    {item.description}
                  </p>
                </div>
              </NavLink>
            ))}
          </div>
        </section>

        {/* 자주 묻는 질문 — ref: mt 24 (헤더) + mt 10 (콘텐츠) */}
        <section className="mt-6">
          <div className="flex items-center justify-between">
            {/* ref: 14px font-extrabold text1 letter-spacing -0.02em */}
            <h3 className="text-card-body font-extrabold text-wtext-1 dark:text-white tracking-[-0.02em]">
              자주 묻는 질문
            </h3>
            <NavLink
              href="/faq"
              className="inline-flex items-center gap-1 text-card-meta font-extrabold text-ice-500"
            >
              전체 보기
              {/* ref: 10×10 chevron */}
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M3 2l3 3-3 3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </NavLink>
          </div>

          <div className="mt-2.5">
            {isLoadingFaqs ? null : topFaqs.length === 0 ? (
              /*
                ref Empty:
                  padding 32px 20px, background surface, borderRadius 16,
                  border 1px dashed T.line, flex col items center gap 10
                  아이콘: 44×44 round-full bg line2
                  텍스트: 13px text3 font-bold
              */
              <div
                className="
                  flex flex-col items-center gap-2.5
                  py-8 px-5
                  rounded-2xl bg-wsurface dark:bg-rink-800
                  border border-dashed border-wline dark:border-rink-700
                "
              >
                {/* ref: 44×44 round-full bg line2 + 20×20 inline SVG (원 + 물음표 곡선 + 점)
                    ref svg color: stroke/fill T.text3 */}
                <div className="w-11 h-11 rounded-full bg-wline-2 dark:bg-rink-700 grid place-items-center text-wtext-3 dark:text-wtext-4">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle
                      cx="10"
                      cy="10"
                      r="7"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="M7.5 8c0-1.4 1.1-2.4 2.5-2.4S12.5 6.6 12.5 7.8c0 1-.5 1.5-1.5 2-.7.4-1 .8-1 1.6"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                    <circle cx="10" cy="14.2" r="0.9" fill="currentColor" />
                  </svg>
                </div>
                <p className="text-card-body font-bold text-wtext-3 dark:text-wtext-4">
                  등록된 FAQ가 없습니다
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {topFaqs.map((faq) => (
                  <li key={faq.id}>
                    <NavLink
                      href={`/faq?id=${encodeURIComponent(faq.id)}`}
                      aria-label={`자주 묻는 질문: ${faq.question}`}
                      className="
                        flex items-center justify-between gap-3 p-4
                        rounded-2xl bg-wsurface dark:bg-rink-800
                        shadow-[0_2px_8px_rgba(20,24,38,0.04)]
                        dark:shadow-[0_2px_8px_rgba(0,0,0,0.25)]
                        transition-transform motion-reduce:transition-none
                        active:scale-[0.99]
                      "
                    >
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <span className="shrink-0 w-6 h-6 rounded-full bg-ice-50 dark:bg-ice-500/15 text-ice-500 grid place-items-center text-card-meta font-extrabold">
                          Q
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-card-meta font-medium text-wtext-3 dark:text-wtext-4 mb-0.5">
                            {faq.category}
                          </p>
                          <p className="text-card-body font-extrabold text-wtext-1 dark:text-white tracking-[-0.02em] truncate">
                            {faq.question}
                          </p>
                        </div>
                      </div>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        className="shrink-0 text-wtext-3 dark:text-wtext-4"
                        aria-hidden="true"
                      >
                        <path
                          d="M6 3l4 5-4 5"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </NavLink>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* 직접 문의 — ref: mt 20 / 헤더 12px font-extrabold text3 letter-spacing -0.01em */}
        <section className="mt-5">
          <h3 className="text-card-meta font-extrabold text-wtext-3 dark:text-wtext-4 tracking-[-0.01em]">
            직접 문의
          </h3>
          <a
            href={mailtoHref}
            aria-label={`이메일 문의: ${supportEmail}`}
            /*
              ref:
                mt 10, width 100%, padding 16, background surface, borderRadius 16
                box-shadow 0 2px 8px rgba(20,24,38,0.04)
                flex items center gap 14
            */
            className="
              mt-2.5 flex items-center gap-3.5 p-4 w-full
              rounded-2xl bg-wsurface dark:bg-rink-800
              shadow-[0_2px_8px_rgba(20,24,38,0.04)]
              dark:shadow-[0_2px_8px_rgba(0,0,0,0.25)]
              transition-transform motion-reduce:transition-none
              active:scale-[0.99]
              focus:outline-none focus-visible:ring-2 focus-visible:ring-ice-500/40
            "
          >
            {/* ref: 44×44 borderRadius 12 background T.ice50 / ice500 icon */}
            <div className="w-11 h-11 shrink-0 rounded-xl bg-ice-50 dark:bg-ice-500/15 grid place-items-center">
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
              >
                <rect
                  x="3"
                  y="5"
                  width="14"
                  height="11"
                  rx="2"
                  stroke="#2f5fff"
                  strokeWidth="1.6"
                />
                <path
                  d="M3 6.5l7 5 7-5"
                  stroke="#2f5fff"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-card-body font-extrabold text-wtext-1 dark:text-white tracking-[-0.02em]">
                이메일 문의
              </p>
              {/* ref: 12px text3 mt 2 FONT_NUM font-weight 600 — truncate 명시 없음 */}
              <p className="mt-0.5 text-card-meta font-semibold text-wtext-3 dark:text-wtext-4 font-num tabular-nums">
                {supportEmail}
              </p>
            </div>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className="shrink-0 text-wtext-3 dark:text-wtext-4"
              aria-hidden="true"
            >
              <path
                d="M6 3l4 5-4 5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </section>

        {/* [2026-05-15 사용자 요청] Version Footer 영역 제거 (info 아이콘 + TEAMPLUS · v + 카피라이트). */}
      </main>
    </MobileContainer>
  );
}
