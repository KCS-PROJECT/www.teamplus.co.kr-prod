'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Monitor, Clock, LogOut, AlertTriangle, CheckCircle, Fingerprint, KeyRound, Info } from 'lucide-react';
import { api } from '@/services/api-client';
import { authService } from '@/services/auth.service';

export default function SecuritySettingsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [autoLogoutTime, setAutoLogoutTime] = useState('30');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogoutConfirmed = async () => {
    setShowLogoutConfirm(false);
    setIsLoading(true);
    try {
      await api.post('/auth/logout', {}).catch(() => {
        // 백엔드 응답 실패 시에도 클라이언트 로그아웃 수행
      });
      authService.logout('manual');
    } catch (error) {
      console.error('로그아웃 실패:', error);
      authService.logout('manual');
    } finally {
      setIsLoading(false);
    }
  };

  const ToggleSwitch = ({ enabled, onChange }: { enabled: boolean; onChange: () => void }) => (
    <button
      type="button"
      onClick={onChange}
      role="switch"
      aria-checked={enabled}
      aria-label="2단계 인증 활성화"
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors motion-reduce:transition-none ${
        enabled ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform motion-reduce:transition-none ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );

  return (
    <>
      <PageHeader
        title="보안 설정"
        subtitle="계정 보안을 강화하고 접속 기록을 확인할 수 있습니다."
      />

      <div className="max-w-3xl space-y-6">
        {/* 2단계 인증 */}
        <Card className="p-5 dark:bg-slate-800 dark:border-slate-700 shadow-md rounded-xl">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Fingerprint className="w-5 h-5 text-blue-600 dark:text-primary-light" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-slate-900 dark:text-white">2단계 인증</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  로그인 시 추가 인증 단계를 통해 계정을 보호합니다.
                </p>
                {twoFactorEnabled && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-green-600 dark:text-green-400">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>활성화됨</span>
                  </div>
                )}
              </div>
            </div>
            <ToggleSwitch
              enabled={twoFactorEnabled}
              onChange={() => setTwoFactorEnabled(!twoFactorEnabled)}
            />
          </div>
        </Card>

        {/* 자동 로그아웃 시간 */}
        <Card className="p-5 dark:bg-slate-800 dark:border-slate-700">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-slate-900 dark:text-white">자동 로그아웃</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  일정 시간 활동이 없을 경우 자동으로 로그아웃됩니다.
                </p>
              </div>
            </div>
            <select
              value={autoLogoutTime}
              onChange={(e) => setAutoLogoutTime(e.target.value)}
              className="px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="5">5분</option>
              <option value="15">15분</option>
              <option value="30">30분</option>
              <option value="60">1시간</option>
            </select>
          </div>
        </Card>

        {/* 비밀번호 변경 바로가기 */}
        <Card className="p-5 dark:bg-slate-800 dark:border-slate-700">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                <KeyRound className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-slate-900 dark:text-white">비밀번호</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  주기적인 비밀번호 변경으로 계정을 안전하게 보호하세요.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.location.href = '/dashboard/profile/password'}
              className="text-sm border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              변경하기
            </Button>
          </div>
        </Card>

        {/* 접속 기록 */}
        <Card className="dark:bg-slate-800 dark:border-slate-700 shadow-md rounded-xl">
          <div className="p-5 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center">
                  <Monitor className="w-5 h-5 text-slate-600 dark:text-slate-400" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-slate-900 dark:text-white">접속 기록</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">최근 로그인한 기기 목록</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLogoutConfirm((v) => !v)}
                disabled={isLoading}
                className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20 gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                로그아웃
              </Button>
            </div>
          </div>

          {/* 로그아웃 확인 UI */}
          {showLogoutConfirm && (
            <div className="mx-5 mb-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <p className="text-sm font-medium text-red-800 dark:text-red-300 mb-3">
                현재 세션에서 로그아웃하시겠습니까?
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleLogoutConfirmed}
                  disabled={isLoading}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs"
                >
                  로그아웃
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowLogoutConfirm(false)}
                  className="text-xs border-slate-300 dark:border-slate-600"
                >
                  취소
                </Button>
              </div>
            </div>
          )}

          {/* 기기 세션 목록 — 백엔드 세션 관리 API 미구현으로 빈 상태 표시 */}
          <div className="p-8 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mb-3">
              <Info className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              기기 세션 정보를 불러올 수 없습니다.
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              세션 관리 기능은 추후 업데이트될 예정입니다.
            </p>
          </div>
        </Card>

        {/* 보안 경고 */}
        <Card className="p-4 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 shadow-md rounded-xl" role="note">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">보안 권장 사항</p>
              <ul className="text-xs text-amber-700 dark:text-amber-400 mt-2 space-y-1 list-disc list-inside">
                <li>공용 PC에서는 항상 로그아웃해 주세요.</li>
                <li>비밀번호는 3개월마다 변경하는 것을 권장합니다.</li>
                <li>2단계 인증을 활성화하여 계정을 더욱 안전하게 보호하세요.</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
