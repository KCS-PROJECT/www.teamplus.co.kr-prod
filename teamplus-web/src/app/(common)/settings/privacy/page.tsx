'use client';

import { useEffect, useState, useCallback } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { api } from '@/services/api-client';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/lib/messages';
import { useNativeUI } from '@/hooks/useNativeUI';

import { usePageReady } from '@/hooks/usePageReady';
/**
 * PrivacyPage - 개인정보 다운로드 (PIPA §35)
 * Route: /settings/privacy
 *
 * API:
 *  POST /api/v1/users/me/data-export         — 요청 생성 (30일 1회)
 *  GET  /api/v1/users/me/data-export/status  — 상태 조회
 *  GET  /api/v1/users/me/data-export/:id/download — JSON 다운로드
 */

interface ExportStatus {
  hasRequest: boolean;
  id?: string;
  status?: 'processing' | 'ready' | 'failed' | 'expired' | 'pending';
  fileSize?: number | null;
  requestedAt?: string;
  readyAt?: string | null;
  expiresAt?: string | null;
  errorMessage?: string | null;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${day} ${h}:${min}`;
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  pending: { text: '대기 중', color: 'text-wtext-3' },
  processing: { text: '수집 중...', color: 'text-ice-600 dark:text-ice-400' },
  ready: { text: '다운로드 준비 완료', color: 'text-emerald-600 dark:text-emerald-400' },
  failed: { text: '처리 실패', color: 'text-red-600 dark:text-red-400' },
  expired: { text: '만료됨', color: 'text-wtext-4' },
};

export default function PrivacyPage() {
  const { toast } = useToast();
  const [exportStatus, setExportStatus] = useState<ExportStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // 네이티브 AppBar 끄고 공통 컴포넌트 PageAppBar(forceNative) 사용
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });

  const loadStatus = useCallback(async () => {
    const res = await api.get<ExportStatus>('/users/me/data-export/status');
    if (res.success && res.data) {
      setExportStatus(res.data);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // processing 중이면 5초마다 폴링
  useEffect(() => {
    if (exportStatus?.status !== 'processing' && exportStatus?.status !== 'pending') return;
    const timer = setTimeout(() => void loadStatus(), 5000);
    return () => clearTimeout(timer);
  }, [exportStatus?.status, loadStatus]);

  const handleRequest = useCallback(async () => {
    setIsRequesting(true);
    const res = await api.post<{ id: string; status: string; expiresAt: string }>(
      '/users/me/data-export',
    );
    setIsRequesting(false);
    if (res.success && res.data) {
      toast.success(MESSAGES.privacy.collectionStarted);
      setExportStatus({
        hasRequest: true,
        id: res.data.id,
        status: 'processing',
        requestedAt: new Date().toISOString(),
        expiresAt: res.data.expiresAt,
      });
    } else {
      toast.error(res.error?.message ?? '요청에 실패했습니다.');
    }
  }, [toast]);

  const handleDownload = useCallback(async () => {
    if (!exportStatus?.id) return;
    setIsDownloading(true);
    // 백엔드가 Content-Disposition attachment를 반환하므로 window.open 방식 사용
    try {
      const res = await api.get<Blob>(
        `/users/me/data-export/${exportStatus.id}/download`,
        { responseType: 'blob' } as Record<string, unknown>,
      );
      if (res.success && res.data) {
        const blob = new Blob([res.data as unknown as BlobPart], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `teamplus_personal_data_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast.success(MESSAGES.privacy.downloadStarted);
      } else {
        toast.error(res.error?.message ?? '다운로드에 실패했습니다.');
      }
    } catch {
      toast.error(MESSAGES.privacy.downloadFailed);
    }
    setIsDownloading(false);
  }, [exportStatus?.id, toast]);

  const statusInfo = exportStatus?.status ? STATUS_LABEL[exportStatus.status] : null;

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar title="개인정보 관리" showBack forceNative />

      <main className="flex-1 overflow-y-auto px-5 py-6 space-y-6 bg-wbg dark:bg-puck">
        {/* 안내 섹션 */}
        <section className="p-4 rounded-w-lg bg-ice-50 dark:bg-ice-500/10 border border-ice-100 dark:border-ice-500/20">
          <div className="flex items-start gap-3">
            <Icon name="info" className="text-ice-600 dark:text-ice-400 text-xl mt-0.5 shrink-0" />
            <div>
              <p className="text-w-small font-bold text-ice-700 dark:text-ice-200 mb-1">
                개인정보 열람권 (PIPA §35)
              </p>
              <p className="text-w-caption text-ice-600 dark:text-ice-300 leading-relaxed">
                정보통신망법에 따라 본인의 개인정보를 JSON 파일로 다운로드할 수 있습니다.
                수집 항목: 프로필, 출석 이력(2년), 결제권 내역, 수업 등록, 알림 이력(90일), 로그인 기록(1년).
                <br />
                <span className="font-semibold">30일에 1회 요청 가능 · 다운로드 링크 7일 유효</span>
              </p>
            </div>
          </div>
        </section>

        {/* 내보내기 상태 */}
        <section>
          <h2 className="text-w-small font-bold text-wtext-4 dark:text-rink-400 tracking-wider uppercase mb-3">
            개인정보 내보내기
          </h2>

          {!isLoading && (
            <div className="p-4 rounded-w-lg bg-wsurface dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sh-1 space-y-4">
              {/* 최신 요청 상태 */}
              {exportStatus?.hasRequest && exportStatus.status ? (
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 flex items-center justify-center rounded-w-pill bg-wbg dark:bg-rink-700">
                    <Icon
                      name={
                        exportStatus.status === 'ready'
                          ? 'check_circle'
                          : exportStatus.status === 'failed'
                          ? 'error'
                          : exportStatus.status === 'expired'
                          ? 'timer_off'
                          : 'hourglass_empty'
                      }
                      className={`text-[24px] ${statusInfo?.color ?? 'text-wtext-4'}`}
                    />
                  </div>
                  <div className="flex-1">
                    <p className={`text-w-small font-bold ${statusInfo?.color ?? 'text-wtext-3'}`}>
                      {statusInfo?.text ?? '알 수 없음'}
                    </p>
                    <p className="text-w-caption text-wtext-3 dark:text-rink-300">
                      요청일: {formatDate(exportStatus.requestedAt)}
                      {exportStatus.readyAt ? ` · 완료: ${formatDate(exportStatus.readyAt)}` : ''}
                    </p>
                    {exportStatus.expiresAt && exportStatus.status === 'ready' && (
                      <p className="text-w-caption text-wtext-4 mt-0.5">
                        만료: {formatDate(exportStatus.expiresAt)}
                        {exportStatus.fileSize ? ` · ${formatBytes(exportStatus.fileSize)}` : ''}
                      </p>
                    )}
                    {exportStatus.status === 'processing' && (
                      <p className="text-w-caption text-ice-500 mt-1 flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-w-pill bg-ice-500 animate-pulse motion-reduce:animate-none" />
                        데이터 수집 중... 잠시만 기다려 주세요
                      </p>
                    )}
                    {exportStatus.errorMessage && (
                      <p className="text-w-caption text-red-500 mt-0.5">{exportStatus.errorMessage}</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-w-small text-wtext-3 dark:text-rink-300">
                  아직 요청 내역이 없습니다.
                </p>
              )}

              {/* 액션 버튼 */}
              <div className="flex gap-2">
                {exportStatus?.status === 'ready' && exportStatus.id ? (
                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => void handleDownload()}
                    disabled={isDownloading}
                    type="button"
                    className="flex-1"
                  >
                    <Icon name="download" className="text-w-body-lg mr-1" />
                    {isDownloading ? '다운로드 중...' : 'JSON 파일 다운로드'}
                  </Button>
                ) : null}

                {(!exportStatus?.hasRequest ||
                  exportStatus.status === 'failed' ||
                  exportStatus.status === 'expired') && (
                  <Button
                    variant={exportStatus?.status === 'failed' ? 'secondary' : 'primary'}
                    size="md"
                    onClick={() => void handleRequest()}
                    disabled={isRequesting}
                    type="button"
                    className="flex-1"
                  >
                    <Icon name="download_for_offline" className="text-w-body-lg mr-1" />
                    {isRequesting ? '요청 중...' : '내보내기 요청'}
                  </Button>
                )}

                {(exportStatus?.status === 'processing' || exportStatus?.status === 'pending') && (
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => void loadStatus()}
                    type="button"
                    className="flex-1"
                  >
                    <Icon name="refresh" className="text-w-body-lg mr-1" />
                    상태 새로고침
                  </Button>
                )}
              </div>
            </div>
          )}
        </section>

        {/* 개인정보 수집·이용 안내 */}
        <section>
          <h2 className="text-w-small font-bold text-wtext-4 dark:text-rink-400 tracking-wider uppercase mb-3">
            수집 항목 안내
          </h2>
          <div className="space-y-2">
            {[
              { icon: 'person', label: '프로필 정보', desc: '이름, 이메일, 전화번호, 생년월일' },
              { icon: 'event_available', label: '출석 이력', desc: '최근 2년' },
              { icon: 'toll', label: '결제권 내역', desc: '전체 거래 이력' },
              { icon: 'school', label: '수업 등록', desc: '신청·취소 이력' },
              { icon: 'notifications', label: '알림 이력', desc: '최근 90일' },
              { icon: 'login', label: '로그인 기록', desc: '최근 1년' },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 px-4 py-3 rounded-w-lg bg-wsurface dark:bg-rink-800 border border-wline-2 dark:border-rink-700 shadow-sh-1"
              >
                <Icon name={item.icon} className="text-wtext-4 dark:text-rink-400 text-xl shrink-0" />
                <div>
                  <p className="text-w-small font-medium text-wtext-2 dark:text-rink-100">{item.label}</p>
                  <p className="text-w-caption text-wtext-3 dark:text-rink-300">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </MobileContainer>
  );
}
