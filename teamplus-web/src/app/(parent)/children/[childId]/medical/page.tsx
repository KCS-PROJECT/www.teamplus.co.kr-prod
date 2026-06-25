'use client';

/**
 * ChildMedicalPage — 자녀별 의료·보험 정보
 *
 * Route: /children/:childId/medical
 * Entry: parent/children QuickActionsList "의료·보험 정보" 카드 클릭
 *
 * [신규 2026-05-18 W3.A]
 *   학부모 자녀 관리 페이지 (children/page.tsx) 의 "의료·보험 정보" 라우팅 대상.
 *   기존에는 라우팅만 존재하고 페이지가 없어 404 가 발생하던 회귀를 해결.
 *
 * 데이터 소스:
 *   - useChildren() — childId 매칭으로 자녀 정보 추출.
 *   - 의료/보험 상세 필드 (혈액형, 알레르기, 보험사, 보험번호, 응급연락처) 는 추후
 *     ChildApiItem 스키마 확장과 함께 추가. 현재는 정보 입력 안내(empty state) 위주.
 *
 * 디자인 규칙 (ICETIMES flat 2026-06-25):
 *   - MobileContainer + PageAppBar 단독 헤더 (이중 헤더 금지).
 *   - usePageReady — 자녀 fetch 완료 시 풀스크린 로더 hide.
 *   - bg-gradient/backdrop-blur/colored shadow 0 건 (AI slop 금지).
 *   - main = bg-it-canvas. 콘텐츠 = full-bleed 흰 섹션(bg-it-surface) + 8px 회색 갭,
 *     카드 박스(rounded·border·shadow) 제거 → hairline 행으로 구분.
 *   - 다크모드 dark: 변형 전 컴포넌트 적용.
 *   - 보호자 동의가 필요한 민감 정보임을 warning 배너로 강조.
 */

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { useChildren } from '@/hooks/useChildren';
import { useNativeUI } from '@/hooks/useNativeUI';
import { usePageReady } from '@/hooks/usePageReady';
import { PATHS } from '@/lib/paths';

interface InfoRowProps {
  icon: string;
  label: string;
  value: string | null;
}

function InfoRow({ icon, label, value }: InfoRowProps) {
  return (
    <div className="flex items-start gap-3 border-b border-it-line dark:border-it-blue-900 py-3.5 last:border-b-0">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-it-fill dark:bg-rink-900 border border-it-line dark:border-it-blue-900 text-it-ink-600 dark:text-wtext-4">
        <Icon name={icon} className="text-card-emphasis" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-card-meta font-bold text-it-ink-500 dark:text-wtext-4 tracking-[0.04em]">
          {label}
        </p>
        <p className="mt-0.5 text-card-body font-semibold text-it-ink-900 dark:text-white truncate">
          {value ?? '미등록'}
        </p>
      </div>
    </div>
  );
}

