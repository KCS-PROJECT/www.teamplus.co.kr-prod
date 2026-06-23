'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { KeyRound, Eye, EyeOff, Check, X, ShieldCheck } from 'lucide-react';
import { authService } from '@/services/auth.service';

export default function PasswordChangePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 비밀번호 강도 체크
  const passwordStrength = {
    hasMinLength: formData.newPassword.length >= 8,
    hasUpperCase: /[A-Z]/.test(formData.newPassword),
    hasLowerCase: /[a-z]/.test(formData.newPassword),
    hasNumber: /\d/.test(formData.newPassword),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(formData.newPassword),
  };

  const isPasswordStrong = Object.values(passwordStrength).filter(Boolean).length >= 4;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: '' }));
    setIsSaved(false);
  };

  const togglePasswordVisibility = (field: keyof typeof showPasswords) => {
    setShowPasswords(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.currentPassword) {
      newErrors.currentPassword = '현재 비밀번호를 입력하세요.';
    }

    if (!formData.newPassword) {
      newErrors.newPassword = '새 비밀번호를 입력하세요.';
    } else if (!isPasswordStrong) {
      newErrors.newPassword = '비밀번호가 보안 요건을 충족하지 않습니다.';
    }

    if (formData.newPassword !== formData.confirmPassword) {
      newErrors.confirmPassword = '새 비밀번호가 일치하지 않습니다.';
    }

    if (formData.currentPassword === formData.newPassword) {
      newErrors.newPassword = '현재 비밀번호와 다른 비밀번호를 입력하세요.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsLoading(true);

    try {
      await authService.changePassword(formData.currentPassword, formData.newPassword);
      setIsSaved(true);
      setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      console.error('비밀번호 변경 실패:', error);
      const msg = error instanceof Error ? error.message : '비밀번호 변경에 실패했습니다. 다시 시도해주세요.';
      setErrors({ submit: msg });
    } finally {
      setIsLoading(false);
    }
  };

  const PasswordRequirement = ({ met, text }: { met: boolean; text: string }) => (
    <div className={`flex items-center gap-2 text-xs ${met ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400'}`}>
      {met ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
      <span>{text}</span>
    </div>
  );

  return (
    <>
      <PageHeader
        title="비밀번호 변경"
        subtitle="계정 보안을 위해 주기적으로 비밀번호를 변경해주세요."
      />

      <div className="max-w-2xl">
        <Card className="p-6 dark:bg-slate-800 dark:border-slate-700">
          {/* 안내 메시지 */}
          <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg mb-6">
            <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-primary-light mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-800 dark:text-primary-light">보안 안내</p>
              <p className="text-xs text-blue-600 dark:text-primary-light mt-1">
                안전한 비밀번호를 위해 영문 대/소문자, 숫자, 특수문자를 조합하여 8자 이상으로 설정해주세요.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 현재 비밀번호 */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-slate-500" />
                현재 비밀번호
              </label>
              <div className="relative">
                <Input
                  name="currentPassword"
                  type={showPasswords.current ? 'text' : 'password'}
                  value={formData.currentPassword}
                  onChange={handleChange}
                  placeholder="현재 비밀번호를 입력하세요"
                  className={`pr-10 dark:bg-slate-700 dark:border-slate-600 ${errors.currentPassword ? 'border-red-500' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility('current')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPasswords.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.currentPassword && (
                <p className="text-xs text-red-500">{errors.currentPassword}</p>
              )}
            </div>

            {/* 새 비밀번호 */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-slate-500" />
                새 비밀번호
              </label>
              <div className="relative">
                <Input
                  name="newPassword"
                  type={showPasswords.new ? 'text' : 'password'}
                  value={formData.newPassword}
                  onChange={handleChange}
                  placeholder="새 비밀번호를 입력하세요"
                  className={`pr-10 dark:bg-slate-700 dark:border-slate-600 ${errors.newPassword ? 'border-red-500' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility('new')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPasswords.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.newPassword && (
                <p className="text-xs text-red-500">{errors.newPassword}</p>
              )}

              {/* 비밀번호 강도 체크 */}
              {formData.newPassword && (
                <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg space-y-1.5">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2">비밀번호 요건</p>
                  <PasswordRequirement met={passwordStrength.hasMinLength} text="8자 이상" />
                  <PasswordRequirement met={passwordStrength.hasUpperCase} text="영문 대문자 포함" />
                  <PasswordRequirement met={passwordStrength.hasLowerCase} text="영문 소문자 포함" />
                  <PasswordRequirement met={passwordStrength.hasNumber} text="숫자 포함" />
                  <PasswordRequirement met={passwordStrength.hasSpecial} text="특수문자 포함" />
                </div>
              )}
            </div>

            {/* 새 비밀번호 확인 */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-slate-500" />
                새 비밀번호 확인
              </label>
              <div className="relative">
                <Input
                  name="confirmPassword"
                  type={showPasswords.confirm ? 'text' : 'password'}
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="새 비밀번호를 다시 입력하세요"
                  className={`pr-10 dark:bg-slate-700 dark:border-slate-600 ${errors.confirmPassword ? 'border-red-500' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => togglePasswordVisibility('confirm')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPasswords.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-xs text-red-500">{errors.confirmPassword}</p>
              )}
              {formData.confirmPassword && formData.newPassword === formData.confirmPassword && (
                <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  비밀번호가 일치합니다.
                </p>
              )}
            </div>

            {errors.submit && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{errors.submit}</p>
              </div>
            )}

            <div className="pt-4 flex items-center gap-3">
              <Button
                type="submit"
                disabled={isLoading}
                className="h-11 bg-primary hover:bg-primary-dark text-white font-semibold gap-2 transition-colors motion-reduce:transition-none"
              >
                <KeyRound className="w-4 h-4" aria-hidden="true" />
                {isLoading ? '변경 중...' : '비밀번호 변경'}
              </Button>
              {isSaved && (
                <span className="text-sm text-green-600 dark:text-green-400" role="status">
                  비밀번호가 변경되었습니다.
                </span>
              )}
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
