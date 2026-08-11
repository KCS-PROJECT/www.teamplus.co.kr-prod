'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { NavLink, useNavigation } from '@/components/ui/NavLink';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';
import { POLICY_FALLBACKS, normalizePolicyType } from '@/lib/legal/policy-content';

import { usePageReady } from '@/hooks/usePageReady';
import { useDefaultUI } from '@/hooks/useNativeUI';
/**
 * TermsPage - 약관 및 정책 (공통)
 * Route: /terms
 *
 * 데이터 소스: GET /api/v1/app/terms (AppTerms 모델)
 * - type: terms_of_service | privacy_policy | marketing | refund
 * - 어드민이 약관 버전을 수정하면 앱 업데이트 없이 즉시 반영
 * - PIPA 준수: 개인정보처리방침은 최신 버전이 즉시 노출되어야 함
 */

interface TermsItem {
  id: string;
  type: string; // terms_of_service | privacy_policy | marketing | refund
  title: string;
  content: string;
  version: string;
  isActive: boolean;
  publishedAt: string | null;
  updatedAt: string;
}

// 필수(법적) type — 표준형 기준.
// DB에 축약형('service'/'privacy'/'child')이 들어있는 레거시 데이터는
// policy-content.ts 의 normalizePolicyType() 이 표준형으로 흡수한다.
const REQUIRED_TYPES: readonly string[] = ['terms_of_service', 'privacy_policy'];

// type별 표시 메타데이터 — 키는 표준형만 사용 (조회 시 normalizePolicyType 경유)
const TYPE_META: Record<string, { label: string; required: boolean; order: number }> = {
  terms_of_service: { label: '서비스 이용약관', required: true, order: 1 },
  privacy_policy: { label: '개인정보 처리방침', required: true, order: 2 },
  child_privacy: { label: '자녀(만 14세 미만) 개인정보 처리방침', required: true, order: 3 },
  refund: { label: '환불 규정', required: false, order: 4 },
  community_guideline: { label: '커뮤니티 운영 규칙', required: false, order: 5 },
  marketing: { label: '마케팅 수신 동의', required: false, order: 6 },
};

function typeMeta(type: string) {
  return TYPE_META[normalizePolicyType(type)];
}

/**
 * 절대시각(ISO) → 'YYYY.MM.DD' (**한국시간 고정**).
 *
 * `publishedAt` 은 A군 절대시점이라 UTC 로 온다. 로컬 getter(`getFullYear` 등)를 쓰면
 * 브라우저 타임존에 따라 하루가 밀린다 — 시행일 `2026-07-29T15:00:00Z`(= KST 07-30 00:00)이
 * UTC 브라우저에서 "07.29" 로 보이는 식이다. +9h 시프트 후 UTC 파트를 읽어 KST 로 고정한다.
 */
function formatKstDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}.${String(kst.getUTCMonth() + 1).padStart(2, '0')}.${String(kst.getUTCDate()).padStart(2, '0')}`;
}

/**
 * 표시용 시행일 — DB 본문은 `publishedAt`, 코드 폴백은 `updatedAt`(시행일 문자열)을 쓴다.
 */
function effectiveDate(item: { publishedAt: string | null; updatedAt: string }): string {
  return formatKstDate(item.publishedAt ?? item.updatedAt);
}

export default function TermsPage() {
  const { back } = useNavigation();
  const [terms, setTerms] = useState<TermsItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  // [2026-05-13 이슈 D16] Flutter Native AppBar 끄고 Web PageAppBar(forceNative) 단일 노출.
  useDefaultUI();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 약관 로드 — 활성 레코드만 + DB 빈 항목은 정책 표준 fallback 으로 보완
  //
  // 정책 본문 fallback (POLICY_FALLBACKS):
  //   DB(AppTerms) 에 해당 type 이 등록돼 있지 않으면 코드의 정책 전문을 게시한다.
  //   (fallback 본문도 실제로 게시되어 효력을 갖는 정책이다 — lib/legal/policy-content.ts 참조)
  //   어드민에서 동일 type 으로 본문 등록 시 DB 본문이 자동 우선됨.
  //   레거시 축약형 type(service/privacy/child)은 normalizePolicyType 이 표준형으로 흡수한다.
  // 관련: docs/앱심사_1차런칭_미적용항목.xlsx L-01·L-05·L-11 등
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setLoadError(null);
      const res = await api.get<TermsItem[]>('/app/terms');
      if (cancelled) return;

      // DB 응답을 우선 사용하되, type 별로 등록 안 된 항목은 POLICY_FALLBACKS 로 채움
      let combined: TermsItem[] = [];
      if (res.success && Array.isArray(res.data)) {
        combined = res.data.filter((t) => t.isActive !== false);
      } else if (!res.success) {
        // API 실패 시에도 fallback 으로 정책 노출 — 앱 심사 통과(Apple Privacy URL) 보장
        // 단, 네트워크 오류는 사용자에게 안내
        setLoadError(res.error?.message ?? MESSAGES.error.network);
      }

      // 등록되지 않은 표준 type 을 fallback 으로 보완
      // 레거시 축약형(service/privacy/child)은 표준형으로 정규화해 중복 노출을 막는다.
      const existingTypes = new Set<string>(
        combined.map((t) => normalizePolicyType(t.type)),
      );

      POLICY_FALLBACKS.forEach((fallback) => {
        if (!existingTypes.has(fallback.type)) {
          combined.push({
            id: `fallback-${fallback.type}`,
            type: fallback.type,
            title: fallback.title,
            content: fallback.content,
            version: fallback.version,
            isActive: true,
            publishedAt: null,
            updatedAt: fallback.updatedAt,
          });
        }
      });

      // type 순서 정렬
      combined.sort((a, b) => {
        const orderA = typeMeta(a.type)?.order ?? 99;
        const orderB = typeMeta(b.type)?.order ?? 99;
        return orderA - orderB;
      });
      setTerms(combined);

      setIsLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // Deep-link: 전체메뉴(고객지원) 등에서 `/terms?section=<type>` 으로 진입하면
  //   해당 약관 항목을 자동으로 펼치고 위치로 스크롤한다. (로드 후 1회만 적용)
  //   useSearchParams 대신 location.search 직접 파싱 — Suspense 경계 불필요 (클라이언트 effect).
  const appliedSectionRef = useRef(false);
  useEffect(() => {
    if (appliedSectionRef.current || terms.length === 0) return;
    if (typeof window === 'undefined') return;
    const section = new URLSearchParams(window.location.search).get('section');
    if (!section) return;
    const target = normalizePolicyType(section);
    const match = terms.find((t) => normalizePolicyType(t.type) === target);
    if (!match) return;
    appliedSectionRef.current = true;
    setExpandedId(match.id);
    requestAnimationFrame(() => {
      document
        .getElementById(`terms-${match.id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [terms]);

  // 필수 약관 누락 경고 (PIPA 준수 모니터링)
  // 레거시 축약형도 표준형으로 정규화해 판정한다.
  const missingRequired = REQUIRED_TYPES.filter(
    (t) => !terms.some((item) => normalizePolicyType(item.type) === t),
  );

  return (
    <MobileContainer hasBottomNav={true} className="selectable-text">
      {/* [2026-05-13 이슈 D16] forceNative — App/Web 동일 AppBar. */}
      <PageAppBar title="약관 및 정책" forceNative />

      {/* Main Content — ICETIMES flat: 회색 캔버스 + 흰 섹션 */}
      <main className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck">
        {isLoading ? null : loadError ? (
          <section className="bg-it-surface dark:bg-rink-800 mt-2 flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-16 h-16 rounded-w-md bg-it-red-50 dark:bg-it-red-500/15 flex items-center justify-center mb-4">
              <Icon name="error_outline" className="text-3xl text-it-red-500" />
            </div>
            <p className="text-[15px] font-bold text-it-ink-800 dark:text-white mb-1">
              약관을 불러오지 못했어요
            </p>
            <p className="text-[13px] text-it-ink-500 dark:text-wtext-4 mb-4">{loadError}</p>
            <button
              onClick={() => window.location.reload()}
              className="h-10 px-5 rounded-w-md bg-it-blue-500 text-white text-[14px] font-bold hover:bg-it-blue-600 transition-colors motion-reduce:transition-none"
            >
              다시 시도하기
            </button>
          </section>
        ) : terms.length === 0 ? (
          <section className="bg-it-surface dark:bg-rink-800 mt-2 flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-16 h-16 rounded-w-md bg-it-fill dark:bg-rink-700 flex items-center justify-center mb-4">
              <Icon name="description" className="text-3xl text-it-ink-400 dark:text-wtext-4" />
            </div>
            <p className="text-[15px] font-bold text-it-ink-700 dark:text-wtext-4 mb-1">
              등록된 약관이 없습니다
            </p>
            <p className="text-[14px] text-it-ink-500 dark:text-wtext-4">관리자에게 문의해 주세요</p>
          </section>
        ) : (
          <>
            {/* PIPA 경고 배너 (개발자/운영자용) */}
            {missingRequired.length > 0 && process.env.NODE_ENV !== 'production' && (
              <div className="mx-4 mt-4 p-3 rounded-w-md bg-sun-100 dark:bg-sun-500/15 border border-sun-500/40">
                <div className="flex items-start gap-2">
                  <Icon name="warning" className="text-sun-500 text-card-emphasis shrink-0 mt-0.5" />
                  <div className="text-card-meta text-wtext-2 dark:text-sun-100">
                    <strong>운영 경고:</strong> 필수 약관 누락 —{' '}
                    {missingRequired
                      .map((t) => TYPE_META[t]?.label ?? t)
                      .join(', ')}
                  </div>
                </div>
              </div>
            )}

            {/* Intro — flat 흰 섹션 */}
            <section className="bg-it-surface dark:bg-rink-800 mt-2 px-5 pt-5 pb-4">
              <h2 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white mb-1">
                이용약관 및 정책
              </h2>
              <p className="text-[14px] text-it-ink-500 dark:text-wtext-4 leading-relaxed">
                서비스 이용에 관한 약관과 개인정보 처리방침을 확인해주세요.
              </p>
            </section>

            {/* flat 섹션 사이 8px 회색 갭 */}
            <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

            {/* Terms List — flat 흰 섹션 (카드 박스 제거 → hairline 행) */}
            <section className="bg-it-surface dark:bg-rink-800 px-5 pt-2 pb-3">
              <ul className="flex flex-col">
                {terms.map((item, idx) => {
                  const meta = typeMeta(item.type) ?? { label: item.title, required: false };
                  const isExpanded = expandedId === item.id;
                  const displayTitle = item.title || meta.label;
                  const isLast = idx === terms.length - 1;

                  return (
                    <li
                      key={item.id}
                      id={`terms-${item.id}`}
                      className={`scroll-mt-20 ${!isLast && !isExpanded ? 'border-b border-it-line dark:border-rink-700' : ''}`}
                    >
                      <button
                        type="button"
                        onClick={() => toggleExpand(item.id)}
                        aria-expanded={isExpanded}
                        aria-controls={`terms-panel-${item.id}`}
                        className="w-full min-h-[60px] py-4 flex items-center gap-3 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40 focus-visible:ring-inset"
                      >
                        <span
                          aria-hidden="true"
                          className={`shrink-0 inline-flex w-10 h-10 items-center justify-center rounded-w-md ${
                            meta.required
                              ? 'bg-it-blue-50 dark:bg-it-blue-900/40 text-it-blue-500'
                              : 'bg-it-fill dark:bg-rink-700 text-it-ink-400 dark:text-wtext-4'
                          }`}
                        >
                          <Icon name={meta.required ? 'gavel' : 'description'} className="text-[22px]" />
                        </span>
                        <div className="flex-1 text-left min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                            <h3 className="text-[15.5px] font-bold tracking-[-0.01em] text-it-ink-800 dark:text-white">
                              {displayTitle}
                            </h3>
                            {meta.required && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-w-md bg-it-red-50 dark:bg-it-red-500/20 text-it-red-500 dark:text-it-red-100">
                                필수
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-it-ink-500 dark:text-wtext-4 tabular-nums">
                            v{item.version} · {effectiveDate(item)} 시행
                          </p>
                        </div>
                        <span
                          aria-hidden="true"
                          className={`shrink-0 inline-flex w-8 h-8 items-center justify-center rounded-w-pill transition-all duration-200 motion-reduce:transition-none ${
                            isExpanded
                              ? 'bg-it-blue-50 dark:bg-it-blue-900/40 text-it-blue-500'
                              : 'bg-it-fill dark:bg-rink-700 text-it-ink-400 dark:text-wtext-4'
                          }`}
                        >
                          <Icon
                            name="expand_more"
                            className={`text-[22px] transition-transform duration-200 motion-reduce:transition-none ${
                              isExpanded ? 'rotate-180' : 'rotate-0'
                            }`}
                          />
                        </span>
                      </button>

                      {/* Expanded Content — 인셋 영역 */}
                      {isExpanded && (
                        <div
                          id={`terms-panel-${item.id}`}
                          role="region"
                          aria-label={`${displayTitle} 본문`}
                          className={`rounded-w-md overflow-hidden mb-4 ${!isLast ? 'border-b border-it-line dark:border-rink-700' : ''}`}
                        >
                          {/*
                            [2026-07-30] 기존 "표준 템플릿 기반 임시 안내 · 변호사 검토 완료 후 갱신"
                              사용자 노출 배너를 제거했다. fallback 본문은 DB 미등록 시 실제로 게시되어
                              효력을 갖는 정책 전문이므로, 이용자에게 "임시" 라고 안내하는 것은
                              약관의 구속력·명확성 측면에서 오히려 리스크였다.
                              (배너 제거 대신 운영자용 개발 환경 안내로 전환 — DB 등록 필요 여부 확인용)
                          */}
                          {item.id.startsWith('fallback-') &&
                            process.env.NODE_ENV !== 'production' && (
                              <div className="px-4 py-2.5 bg-sun-100/60 dark:bg-sun-500/15 border-b border-sun-500/30">
                                <div className="flex items-start gap-1.5">
                                  <Icon name="info" className="text-sun-500 text-card-emphasis shrink-0 mt-0.5" />
                                  <p className="text-card-meta text-wtext-2 dark:text-sun-100 leading-relaxed">
                                    <strong>운영 안내(개발 환경 전용):</strong> DB(AppTerms)에 이 type
                                    이 등록되지 않아 코드 내 정책 본문(POLICY_FALLBACKS)이 게시되고
                                    있습니다.
                                  </p>
                                </div>
                              </div>
                            )}
                          <div className="max-h-[60vh] overflow-y-auto p-4 bg-it-fill dark:bg-puck/30">
                            <pre className="text-[13px] text-it-ink-800 dark:text-wtext-2 leading-relaxed whitespace-pre-wrap font-sans">
                              {item.content}
                            </pre>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* Footer Contact — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-6 pb-8 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-w-md bg-it-blue-50 dark:bg-it-blue-900/40 flex items-center justify-center mb-3">
            <Icon name="support_agent" className="text-[28px] text-it-blue-500" aria-hidden="true" />
          </div>
          <h3 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white mb-1">
            약관 관련 문의사항이 있으신가요?
          </h3>
          <p className="text-[13px] text-it-ink-500 dark:text-wtext-4 mb-4">
            피드백으로 의견을 보내주세요.
          </p>
          <NavLink
            href="/feedback"
            className="inline-flex items-center justify-center gap-1.5 h-12 px-6 rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 text-white text-[15px] font-bold active:brightness-95 transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
          >
            <Icon name="feedback" className="text-[18px]" aria-hidden="true" />
            피드백 보내기
          </NavLink>
        </section>
      </main>
    </MobileContainer>
  );
}
