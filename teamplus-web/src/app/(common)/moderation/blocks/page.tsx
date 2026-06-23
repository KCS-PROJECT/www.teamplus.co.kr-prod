'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState, useCallback } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { api } from '@/services/api-client';
import { useToast } from '@/components/ui/Toast';
import { useModal } from '@/components/ui/Modal';
import { MESSAGES } from '@/lib/messages';

import { usePageReady } from '@/hooks/usePageReady';
/**
 * BlockListPage - 내 차단 목록 관리
 * Route: /moderation/blocks
 *
 * 데이터: GET /api/v1/users/me/blocks
 * 해제: DELETE /api/v1/users/me/blocks/:blockedId
 */

interface BlockedUser {
  blockedUserId: string;
  name: string;
  userType: string;
  blockedAt: string;
}

function getRoleLabel(userType: string): string {
  const map: Record<string, string> = {
    PARENT: '학부모',
    COACH: '코치',
    TEEN: '학생',
    CHILD: '어린이',
    ADMIN: '관리자',
    DIRECTOR: '감독',
  };
  return map[userType] ?? '회원';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function BlockListPage() {
  // 공통 AppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });


  const { toast } = useToast();
  const { modal } = useModal();
  const [blocks, setBlocks] = useState<BlockedUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);

  const load = useCallback(async () => {
    setIsLoading(true);
    const res = await api.get<{ items: BlockedUser[]; total: number; page: number; limit: number; totalPages: number }>(
      '/users/me/blocks',
    );
    if (res.success && res.data) {
      setBlocks(res.data.items ?? []);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUnblock = useCallback(
    async (block: BlockedUser) => {
      const confirmed = await modal.confirm({
        title: '차단 해제',
        message: `${block.name}님을 차단 해제하시겠습니까?`,
        confirmText: '해제',
        cancelText: '취소',
      });
      if (!confirmed) return;
      const res = await api.delete(`/users/me/blocks/${block.blockedUserId}`);
      if (res.success) {
        toast.success(MESSAGES.moderation.unblocked);
        setBlocks((prev) => prev.filter((b) => b.blockedUserId !== block.blockedUserId));
      } else {
        toast.error(MESSAGES.moderation.unblockFailed);
      }
    },
    [modal, toast],
  );

  return (
    <MobileContainer hasBottomNav={false}>
      {/* [수정 2026-05-14 D5] Flutter WebView(isNative=true) 환경에서 forceNative 미지정 시
          PageAppBar 가 null 반환 + useNativeUI({ showAppBar: false }) 로 Native AppBar 도
          미렌더링 → 앱 기준 상단바 미표시 회귀. notifications/feedback 페이지와 동일하게
          forceNative 로 Web AppBar 를 강제 렌더한다. */}
      <PageAppBar title="차단 목록" forceNative />

      <main className="flex-1 overflow-y-auto px-5 py-6">
        {isLoading ? null : blocks.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-16 h-16 rounded-w-pill bg-wline-2 dark:bg-rink-800 flex items-center justify-center mx-auto mb-4">
              <Icon name="block" className="text-3xl text-wtext-4 dark:text-rink-500" />
            </div>
            <p className="text-w-small font-medium text-wtext-2 dark:text-rink-100 mb-1">
              차단한 사용자가 없습니다
            </p>
            <p className="text-w-caption text-wtext-3">
              부적절한 사용자는 프로필에서 차단할 수 있어요
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {blocks.map((block) => (
              <li
                key={block.blockedUserId}
                className="p-4 rounded-xl bg-white dark:bg-rink-800 border border-wline-2 dark:border-rink-700 flex items-center gap-3"
              >
                <div className="w-12 h-12 rounded-w-pill bg-wline-2 dark:bg-rink-700 flex items-center justify-center">
                  <Icon name="person" className="text-2xl text-wtext-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-w-small font-bold text-wtext-1 dark:text-white">
                      {block.name}
                    </p>
                    <span className="text-w-caption font-semibold px-2 py-0.5 rounded bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-100">
                      {getRoleLabel(block.userType)}
                    </span>
                  </div>
                  <p className="text-w-caption text-wtext-3">
                    차단일 {formatDate(block.blockedAt)}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleUnblock(block)}
                >
                  해제
                </Button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </MobileContainer>
  );
}
