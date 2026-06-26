'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { NavLink } from '@/components/ui/NavLink';

import { api } from '@/services/api-client';
import { useToast } from '@/components/ui/Toast';
import { useModal } from '@/components/ui/Modal';
import { MESSAGES } from '@/lib/messages';

import { usePageReady } from '@/hooks/usePageReady';
/**
 * SecuritySettingsPage - 보안 설정
 * Route: /security
 *
 * 데이터 소스:
 * - GET /api/v1/users/me/login-history — AuditLog 재사용
 * - GET /api/v1/users/me/devices — UserDevice
 * - DELETE /api/v1/users/me/devices/:id — soft delete
 *
 * 이전 버전은 securityItems 하드코딩만 있었음. 이번 Sprint에서 완전 교체.
 */

interface LoginHistoryEntry {
  id: string;
  action: string;
  success: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  reason: string | null;
  createdAt: string;
}

interface DeviceInfo {
  id: string;
  platform: string;
  deviceModel: string | null;
  osVersion: string | null;
  appVersion: string | null;
  lastSeenAt: string;
  createdAt: string;
  tokenPreview: string | null;
}

interface TwoFactorStatus {
  enabled: boolean;
  createdAt: string | null;
}

interface TwoFactorSetupData {
  otpauthUri: string;
  secret: string;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}.${m}.${day} ${h}:${min}`;
}

function shortUserAgent(ua: string | null): string {
  if (!ua) return '알 수 없음';
  // 대충 브라우저/OS만 식별
  const browser = /Chrome|Safari|Firefox|Edge|Opera/.exec(ua)?.[0] ?? 'Browser';
  const os = /(iPhone|iPad|Mac|Windows|Linux|Android)/.exec(ua)?.[0] ?? '';
  return os ? `${browser} · ${os}` : browser;
}

export default function SecuritySettingsPage() {
  // 공통 AppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });


  const { toast } = useToast();
  const { modal } = useModal();
  const [history, setHistory] = useState<LoginHistoryEntry[]>([]);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [error, setError] = useState<string | null>(null);

  // 2FA 상태
  const [twoFactorStatus, setTwoFactorStatus] = useState<TwoFactorStatus | null>(null);
  const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetupData | null>(null);
  const [is2faExpanded, setIs2faExpanded] = useState(false);
  const [tfaToken, setTfaToken] = useState('');
  const [tfaLoading, setTfaLoading] = useState(false);
  const tfaTokenRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const [histRes, devRes, tfaRes] = await Promise.all([
      api.get<{ entries: LoginHistoryEntry[]; count: number }>(
        '/users/me/login-history?limit=10',
      ),
      api.get<{ devices: DeviceInfo[]; count: number }>('/users/me/devices'),
      api.get<TwoFactorStatus>('/auth/2fa/status'),
    ]);
    if (histRes.success && histRes.data) {
      setHistory(histRes.data.entries ?? []);
    } else if (!histRes.success) {
      setError(histRes.error?.message ?? '데이터를 불러오지 못했습니다.');
    }
    if (devRes.success && devRes.data) {
      setDevices(devRes.data.devices ?? []);
    }
    if (tfaRes.success && tfaRes.data) {
      setTwoFactorStatus(tfaRes.data);
    }
    setIsLoading(false);
  }, []);

  const handle2faEnable = useCallback(async () => {
    setTfaLoading(true);
    const res = await api.post<TwoFactorSetupData>('/auth/2fa/enable');
    setTfaLoading(false);
    if (res.success && res.data) {
      setTwoFactorSetup(res.data);
      setIs2faExpanded(true);
      setTfaToken('');
      setTimeout(() => tfaTokenRef.current?.focus(), 300);
    } else {
      toast.error('2FA 설정 시작에 실패했습니다.');
    }
  }, [toast]);

  const handle2faVerify = useCallback(async () => {
    if (tfaToken.replace(/\s/g, '').length !== 6) {
      toast.error('6자리 인증 코드를 입력해주세요.');
      return;
    }
    setTfaLoading(true);
    const res = await api.post<{ message: string }>('/auth/2fa/verify', { token: tfaToken });
    setTfaLoading(false);
    if (res.success) {
      toast.success(MESSAGES.security.twoFactorEnabled);
      setTwoFactorSetup(null);
      setIs2faExpanded(false);
      setTfaToken('');
      setTwoFactorStatus({ enabled: true, createdAt: new Date().toISOString() });
    } else {
      toast.error(res.error?.message ?? '인증 코드가 올바르지 않습니다.');
    }
  }, [tfaToken, toast]);

  const [showDisablePanel, setShowDisablePanel] = useState(false);
  const [disableToken, setDisableToken] = useState('');

  const handle2faDisableConfirm = useCallback(async () => {
    if (disableToken.replace(/\s/g, '').length !== 6) {
      toast.error('6자리 인증 코드를 입력해주세요.');
      return;
    }
    setTfaLoading(true);
    const res = await api.post<{ message: string }>('/auth/2fa/disable', { token: disableToken });
    setTfaLoading(false);
    if (res.success) {
      toast.success(MESSAGES.security.twoFactorDisabled);
      setTwoFactorStatus({ enabled: false, createdAt: null });
      setShowDisablePanel(false);
      setDisableToken('');
    } else {
      toast.error(res.error?.message ?? '인증 코드가 올바르지 않습니다.');
    }
  }, [disableToken, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleLogoutDevice = useCallback(
    async (device: DeviceInfo) => {
      const confirmed = await modal.confirm({
        title: '디바이스 로그아웃',
        message: `${device.deviceModel ?? device.platform} 디바이스에서 로그아웃하시겠습니까? 해당 기기에서 푸시 알림이 더 이상 오지 않습니다.`,
        confirmText: '로그아웃',
        cancelText: '취소',
        variant: 'danger',
      });
      if (!confirmed) return;
      const res = await api.delete<{ success: boolean }>(
        `/users/me/devices/${device.id}`,
      );
      if (res.success) {
        toast.success(MESSAGES.security.deviceLoggedOut);
        setDevices((prev) => prev.filter((d) => d.id !== device.id));
      } else {
        toast.error(MESSAGES.security.deviceLogoutFailed);
      }
    },
    [modal, toast],
  );

  return (
    <MobileContainer hasBottomNav={false}>
      <PageAppBar title="보안 설정" forceNative />

      <main className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck">
        {/* Section 1: 비밀번호 / 계정 — full-bleed 흰 섹션 + hairline 행 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 pt-4 pb-4">
          <h2 className="text-w-small font-bold text-it-ink-500 dark:text-rink-300 tracking-wider uppercase mb-3">
            계정 보안
          </h2>
          <NavLink
            href="/profile/password"
            className="-mx-5 flex items-center gap-3 px-5 py-4 border-t border-it-line dark:border-rink-700 hover:bg-it-fill dark:hover:bg-rink-800 transition-colors motion-reduce:transition-none"
          >
            <div className="w-10 h-10 flex items-center justify-center text-it-blue-500">
              <Icon name="lock_reset" className="text-[26px]" />
            </div>
            <div className="flex-1">
              <p className="text-w-small font-bold text-it-ink-800 dark:text-white">비밀번호 변경</p>
              <p className="text-w-caption text-it-ink-500 dark:text-rink-300">
                주기적으로 변경하면 보안에 도움이 됩니다
              </p>
            </div>
            <Icon name="chevron_right" className="text-it-ink-400 dark:text-rink-500" />
          </NavLink>
        </section>

        {/* Section 2: 이중 인증 (2FA) — full-bleed 흰 섹션 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 pt-4 pb-4">
          <h2 className="text-w-small font-bold text-it-ink-500 dark:text-rink-300 tracking-wider uppercase mb-3">
            이중 인증 (2FA)
          </h2>

          {/* 상태 행 — it-fill 인셋 */}
          <div className="p-4 rounded-w-md bg-it-fill dark:bg-rink-800 border border-it-line-strong dark:border-rink-700">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 flex items-center justify-center rounded-w-pill ${twoFactorStatus?.enabled ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600' : 'bg-it-line-strong dark:bg-rink-700 text-it-ink-500'}`}>
                <Icon name={twoFactorStatus?.enabled ? 'verified' : 'security'} className="text-[24px]" />
              </div>
              <div className="flex-1">
                <p className="text-w-small font-bold text-it-ink-800 dark:text-white">이중 인증</p>
                {twoFactorStatus?.enabled ? (
                  <p className="text-w-caption text-emerald-600 dark:text-emerald-400">
                    사용 중{twoFactorStatus.createdAt ? ` · ${formatDateTime(twoFactorStatus.createdAt)} 설정` : ''}
                  </p>
                ) : (
                  <p className="text-w-caption text-it-ink-500 dark:text-rink-300">비활성화됨 · TOTP 앱으로 추가 보안</p>
                )}
              </div>
              {twoFactorStatus?.enabled ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setShowDisablePanel((v) => !v); setDisableToken(''); }}
                  disabled={tfaLoading}
                  type="button"
                >
                  비활성화
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handle2faEnable()}
                  disabled={tfaLoading}
                  type="button"
                >
                  설정하기
                </Button>
              )}
            </div>

            {/* 2FA 비활성화 패널 */}
            {showDisablePanel && twoFactorStatus?.enabled && (
              <div className="mt-4 pt-4 border-t border-it-line dark:border-rink-700 space-y-3">
                <p className="text-w-caption text-it-ink-700 dark:text-rink-100">
                  Authenticator 앱의 6자리 코드를 입력하여 비활성화를 확인하세요.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={disableToken}
                    onChange={(e) => setDisableToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="flex-1 px-3 py-2 text-center text-w-title font-mono rounded-lg border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-900 text-it-ink-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-it-red-500"
                  />
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => void handle2faDisableConfirm()}
                    disabled={tfaLoading || disableToken.length !== 6}
                    type="button"
                  >
                    확인
                  </Button>
                </div>
                <button
                  type="button"
                  onClick={() => { setShowDisablePanel(false); setDisableToken(''); }}
                  className="text-w-caption text-it-ink-500 hover:text-it-ink-700 dark:hover:text-rink-100 transition-colors motion-reduce:transition-none"
                >
                  취소
                </button>
              </div>
            )}

            {/* 2FA 설정 플로우 (확장 패널) */}
            {is2faExpanded && twoFactorSetup && (
              <div className="mt-4 pt-4 border-t border-it-line dark:border-rink-700 space-y-4">
                {/* Step 1: 앱 안내 */}
                <div>
                  <p className="text-w-caption font-bold text-it-ink-700 dark:text-rink-100 mb-1">
                    1단계. Authenticator 앱 설치
                  </p>
                  <p className="text-w-caption text-it-ink-500 dark:text-rink-300">
                    Google Authenticator 또는 Microsoft Authenticator 앱을 설치하세요.
                  </p>
                </div>

                {/* Step 2: QR 코드 */}
                <div>
                  <p className="text-w-caption font-bold text-it-ink-700 dark:text-rink-100 mb-2">
                    2단계. QR 코드 스캔
                  </p>
                  <div className="flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(twoFactorSetup.otpauthUri)}`}
                      alt="2FA QR 코드"
                      width={180}
                      height={180}
                      className="rounded-lg border border-it-line-strong dark:border-rink-700"
                    />
                  </div>
                </div>

                {/* Step 2b: 수동 입력 키 */}
                <div>
                  <p className="text-w-caption font-bold text-it-ink-700 dark:text-rink-100 mb-1">
                    QR 스캔 불가 시 — 수동 입력 키
                  </p>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-it-fill dark:bg-rink-700">
                    <code className="flex-1 text-w-caption font-mono text-it-ink-700 dark:text-rink-100 break-all select-all">
                      {twoFactorSetup.secret}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(twoFactorSetup.secret);
                        toast.success(MESSAGES.security.copied);
                      }}
                      className="p-1.5 rounded-md hover:bg-it-line-strong dark:hover:bg-rink-500 transition-colors motion-reduce:transition-none"
                      aria-label="복사"
                    >
                      <Icon name="content_copy" className="text-[16px] text-it-ink-500" />
                    </button>
                  </div>
                </div>

                {/* Step 3: 코드 입력 */}
                <div>
                  <p className="text-w-caption font-bold text-it-ink-700 dark:text-rink-100 mb-2">
                    3단계. 앱의 6자리 코드 입력
                  </p>
                  <div className="flex gap-2">
                    <input
                      ref={tfaTokenRef}
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      value={tfaToken}
                      onChange={(e) => setTfaToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="flex-1 px-3 py-2 text-center text-w-title font-mono rounded-lg border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-900 text-it-ink-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-it-blue-500"
                    />
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() => void handle2faVerify()}
                      disabled={tfaLoading || tfaToken.length !== 6}
                      type="button"
                    >
                      활성화
                    </Button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => { setIs2faExpanded(false); setTwoFactorSetup(null); setTfaToken(''); }}
                  className="text-w-caption text-it-ink-500 hover:text-it-ink-700 dark:hover:text-rink-100 transition-colors motion-reduce:transition-none"
                >
                  취소
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Section 3: 로그인 기록 — full-bleed 흰 섹션 + hairline 행 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 pt-4 pb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-w-small font-bold text-it-ink-500 dark:text-rink-300 tracking-wider uppercase">
              최근 로그인 기록
            </h2>
            <button
              onClick={() => void load()}
              className="text-w-caption font-semibold text-it-blue-600 hover:underline"
            >
              새로고침
            </button>
          </div>
          {isLoading ? null : error ? (
            <div className="p-4 rounded-w-md bg-it-red-50 dark:bg-it-red-500/15 text-w-small text-it-red-600 dark:text-it-red-300">
              {error}
            </div>
          ) : history.length === 0 ? (
            <div className="p-4 rounded-w-md border border-dashed border-it-line-strong dark:border-rink-700 text-center">
              <p className="text-w-small text-it-ink-500">로그인 기록이 없습니다</p>
            </div>
          ) : (
            <ul className="-mx-5 divide-y divide-it-line dark:divide-rink-700 border-t border-it-line dark:border-rink-700">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="px-5 py-4"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <Icon
                        name={entry.success ? 'check_circle' : 'error'}
                        className={
                          entry.success
                            ? 'text-emerald-500 text-[18px]'
                            : 'text-it-red-500 text-[18px]'
                        }
                      />
                      <span className="text-w-small font-semibold text-it-ink-800 dark:text-white">
                        {entry.success ? '로그인 성공' : '로그인 실패'}
                      </span>
                    </div>
                    <span className="text-w-caption text-it-ink-500">
                      {formatDateTime(entry.createdAt)}
                    </span>
                  </div>
                  <p className="text-w-caption text-it-ink-500 dark:text-rink-300 ml-6">
                    {entry.ipAddress ?? '알 수 없는 IP'} · {shortUserAgent(entry.userAgent)}
                    {!entry.success && entry.reason ? ` · ${entry.reason}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Section 4: 연결된 디바이스 — full-bleed 흰 섹션 + hairline 행 */}
        <section className="mt-2 bg-it-surface dark:bg-it-blue-950 px-5 pt-4 pb-30">
          <h2 className="text-w-small font-bold text-it-ink-500 dark:text-rink-300 tracking-wider uppercase mb-3">
            연결된 기기
          </h2>
          {isLoading ? null : devices.length === 0 ? (
            <div className="p-4 rounded-w-md border border-dashed border-it-line-strong dark:border-rink-700 text-center">
              <p className="text-w-small text-it-ink-500">연결된 기기가 없습니다</p>
            </div>
          ) : (
            <ul className="-mx-5 divide-y divide-it-line dark:divide-rink-700 border-t border-it-line dark:border-rink-700">
              {devices.map((device) => (
                <li
                  key={device.id}
                  className="px-5 py-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 flex items-center justify-center text-it-ink-700 dark:text-rink-100">
                      <Icon
                        name={
                          device.platform === 'ios' || device.platform === 'android'
                            ? 'smartphone'
                            : 'computer'
                        }
                        className="text-[26px]"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-w-small font-bold text-it-ink-800 dark:text-white">
                        {device.deviceModel ?? `${device.platform} 디바이스`}
                      </p>
                      <p className="text-w-caption text-it-ink-500 dark:text-rink-300">
                        {device.platform} {device.osVersion ?? ''}
                        {device.appVersion ? ` · 앱 v${device.appVersion}` : ''}
                      </p>
                      <p className="text-w-caption text-it-ink-500 mt-1">
                        마지막 접속: {formatDateTime(device.lastSeenAt)}
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleLogoutDevice(device)}
                    >
                      로그아웃
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </MobileContainer>
  );
}
