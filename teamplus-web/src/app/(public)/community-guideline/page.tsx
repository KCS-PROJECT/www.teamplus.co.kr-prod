'use client';

import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { COMMUNITY_GUIDELINE, COMPANY_INFO } from '@/lib/legal/policy-content';
import { usePageReady } from '@/hooks/usePageReady';
import { useDefaultUI } from '@/hooks/useNativeUI';

/**
 * 커뮤니티 운영 규칙 페이지 (T-09)
 * Route: /community-guideline
 *
 * Apple App Review 1.2 User-Generated Content (UGC) / Google Play UGC Policy 준수
 *  - 커뮤니티/갤러리/채팅 등 UGC 영역의 운영 규칙
 *  - 신고·차단 기능과 함께 앱 심사 시 검토 대상
 *
 * 본 페이지는 공개 페이지이므로 비로그인 상태에서도 접근 가능.
 * 처리방침과 마찬가지로 푸터/메뉴/약관 페이지에서 연결.
 */
export default function CommunityGuidelinePage() {
  usePageReady(true); // 정적 페이지 — 마운트 즉시 ready
  // [2026-05-26 Track D B10] Flutter Native AppBar 끄고 Web PageAppBar(forceNative) 단일 노출
  //   (/faq · /terms 와 동일 패턴). 미적용 시 Native(WebView)에서 상단바가 미표시된다.
  useDefaultUI();
  return (
    <MobileContainer hasBottomNav className="selectable-text">
      <PageAppBar title="커뮤니티 운영 규칙" forceNative />

      <main className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck">
        {/* Intro + 운영 규칙 본문 — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 mt-2 px-5 pt-5 pb-5">
          <h2 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white mb-1">
            커뮤니티 운영 규칙
          </h2>
          <p className="text-[14px] text-it-ink-500 dark:text-wtext-4 leading-relaxed mb-4">
            TEAMPLUS 회원 모두가 안전하고 즐겁게 이용할 수 있도록 다음 규칙을 준수해 주세요.
          </p>

          <div className="flex items-center gap-2 pb-2 border-b border-it-line dark:border-rink-700">
            <Icon name="forum" className="text-it-blue-500 text-card-emphasis" aria-hidden="true" />
            <span className="text-[15px] font-bold text-it-ink-800 dark:text-white">
              TEAMPLUS 커뮤니티 가이드라인
            </span>
          </div>
          <div className="max-h-[70vh] overflow-y-auto pt-4 bg-it-fill dark:bg-puck/30 rounded-w-md mt-3 p-4">
            <pre className="text-[13px] text-it-ink-800 dark:text-wtext-2 leading-relaxed whitespace-pre-wrap font-sans">
              {COMMUNITY_GUIDELINE}
            </pre>
          </div>
        </section>

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 핵심 안내 — flat 흰 섹션 (인셋 행으로 쌓음) */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-5 space-y-3">
          <div className="rounded-w-md bg-it-red-50 dark:bg-it-red-500/10 border border-it-red-500/20 p-4">
            <div className="flex items-start gap-2.5">
              <Icon name="report" className="text-it-red-500 text-card-emphasis shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h3 className="text-[14px] font-bold text-it-ink-800 dark:text-white mb-1">
                  부적절한 콘텐츠를 발견하셨나요?
                </h3>
                <p className="text-[13px] text-it-ink-500 dark:text-wtext-4 leading-relaxed">
                  게시물·댓글·메시지의 우측 상단 메뉴에서 <strong className="text-it-red-500">신고하기</strong>를 통해 즉시 알려주세요. 24시간 내 검토합니다.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-w-md bg-it-blue-50 dark:bg-it-blue-900/20 border border-it-blue-500/20 p-4">
            <div className="flex items-start gap-2.5">
              <Icon name="block" className="text-it-blue-500 text-card-emphasis shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h3 className="text-[14px] font-bold text-it-ink-800 dark:text-white mb-1">
                  특정 회원과 분리하고 싶으신가요?
                </h3>
                <p className="text-[13px] text-it-ink-500 dark:text-wtext-4 leading-relaxed">
                  <strong className="text-it-blue-500">차단 기능</strong>으로 해당 회원의 게시물·메시지를 더 이상 보지 않을 수 있습니다.
                </p>
              </div>
            </div>
          </div>

          {/* 자녀 보호 강조 */}
          <div className="rounded-w-md bg-it-fill dark:bg-puck/30 border border-it-line-strong dark:border-rink-700 p-4">
            <div className="flex items-start gap-2.5">
              <Icon name="shield" className="text-it-blue-500 text-card-emphasis shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h3 className="text-[14px] font-bold text-it-ink-800 dark:text-white mb-1">
                  자녀 보호 — 모든 회원의 책임
                </h3>
                <p className="text-[13px] text-it-ink-500 dark:text-wtext-4 leading-relaxed">
                  TEAMPLUS 는 유소년 회원이 활동하는 커뮤니티입니다. 미성년자의 사진·영상은 본인·학부모의 명시적 동의 없이 게시할 수 없습니다.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* flat 섹션 사이 8px 회색 갭 */}
        <div className="h-2 bg-it-canvas dark:bg-puck" aria-hidden="true" />

        {/* 문의 — flat 흰 섹션 */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-6 pb-8 text-center">
          <div className="w-12 h-12 rounded-w-md bg-it-blue-50 dark:bg-it-blue-900/40 flex items-center justify-center mx-auto mb-3">
            <Icon
              name="support_agent"
              className="text-[28px] text-it-blue-500"
              aria-hidden="true"
            />
          </div>
          <h3 className="text-[17px] font-extrabold tracking-[-0.02em] text-it-ink-800 dark:text-white mb-1">
            조치에 이의가 있으신가요?
          </h3>
          <p className="text-[13px] text-it-ink-500 dark:text-wtext-4 mb-3">
            {COMPANY_INFO.csEmail} 로 신청하시면 7일 이내 검토 후 회신 드립니다.
          </p>
          <p className="text-[11px] text-it-ink-400 dark:text-wtext-4">
            고객센터 {COMPANY_INFO.csPhone} ({COMPANY_INFO.csHours})
          </p>
        </section>
      </main>
    </MobileContainer>
  );
}
