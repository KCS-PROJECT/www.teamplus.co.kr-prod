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

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-4 py-6 bg-wbg dark:bg-puck">
        {/* Info Banner */}
        <div className="mb-6 p-4 bg-ice-50 dark:bg-ice-500/10 rounded-w-md border border-ice-100 dark:border-ice-500/20">
          <div className="flex gap-3">
            <Icon name="info" className="text-ice-500 text-xl shrink-0" />
            <p className="text-w-small text-wtext-2 dark:text-rink-200">
              안전한 비밀번호를 위해 8자 이상의 영문, 숫자, 특수문자를 조합해 주세요.
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-5">
          {/* Current Password */}
          <div>
            <label className="block text-w-small font-medium text-wtext-2 dark:text-rink-200 mb-2">
              현재 비밀번호
            </label>
            <div className="relative">
              <input
                type={showPasswords.current ? 'text' : 'password'}
                value={formData.currentPassword}
                onChange={(e) => handleChange('currentPassword', e.target.value)}
                className={`w-full h-11 px-4 pr-12 rounded-w-md border ${
                  errors.currentPassword
                    ? 'border-red-500 focus:ring-red-200'
                    : 'border-wline-2 dark:border-rink-700 focus:ring-ice-500/20'
                } bg-wsurface dark:bg-rink-800 text-wtext-1 dark:text-white text-w-small focus:ring-2 focus:border-ice-500 transition-colors`}
                placeholder={MESSAGES.placeholders.enterCurrentPassword}
              />
              <button
                type="button"
                onClick={() => toggleShowPassword('current')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-wtext-4 hover:text-wtext-2"
                aria-label={showPasswords.current ? '비밀번호 숨기기' : '비밀번호 보기'}
              >
                <Icon name={showPasswords.current ? 'visibility_off' : 'visibility'} />
              </button>
            </div>
            {errors.currentPassword && (
              <p className="mt-1.5 text-w-caption text-red-500">{errors.currentPassword}</p>
            )}
          </div>

          {/* New Password */}
          <div>
            <label className="block text-w-small font-medium text-wtext-2 dark:text-rink-200 mb-2">
              새 비밀번호
            </label>
            <div className="relative">
              <input
                type={showPasswords.new ? 'text' : 'password'}
                value={formData.newPassword}
                onChange={(e) => handleChange('newPassword', e.target.value)}
                className={`w-full h-11 px-4 pr-12 rounded-w-md border ${
                  errors.newPassword
                    ? 'border-red-500 focus:ring-red-200'
                    : 'border-wline-2 dark:border-rink-700 focus:ring-ice-500/20'
                } bg-wsurface dark:bg-rink-800 text-wtext-1 dark:text-white text-w-small focus:ring-2 focus:border-ice-500 transition-colors`}
                placeholder={MESSAGES.placeholders.enterNewPassword}
              />
              <button
                type="button"
                onClick={() => toggleShowPassword('new')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-wtext-4 hover:text-wtext-2"
                aria-label={showPasswords.new ? '비밀번호 숨기기' : '비밀번호 보기'}
              >
                <Icon name={showPasswords.new ? 'visibility_off' : 'visibility'} />
              </button>
            </div>
            {errors.newPassword && (
              <p className="mt-1.5 text-w-caption text-red-500">{errors.newPassword}</p>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-w-small font-medium text-wtext-2 dark:text-rink-200 mb-2">
              새 비밀번호 확인
            </label>
            <div className="relative">
              <input
                type={showPasswords.confirm ? 'text' : 'password'}
                value={formData.confirmPassword}
                onChange={(e) => handleChange('confirmPassword', e.target.value)}
                className={`w-full h-11 px-4 pr-12 rounded-w-md border ${
                  errors.confirmPassword
                    ? 'border-red-500 focus:ring-red-200'
                    : 'border-wline-2 dark:border-rink-700 focus:ring-ice-500/20'
                } bg-wsurface dark:bg-rink-800 text-wtext-1 dark:text-white text-w-small focus:ring-2 focus:border-ice-500 transition-colors`}
                placeholder={MESSAGES.placeholders.enterConfirmPassword}
              />
              <button
                type="button"
                onClick={() => toggleShowPassword('confirm')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-wtext-4 hover:text-wtext-2"
                aria-label={showPasswords.confirm ? '비밀번호 숨기기' : '비밀번호 보기'}
              >
                <Icon name={showPasswords.confirm ? 'visibility_off' : 'visibility'} />
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="mt-1.5 text-w-caption text-red-500">{errors.confirmPassword}</p>
            )}
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <button
              onClick={handleSubmit}
              disabled={isLoading}
              className="w-full h-12 bg-ice-500 hover:bg-ice-600 active:bg-ice-700 text-white font-semibold rounded-w-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors motion-reduce:transition-none"
            >
              {isLoading ? '변경 중...' : '비밀번호 변경'}
            </button>
          </div>
        </div>
      </main>
    </MobileContainer>
  );
}
