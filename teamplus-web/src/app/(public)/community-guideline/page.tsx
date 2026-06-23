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

      <main className="flex-1 overflow-y-auto">
        {/* Intro */}
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-card-title font-bold text-wtext-1 dark:text-white mb-1">
            커뮤니티 운영 규칙
          </h2>
          <p className="text-card-body text-wtext-3 dark:text-rink-300 leading-relaxed">
            TEAMPLUS 회원 모두가 안전하고 즐겁게 이용할 수 있도록 다음 규칙을 준수해 주세요.
          </p>
        </div>

        {/* 운영 규칙 본문 */}
        <div className="px-4 pb-4">
          <div className="rounded-w-xl bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 shadow-sh-1 overflow-hidden">
            <div className="px-4 py-3 bg-ice-500/5 dark:bg-ice-500/10 border-b border-wline dark:border-rink-700 flex items-center gap-2">
              <Icon name="forum" className="text-ice-500 text-card-emphasis" />
              <span className="text-card-body font-semibold text-wtext-1 dark:text-white">
                TEAMPLUS 커뮤니티 가이드라인
              </span>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-4 bg-wbg/40 dark:bg-rink-900/20">
              <pre className="text-[13px] text-wtext-2 dark:text-rink-100 leading-relaxed whitespace-pre-wrap font-sans">
                {COMMUNITY_GUIDELINE}
              </pre>
            </div>
          </div>
        </div>

        {/* 핵심 안내 */}
        <div className="px-4 pb-4 space-y-3">
          <div className="rounded-w-xl bg-flame-100/40 dark:bg-flame-500/10 border border-flame-500/30 p-4">
            <div className="flex items-start gap-2.5">
              <Icon name="report" className="text-flame-500 text-card-emphasis shrink-0 mt-0.5" />
              <div>
                <h3 className="text-card-body font-bold text-wtext-1 dark:text-white mb-1">
                  부적절한 콘텐츠를 발견하셨나요?
                </h3>
                <p className="text-card-meta text-wtext-3 dark:text-rink-300 leading-relaxed">
                  게시물·댓글·메시지의 우측 상단 메뉴에서 <strong className="text-flame-500">신고하기</strong>를 통해 즉시 알려주세요. 24시간 내 검토합니다.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-w-xl bg-ice-500/5 dark:bg-ice-500/10 border border-ice-500/30 p-4">
            <div className="flex items-start gap-2.5">
              <Icon name="block" className="text-ice-500 text-card-emphasis shrink-0 mt-0.5" />
              <div>
                <h3 className="text-card-body font-bold text-wtext-1 dark:text-white mb-1">
                  특정 회원과 분리하고 싶으신가요?
                </h3>
                <p className="text-card-meta text-wtext-3 dark:text-rink-300 leading-relaxed">
                  <strong className="text-ice-500">차단 기능</strong>으로 해당 회원의 게시물·메시지를 더 이상 보지 않을 수 있습니다.
                </p>
              </div>
            </div>
          </div>

          {/* 자녀 보호 강조 */}
          <div className="rounded-w-xl bg-mint-500/5 dark:bg-mint-500/10 border border-mint-500/30 p-4">
            <div className="flex items-start gap-2.5">
              <Icon name="shield" className="text-mint-500 text-card-emphasis shrink-0 mt-0.5" />
              <div>
                <h3 className="text-card-body font-bold text-wtext-1 dark:text-white mb-1">
                  자녀 보호 — 모든 회원의 책임
                </h3>
                <p className="text-card-meta text-wtext-3 dark:text-rink-300 leading-relaxed">
                  TEAMPLUS 는 유소년 회원이 활동하는 커뮤니티입니다. 미성년자의 사진·영상은 본인·학부모의 명시적 동의 없이 게시할 수 없습니다.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 문의 카드 */}
        <div className="px-4 pt-2 pb-8">
          <div className="rounded-w-xl bg-wsurface dark:bg-rink-800 border border-wline dark:border-rink-700 shadow-sh-1 p-5 text-center">
            <div className="w-12 h-12 rounded-w-xl bg-ice-500/10 dark:bg-ice-500/20 flex items-center justify-center mx-auto mb-3">
              <Icon
                name="support_agent"
                className="text-[28px] text-ice-500 dark:text-ice-300"
                aria-hidden="true"
              />
            </div>
            <h3 className="text-card-title font-bold text-wtext-1 dark:text-white mb-1">
              조치에 이의가 있으신가요?
            </h3>
            <p className="text-card-meta text-wtext-3 dark:text-rink-300 mb-3">
              {COMPANY_INFO.csEmail} 로 신청하시면 7일 이내 검토 후 회신 드립니다.
            </p>
            <p className="text-[11px] text-wtext-4 dark:text-rink-300">
              고객센터 {COMPANY_INFO.csPhone} ({COMPANY_INFO.csHours})
            </p>
          </div>
        </div>
      </main>
    </MobileContainer>
  );
}
