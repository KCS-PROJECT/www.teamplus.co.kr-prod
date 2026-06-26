'use client';

import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { COMPANY_INFO } from '@/lib/legal/policy-content';
import { usePageReady } from '@/hooks/usePageReady';
import { useDefaultUI } from '@/hooks/useNativeUI';

/**
 * 계정 및 데이터 삭제 안내 페이지 (T-XX)
 * Route: /account-deletion  (공개 — 비로그인 접근 가능)
 *
 * Google Play 데이터 보안(Data Safety) "계정·데이터 삭제 요청 URL" 대응.
 *  - 공개 URL: https://teamplusweb.icetimes.co.kr/account-deletion
 *  - 앱 설치/로그인 없이도 접근 가능해야 하므로 (public) 그룹에 배치.
 *  - 앱 내 직접 삭제(설정>개인정보>회원 탈퇴) + 고객센터 요청 2경로 안내.
 *
 * 본 페이지는 공개 페이지이므로 비로그인 상태에서도 접근 가능.
 * 콘텐츠는 DB fetch 없이 자체완결(SSR HTML 즉시 포함).
 */
export default function AccountDeletionPage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  useDefaultUI();

  const mailHref = `mailto:${COMPANY_INFO.csEmail}?subject=${encodeURIComponent(
    '계정 삭제 요청 (TEAMPLUS)',
  )}`;
  const telHref = `tel:${COMPANY_INFO.csPhone.replace(/[^0-9]/g, '')}`;

  return (
    <MobileContainer hasBottomNav className="selectable-text">
      <PageAppBar title="계정 및 데이터 삭제" forceNative />

      <main className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck">
        {/* Intro + 방법 안내 — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 mt-2 px-5 pt-5 pb-5 space-y-5">
          <div>
            <h2 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white mb-1">
              계정 및 데이터 삭제 안내
            </h2>
            <p className="text-[14px] text-it-ink-500 dark:text-wtext-4 leading-relaxed">
              TEAMPLUS 계정과 개인정보의 삭제를 요청하는 방법을 안내합니다. 아래 두 가지 방법 중
              편한 방법으로 신청하실 수 있습니다.
            </p>
          </div>

          {/* 방법 1 — 앱에서 직접 삭제 */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Icon name="smartphone" className="text-it-blue-500 text-card-emphasis" aria-hidden="true" />
              <h3 className="text-[15px] font-bold text-it-ink-800 dark:text-white">
                방법 1. 앱에서 직접 삭제 (로그인 가능 시)
              </h3>
            </div>
            <ol className="space-y-2.5">
              {[
                'TEAMPLUS 앱 실행 후 로그인',
                '설정 > 개인정보 > 회원 탈퇴 이동',
                "본인 확인(비밀번호 입력 · 소셜 로그인 계정은 '탈퇴합니다' 입력)",
                '탈퇴 신청 완료',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-it-blue-50 dark:bg-it-blue-900/40 text-it-blue-500 text-[11px] font-bold tabular-nums">
                    {i + 1}
                  </span>
                  <span className="text-[13px] text-it-ink-800 dark:text-wtext-2 leading-relaxed">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* 방법 2 — 고객센터 요청 */}
          <div className="pt-1 border-t border-it-line dark:border-rink-700">
            <div className="flex items-center gap-2 mb-3 mt-4">
              <Icon name="support_agent" className="text-it-blue-500 text-card-emphasis" aria-hidden="true" />
              <h3 className="text-[15px] font-bold text-it-ink-800 dark:text-white">
                방법 2. 고객센터로 요청 (앱 접근이 어려운 경우)
              </h3>
            </div>
            <p className="text-[13px] text-it-ink-500 dark:text-wtext-4 leading-relaxed mb-3">
              아래 이메일 또는 전화로 “계정 삭제”를 요청해 주세요. 본인 확인 후 처리해 드립니다.
            </p>
            <div className="space-y-2">
              <a
                href={mailHref}
                className="flex items-center gap-2.5 rounded-w-md bg-it-fill dark:bg-puck/30 border border-it-line-strong dark:border-rink-700 px-4 py-3"
              >
                <Icon name="mail" className="text-it-blue-500 text-card-emphasis" aria-hidden="true" />
                <span className="text-[14px] font-semibold text-it-ink-800 dark:text-white">
                  {COMPANY_INFO.csEmail}
                </span>
              </a>
              <a
                href={telHref}
                className="flex items-center gap-2.5 rounded-w-md bg-it-fill dark:bg-puck/30 border border-it-line-strong dark:border-rink-700 px-4 py-3"
              >
                <Icon name="call" className="text-it-blue-500 text-card-emphasis" aria-hidden="true" />
                <span className="text-[14px] font-semibold text-it-ink-800 dark:text-white">
                  {COMPANY_INFO.csPhone}
                </span>
              </a>
            </div>
            <p className="mt-2 text-[11px] text-it-ink-400 dark:text-wtext-4">
              운영시간 {COMPANY_INFO.csHours}
            </p>
          </div>

          {/* 삭제되는 데이터 / 보존 예외 */}
          <div className="rounded-w-md bg-it-blue-50 dark:bg-it-blue-900/20 border border-it-blue-500/20 p-4">
            <div className="flex items-start gap-2.5">
              <Icon name="delete_sweep" className="text-it-blue-500 text-card-emphasis shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h3 className="text-[14px] font-bold text-it-ink-800 dark:text-white mb-1">
                  삭제되는 데이터와 처리 절차
                </h3>
                <ul className="text-[13px] text-it-ink-500 dark:text-wtext-4 leading-relaxed list-disc pl-4 space-y-1">
                  <li>계정·프로필·연락처 등 개인정보는 비식별화 처리되어 복구할 수 없습니다.</li>
                  <li>
                    탈퇴 신청 후 <strong className="text-it-blue-500">7일의 유예 기간</strong>이 있으며,
                    유예 기간 경과 시 지체 없이 삭제(비식별화)됩니다.
                  </li>
                  <li>보유 중인 잔여 결제권은 삭제 확정 시 소멸되며 복구되지 않습니다.</li>
                  <li>
                    단, 결제·전자상거래 기록은 전자상거래법 등 관련 법령에 따라 일정 기간(최대 5년)
                    보관 후 파기됩니다.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 운영 법인 — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-8 text-center">
          <p className="text-[13px] text-it-ink-500 dark:text-wtext-4">
            본 서비스는 <strong className="text-it-ink-800 dark:text-white">{COMPANY_INFO.name}</strong>
            가 운영합니다.
          </p>
          <p className="mt-1 text-[11px] text-it-ink-400 dark:text-wtext-4">
            사업자등록번호 {COMPANY_INFO.businessNumber}
          </p>
        </section>
      </main>
    </MobileContainer>
  );
}
