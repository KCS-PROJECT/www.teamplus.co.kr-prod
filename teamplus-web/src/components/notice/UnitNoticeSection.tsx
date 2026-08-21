'use client';

// 수업/대회 상세 최상단 공지 고정 블록 (밴드형 — 2026-08-20 사용자 확정).
//   히어로 직하에 "수업 공지/대회 공지" 전용 라벨 + 부제로 "이 단위의 공지"임을 명시.
//   고정(핀) 우선 정렬 · 접힘 2건 + 더보기 확장. 행 클릭 → /community-notice/[id] 상세.
//   공지 0건: 열람자는 블록 미렌더(공간 점유 0) · 관리자(canWrite)는 [공지 작성] 진입만 유지.
//   비열람자(미등록 학부모)는 서버가 빈 배열을 반환(목록 한정 — 404 은닉 예외)해
//   "공지 0건"과 동일하게 숨김 처리된다. 상세 등 id 지정 경로는 404 은닉 유지.

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { NavLink } from '@/components/ui/NavLink';
import { MESSAGES } from '@/lib/messages';
import { useRefreshSubscription, REFRESH_KEYS } from '@/lib/refresh-bus';
import {
  fetchUnitNotices,
  fetchUnitNoticeTargets,
  type UnitNoticePost,
} from '@/services/community-notice.service';

const COLLAPSED_COUNT = 2;

