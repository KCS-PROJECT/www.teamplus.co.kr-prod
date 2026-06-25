'use client';

import { useState } from 'react';
import { MobileContainer } from '@/components/layout/MobileContainer';
import { PageAppBar } from '@/components/layout/PageAppBar';
import { useNativeUI } from '@/hooks/useNativeUI';
import { Icon } from '@/components/ui/Icon';
import { useNavigation } from '@/components/ui/NavLink';
import { api } from '@/services/api-client';
import { MESSAGES } from '@/lib/messages';

import { usePageReady } from '@/hooks/usePageReady';
/**
 * PasswordChangePage - 비밀번호 변경 화면
 * Route: /profile/password
 *
 * UI_LAYOUT_GUIDE 준수:
 * - 컨테이너 패딩: 16px (px-4)
 * - 터치 타겟: 48dp 최소
 * - 입력 높이: 44dp (h-11)
 * - border-radius: 8px (rounded-lg)
 * - 컬러 그림자 금지
 */

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function PasswordChangePage() {
  // 공통 AppBar 사용 — Flutter 네이티브 AppBar 비활성화 (중복 헤더 방지)
  useNativeUI({
    showStatusBar: true,
    showAppBar: false,
    showBottomNav: true,
  });


  const { back } = useNavigation();
  const [formData, setFormData] = useState<PasswordForm>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [isLoading, setIsLoading] = useState(false);

  // 풀스크린 로더 fast-path (v11) — fetch 완료 시점에 PageTransitionLoader OFF
  usePageReady(!isLoading);
  const [errors, setErrors] = useState<Partial<PasswordForm>>({});

  const handleChange = (field: keyof PasswordForm, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const toggleShowPassword = (field: 'current' | 'new' | 'confirm') => {
    setShowPasswords((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const validate = (): boolean => {
    const newErrors: Partial<PasswordForm> = {};

    if (!formData.currentPassword) {
      newErrors.currentPassword = '현재 비밀번호를 입력하세요.';
    }
    if (!formData.newPassword) {
      newErrors.newPassword = '새 비밀번호를 입력하세요.';
    } else if (formData.newPassword.length < 8) {
      newErrors.newPassword = '비밀번호는 8자 이상이어야 합니다.';
    }
    if (!formData.confirmPassword) {
      newErrors.confirmPassword = '비밀번호 확인을 입력하세요.';
    } else if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = '비밀번호가 일치하지 않습니다.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setIsLoading(true);
    try {
      const response = await api.post('/auth/change-password', {
        currentPassword: formData.currentPassword,
        newPassword: formData.newPassword,
      });
      if (response.success) {
        alert(MESSAGES.profile.passwordChanged);
        back();
      } else {
        const msg = response.error?.message ?? '비밀번호 변경 중 오류가 발생했습니다.';
        if (response.error?.code === 'INVALID_PASSWORD') {
          setErrors({ currentPassword: '현재 비밀번호가 올바르지 않습니다.' });
        } else {
          alert(msg);
        }
      }
    } catch {
      alert(MESSAGES.profile.passwordChangeFailed);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <MobileContainer hasBottomNav={true}>
      <PageAppBar title="비밀번호 변경" forceNative />

      {/* Main Content — ICETIMES flat: 회색 캔버스 + full-bleed 흰 섹션 */}
      <main className="flex-1 overflow-y-auto bg-it-canvas dark:bg-puck !pb-8">
        {/* 안내 — 흰 섹션 상단 인셋(it-fill) hairline 행 */}
        <section className="bg-it-surface dark:bg-rink-800 px-5 pt-5 pb-6">
          <div className="flex gap-3 px-4 py-3.5 rounded-w-md bg-it-fill dark:bg-rink-900 border-[1.5px] border-it-line-strong dark:border-rink-700">
            <Icon name="info" className="text-it-blue-500 text-xl shrink-0" aria-hidden="true" />
            <p className="text-w-small text-it-ink-500 dark:text-rink-200 leading-relaxed">
              안전한 비밀번호를 위해 8자 이상의 영문, 숫자, 특수문자를 조합해 주세요.
            </p>
          </div>

          {/* Form */}
          <div className="mt-5 space-y-5">
            {/* Current Password */}
            <div>
              <label className="block text-card-meta font-bold text-it-ink-500 dark:text-rink-100 mb-1.5">
                현재 비밀번호
              </label>
              <div className="relative">
                <input
                  type={showPasswords.current ? 'text' : 'password'}
                  value={formData.currentPassword}
                  onChange={(e) => handleChange('currentPassword', e.target.value)}
                  className={`w-full h-[50px] px-4 pr-12 rounded-w-md border-[1.5px] bg-it-fill dark:bg-rink-900 text-it-ink-800 dark:text-white text-[15.5px] font-semibold tracking-[-0.01em] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/30 ${
                    errors.currentPassword
                      ? 'border-it-red-500'
                      : 'border-it-line-strong dark:border-rink-700 focus:border-it-blue-500'
                  }`}
                  placeholder={MESSAGES.placeholders.enterCurrentPassword}
                />
                <button
                  type="button"
                  onClick={() => toggleShowPassword('current')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-it-ink-400 hover:text-it-ink-500"
                  aria-label={showPasswords.current ? '비밀번호 숨기기' : '비밀번호 보기'}
                >
                  <Icon name={showPasswords.current ? 'visibility_off' : 'visibility'} aria-hidden="true" />
                </button>
              </div>
              {errors.currentPassword && (
                <p className="mt-2 text-card-body text-it-red-500" role="alert">{errors.currentPassword}</p>
              )}
            </div>

            {/* New Password */}
            <div>
              <label className="block text-card-meta font-bold text-it-ink-500 dark:text-rink-100 mb-1.5">
                새 비밀번호
              </label>
              <div className="relative">
                <input
                  type={showPasswords.new ? 'text' : 'password'}
                  value={formData.newPassword}
                  onChange={(e) => handleChange('newPassword', e.target.value)}
                  className={`w-full h-[50px] px-4 pr-12 rounded-w-md border-[1.5px] bg-it-fill dark:bg-rink-900 text-it-ink-800 dark:text-white text-[15.5px] font-semibold tracking-[-0.01em] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/30 ${
                    errors.newPassword
                      ? 'border-it-red-500'
                      : 'border-it-line-strong dark:border-rink-700 focus:border-it-blue-500'
                  }`}
                  placeholder={MESSAGES.placeholders.enterNewPassword}
                />
                <button
                  type="button"
                  onClick={() => toggleShowPassword('new')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-it-ink-400 hover:text-it-ink-500"
                  aria-label={showPasswords.new ? '비밀번호 숨기기' : '비밀번호 보기'}
                >
                  <Icon name={showPasswords.new ? 'visibility_off' : 'visibility'} aria-hidden="true" />
                </button>
              </div>
              {errors.newPassword && (
                <p className="mt-2 text-card-body text-it-red-500" role="alert">{errors.newPassword}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-card-meta font-bold text-it-ink-500 dark:text-rink-100 mb-1.5">
                새 비밀번호 확인
              </label>
              <div className="relative">
                <input
                  type={showPasswords.confirm ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={(e) => handleChange('confirmPassword', e.target.value)}
                  className={`w-full h-[50px] px-4 pr-12 rounded-w-md border-[1.5px] bg-it-fill dark:bg-rink-900 text-it-ink-800 dark:text-white text-[15.5px] font-semibold tracking-[-0.01em] transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/30 ${
                    errors.confirmPassword
                      ? 'border-it-red-500'
                      : 'border-it-line-strong dark:border-rink-700 focus:border-it-blue-500'
                  }`}
                  placeholder={MESSAGES.placeholders.enterConfirmPassword}
                />
                <button
                  type="button"
                  onClick={() => toggleShowPassword('confirm')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-it-ink-400 hover:text-it-ink-500"
                  aria-label={showPasswords.confirm ? '비밀번호 숨기기' : '비밀번호 보기'}
                >
                  <Icon name={showPasswords.confirm ? 'visibility_off' : 'visibility'} aria-hidden="true" />
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-2 text-card-body text-it-red-500" role="alert">{errors.confirmPassword}</p>
              )}
            </div>

            {/* Submit Button — it-blue lg h54 */}
            <div className="pt-3">
              <button
                onClick={handleSubmit}
                disabled={isLoading}
                className="w-full h-[54px] bg-it-blue-500 hover:bg-it-blue-600 active:bg-it-blue-700 text-white text-[16px] font-extrabold tracking-[-0.01em] rounded-w-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-it-blue-500/40"
              >
                {isLoading ? '변경 중...' : '비밀번호 변경'}
              </button>
            </div>
          </div>
        </section>
      </main>
    </MobileContainer>
  );
}