export default function ChildMedicalPage() {
  const params = useParams<{ childId: string }>();
  const childId = params?.childId ?? null;
  const { navigate } = useNavigation();
  const { children, isLoading } = useChildren();

  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const child = useMemo(
    () => (childId ? children.find((c) => c.id === childId) : null),
    [children, childId],
  );

  usePageReady(!isLoading);

  if (isLoading && children.length === 0) {
    return null;
  }

  return (
    <MobileContainer hasBottomNav>
      <PageAppBar title="의료·보험 정보" forceNative />

      <main
        className="flex-1 overflow-y-auto hide-scrollbar bg-it-canvas dark:bg-puck !pb-8"
        role="main"
        aria-label="자녀 의료 및 보험 정보"
      >
        {/* 자녀 헤더 — full-bleed 흰 섹션 (요약) */}
        {child && (
          <section className="bg-it-surface dark:bg-it-blue-950 px-5 pt-4 pb-4">
            <div className="flex items-center gap-3.5">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-[16px] bg-it-blue-50 dark:bg-it-blue-500/15 text-it-blue-600 dark:text-it-blue-300">
                <Icon name="person" className="text-2xl" aria-hidden="true" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-w-h3 font-extrabold text-it-ink-900 dark:text-white tracking-[-0.03em] leading-tight truncate">
                  {child.name}
                </p>
                <p className="mt-0.5 text-card-meta text-it-ink-500 dark:text-wtext-4">
                  {child.age ? `${child.age}세` : ''}
                  {child.club ? ` · ${child.club}` : ''}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* 보호자 동의 안내 배너 — warning 톤 (흰 섹션 내, 8px 회색 갭으로 분리) */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-4">
          <div
            className="flex items-start gap-3 rounded-[12px] border border-warning-500/40 bg-warning-500/10 px-4 py-3"
            role="alert"
          >
            <Icon
              name="shield"
              className="mt-0.5 shrink-0 text-card-emphasis text-warning-500"
              aria-hidden="true"
            />
            <div className="flex-1">
              <p className="text-card-body font-extrabold text-it-ink-900 dark:text-white">
                보호자 동의가 필요한 민감 정보입니다
              </p>
              <p className="mt-1 text-card-meta text-it-ink-500 dark:text-wtext-4 leading-relaxed">
                응급 상황 대응을 위해 정확한 정보 입력을 권장합니다.
                입력한 정보는 안전 책임자(코치·감독) 에게만 공개됩니다.
              </p>
            </div>
          </div>
        </section>

        {/* 의료 정보 — full-bleed 흰 섹션 + hairline 행 */}
        <section
          className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5"
          aria-label="의료 정보"
        >
          <header className="flex items-center gap-2 py-4 border-b border-it-line dark:border-it-blue-900">
            <span className="flex size-7 items-center justify-center rounded-w-md bg-it-blue-50 dark:bg-it-blue-900/30">
              <Icon name="medical_services" className="text-[16px] text-it-blue-500" aria-hidden="true" />
            </span>
            <h2 className="text-[17px] font-extrabold text-it-ink-800 dark:text-white tracking-[-0.02em]">
              의료 정보
            </h2>
          </header>

          <InfoRow icon="bloodtype" label="혈액형" value={null} />
          <InfoRow icon="warning" label="알레르기" value={null} />
          <InfoRow icon="medication" label="복용 중인 약" value={null} />
          <InfoRow icon="local_hospital" label="주치의·병원" value={null} />
        </section>

        {/* 보험 정보 — full-bleed 흰 섹션 + hairline 행 */}
        <section
          className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5"
          aria-label="보험 정보"
        >
          <header className="flex items-center gap-2 py-4 border-b border-it-line dark:border-it-blue-900">
            <span className="flex size-7 items-center justify-center rounded-w-md bg-it-blue-50 dark:bg-it-blue-900/30">
              <Icon name="health_and_safety" className="text-[16px] text-it-blue-500" aria-hidden="true" />
            </span>
            <h2 className="text-[17px] font-extrabold text-it-ink-800 dark:text-white tracking-[-0.02em]">
              보험 정보
            </h2>
          </header>

          <InfoRow icon="business" label="보험사" value={null} />
          <InfoRow icon="confirmation_number" label="증권 번호" value={null} />
          <InfoRow icon="event_repeat" label="가입·만료일" value={null} />
        </section>

        {/* 응급 연락처 — full-bleed 흰 섹션 + hairline 행 */}
        <section
          className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5"
          aria-label="응급 연락처"
        >
          <header className="flex items-center gap-2 py-4 border-b border-it-line dark:border-it-blue-900">
            <span className="flex size-7 items-center justify-center rounded-w-md bg-it-red-50 dark:bg-it-red-500/15">
              <Icon name="emergency" className="text-[16px] text-it-red-500" aria-hidden="true" />
            </span>
            <h2 className="text-[17px] font-extrabold text-it-ink-800 dark:text-white tracking-[-0.02em]">
              응급 연락처
            </h2>
          </header>

          <InfoRow icon="phone" label="1순위 연락처" value={null} />
          <InfoRow icon="phone_in_talk" label="2순위 연락처" value={null} />
          <InfoRow icon="family_restroom" label="관계" value={null} />
        </section>

        {/* 정보 등록 CTA — 흰 섹션 내 */}
        {child && (
          <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-4">
            <button
              type="button"
              onClick={() => navigate(PATHS.children.edit(child.id))}
              className="flex w-full items-center justify-center gap-2 rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 active:brightness-95 text-white px-5 py-4 transition-colors motion-reduce:transition-none"
            >
              <Icon name="edit" className="text-xl" aria-hidden="true" />
              <span className="text-card-title font-extrabold">정보 등록·수정</span>
            </button>
          </section>
        )}
      </main>
    </MobileContainer>
  );
}