function stripHtml(html?: string): string {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

export function UnitNoticeSection({
  classId,
  tournamentId,
  canWrite = false,
}: {
  classId?: string;
  tournamentId?: string;
  /**
   * 작성 후보(역할 차원) — [Codex R1 H-05] 역할만으로는 비관할 감독·코치에게도
   * CTA 가 보이므로, true 여도 서버 `/community/targets`(관할 SoT)로 이 단위가
   * 관할인지 검증한 뒤에만 작성 진입을 노출한다.
   */
  canWrite?: boolean;
}) {
  const [posts, setPosts] = useState<UnitNoticePost[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [expanded, setExpanded] = useState(false);
  // 서버 검증된 작성 권한 — targets 응답에 이 단위가 있을 때만 true
  const [canWriteVerified, setCanWriteVerified] = useState(false);

  const load = useCallback(async () => {
    if (!classId && !tournamentId) {
      setState('error');
      return;
    }
    try {
      const res = await fetchUnitNotices({ classId, tournamentId, limit: 30 });
      if (res.success && res.data) {
        setPosts(res.data);
        setState('ready');
      } else {
        // [M-03] 비열람자는 서버가 빈 배열(200)이라 여기 도달 = 실제 오류 → 재시도 노출
        setState('error');
      }
    } catch {
      setState('error');
    }
  }, [classId, tournamentId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 작성/수정/삭제 후 즉시 갱신 (community-notice 화면들이 emitRefresh(UNIT_NOTICES))
  useRefreshSubscription(REFRESH_KEYS.UNIT_NOTICES, () => {
    void load();
  });

  // [H-05] 작성 권한 서버 검증 — 역할 후보일 때만 관할 픽커 목록과 대조
  useEffect(() => {
    if (!canWrite || (!classId && !tournamentId)) {
      setCanWriteVerified(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchUnitNoticeTargets();
        if (cancelled) return;
        const ok =
          !!res.success &&
          !!res.data &&
          (classId
            ? res.data.classes.some((c) => c.id === classId)
            : res.data.tournaments.some((t) => t.id === tournamentId));
        setCanWriteVerified(ok);
      } catch {
        if (!cancelled) setCanWriteVerified(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canWrite, classId, tournamentId]);

  if (state === 'loading') return null;
  if (state === 'error') {
    // 열람자에게 실제 오류를 숨기지 않는다 — compact 재시도 행 (M-03)
    return (
      <section
        className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-4"
        aria-label={MESSAGES.unitNotice.sectionTitle}
      >
        <div role="alert" className="flex items-center gap-2">
          <Icon
            name="error_outline"
            className="text-[16px] shrink-0 text-it-red-500 dark:text-it-red-300"
            aria-hidden="true"
          />
          <span className="flex-1 text-card-meta text-it-ink-500 dark:text-it-ink-300">
            {MESSAGES.unitNotice.loadFailed}
          </span>
          <button
            type="button"
            onClick={() => void load()}
            className="shrink-0 rounded-w-md text-card-meta font-bold text-it-blue-600 dark:text-it-blue-300 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
          >
            {MESSAGES.notice.loadRetry}
          </button>
        </div>
      </section>
    );
  }
  if (posts.length === 0 && !canWriteVerified) return null;

  const visible = expanded ? posts : posts.slice(0, COLLAPSED_COUNT);
  const isClassAxis = !!classId;
  const sectionTitle = isClassAxis
    ? MESSAGES.unitNotice.sectionTitleClass
    : MESSAGES.unitNotice.sectionTitleTournament;
  const sectionSubtitle = isClassAxis
    ? MESSAGES.unitNotice.sectionSubtitleClass
    : MESSAGES.unitNotice.sectionSubtitleTournament;
  const writeHref = classId
    ? `/community-notice/create?classId=${classId}`
    : `/community-notice/create?tournamentId=${tournamentId}`;

  return (
    <section
      className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 py-4"
      aria-label={sectionTitle}
    >
      {/* 헤더 — 호스트 상세 페이지 섹션 관례와 동일 (아이콘 없는 h2 15px extrabold ·
          우측 액션은 pill 버튼 대신 얇은 텍스트 링크 + chevron) */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-extrabold text-wtext-1 dark:text-white tracking-tight">
            {sectionTitle}
            {posts.length > 0 && (
              <span className="ml-1.5 text-[13px] font-extrabold font-num tabular-nums text-it-blue-500">
                {posts.length}
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-[12.5px] text-it-ink-400 dark:text-it-ink-300">
            {sectionSubtitle}
          </p>
        </div>
        {canWriteVerified && (
          <NavLink
            href={writeHref}
            className="shrink-0 inline-flex items-center gap-px rounded-w-md pt-0.5 text-[13px] font-semibold text-it-blue-600 dark:text-it-blue-300 whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
          >
            {MESSAGES.unitNotice.write}
            <Icon
              name="chevron_right"
              className="text-[16px] leading-none"
              aria-hidden="true"
            />
          </NavLink>
        )}
      </div>

      {posts.length === 0 ? (
        <p className="mt-3 py-4 text-center text-card-meta text-it-ink-400 dark:text-it-ink-300">
          {MESSAGES.unitNotice.emptyUnit}
        </p>
      ) : (
        <>
          <div className="mt-2 flex flex-col divide-y divide-it-line dark:divide-it-blue-900">
            {visible.map((post) => (
              <NoticeRow key={post.id} post={post} />
            ))}
          </div>
          {posts.length > COLLAPSED_COUNT && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-w-md py-2.5 text-[13.5px] font-bold text-it-blue-600 dark:text-it-blue-300 hover:bg-it-fill dark:hover:bg-it-blue-900/30 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
            >
              {expanded
                ? MESSAGES.unitNotice.collapse
                : MESSAGES.unitNotice.showMore(posts.length - COLLAPSED_COUNT)}
              <Icon
                name={expanded ? 'expand_less' : 'expand_more'}
                className="text-[16px]"
                aria-hidden="true"
              />
            </button>
          )}
        </>
      )}
    </section>
  );
}

function NoticeRow({ post }: { post: UnitNoticePost }) {
  const dateStr = new Date(post.createdAt).toLocaleDateString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
  });
  const preview = stripHtml(post.content).slice(0, 60);
  const unread = post.isReadByMe === false;

  return (
    <NavLink
      href={`/community-notice/${post.id}`}
      className="block py-3 active:bg-it-fill dark:active:bg-it-blue-900/30 transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-it-blue-500/40"
      aria-label={`${post.title}${unread ? ` · ${MESSAGES.unitNotice.unreadSuffixAria}` : ''} — ${MESSAGES.unitNotice.detailAria}`}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {post.isPinned && (
              <Icon
                name="push_pin"
                className="text-[13px] shrink-0 text-it-red-500 dark:text-it-red-300"
                aria-hidden="true"
              />
            )}
            {unread && (
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-w-pill bg-it-red-500"
                aria-label={MESSAGES.unitNotice.unreadDotAria}
              />
            )}
            <h3
              className={`min-w-0 flex-1 truncate text-[14.5px] ${unread ? 'font-extrabold' : 'font-bold'} text-it-ink-800 dark:text-white`}
            >
              {post.title}
            </h3>
            <span className="shrink-0 text-[12px] text-it-ink-400 dark:text-it-ink-300 tabular-nums">
              {dateStr}
            </span>
          </div>
          {preview && (
            <p className="mt-0.5 truncate text-[12.5px] text-it-ink-500 dark:text-it-ink-300">
              {preview}
            </p>
          )}
          {post.commentCount > 0 && (
            <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-it-ink-400 dark:text-it-ink-300">
              <Icon name="chat_bubble" className="text-[12px]" aria-hidden="true" />
              <span className="font-num tabular-nums">{post.commentCount}</span>
            </span>
          )}
        </div>
        {/* 상세 이동 시그니파이어 — 행 전체가 탭 가능함을 명시 */}
        <Icon
          name="chevron_right"
          className="shrink-0 text-[18px] text-it-ink-300 dark:text-it-ink-400"
          aria-hidden="true"
        />
      </div>
    </NavLink>
  );
}
