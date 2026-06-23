'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { User, Mail, Phone, Building2, Save, Camera, AtSign } from 'lucide-react';
import { authService } from '@/services/auth.service';
import type { User as UserType } from '@/types';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function ProfilePage() {
  const [user, setUser] = useState<UserType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    phone: '',
    department: '',
    position: '',
  });
  const [usernameError, setUsernameError] = useState('');

  useEffect(() => {
    // 로컬 캐시 먼저 표시 후 API로 최신 정보 갱신
    const cached = authService.getCurrentUser();
    if (cached) {
      setUser(cached);
      setFormData({
        name: cached.name || '',
        username: cached.username || '',
        email: cached.email || '',
        phone: cached.phone || '',
        department: cached.department || '',
        position: cached.position || '',
      });
    }

    authService.getProfile().then((fresh) => {
      setUser(fresh);
      setFormData({
        name: fresh.name || '',
        username: fresh.username || '',
        email: fresh.email || '',
        phone: fresh.phone || '',
        department: fresh.department || '',
        position: fresh.position || '',
      });
    }).catch(() => {
      // 네트워크 오류 시 캐시 값 그대로 유지
    });
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setSaveStatus('idle');
    setErrorMessage('');

    // Username validation
    if (name === 'username') {
      if (value && !/^[a-zA-Z0-9_]{3,20}$/.test(value)) {
        setUsernameError('영문, 숫자, 밑줄(_)만 사용 가능하며 3-20자여야 합니다.');
      } else {
        setUsernameError('');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Username validation before submit
    if (formData.username && !/^[a-zA-Z0-9_]{3,20}$/.test(formData.username)) {
      setUsernameError('영문, 숫자, 밑줄(_)만 사용 가능하며 3-20자여야 합니다.');
      return;
    }

    setIsLoading(true);
    setSaveStatus('saving');
    setErrorMessage('');

    try {
      const updated = await authService.updateProfile({
        name: formData.name || undefined,
        phone: formData.phone || undefined,
      });
      setUser(updated);
      setSaveStatus('saved');
    } catch (error) {
      console.error('프로필 업데이트 실패:', error);
      const msg = error instanceof Error ? error.message : '정보 수정에 실패했습니다. 다시 시도해주세요.';
      setErrorMessage(msg);
      setSaveStatus('error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <PageHeader
        title="내 정보 수정"
        subtitle="계정 정보를 확인하고 수정할 수 있습니다."
      />

      <div className="max-w-2xl">
        <Card className="p-6 dark:bg-slate-800 dark:border-slate-700">
          {/* 프로필 이미지 영역 */}
          <div className="flex items-center gap-6 pb-6 border-b border-slate-200 dark:border-slate-700">
            <div className="relative">
              <div
                className="w-24 h-24 bg-primary/10 dark:bg-primary/20 rounded-full flex items-center justify-center border-2 border-primary/20"
                aria-hidden="true"
              >
                <span className="text-3xl font-bold text-primary">
                  {user?.username?.charAt(0) || user?.name?.charAt(0) || 'U'}
                </span>
              </div>
              <button
                type="button"
                className="absolute bottom-0 right-0 w-9 h-9 bg-primary rounded-full flex items-center justify-center text-white hover:bg-primary-dark transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-800"
                aria-label="프로필 사진 변경"
              >
                <Camera className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{user?.username || user?.name || '사용자'}</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">{user?.email}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                마지막 로그인: <span className="tabular-nums">{new Date().toLocaleDateString('ko-KR')}</span>
              </p>
            </div>
          </div>

          {/* 정보 수정 폼 */}
          <form onSubmit={handleSubmit} className="pt-6 space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <User className="w-4 h-4 text-slate-500" />
                이름
              </label>
              <Input
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="이름을 입력하세요"
                className="dark:bg-slate-700 dark:border-slate-600"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <AtSign className="w-4 h-4 text-slate-500" />
                사용자명
              </label>
              <Input
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="영문, 숫자, 밑줄 3-20자"
                className={`dark:bg-slate-700 dark:border-slate-600 ${usernameError ? 'border-red-500 focus:border-red-500' : ''}`}
              />
              {usernameError ? (
                <p className="text-xs text-red-500">{usernameError}</p>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  헤더에 표시될 사용자명입니다. (선택)
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Mail className="w-4 h-4 text-slate-500" />
                이메일
              </label>
              <Input
                name="email"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="이메일을 입력하세요"
                className="dark:bg-slate-700 dark:border-slate-600"
                disabled
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                이메일은 변경할 수 없습니다.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Phone className="w-4 h-4 text-slate-500" />
                연락처
              </label>
              <Input
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="연락처를 입력하세요"
                className="dark:bg-slate-700 dark:border-slate-600"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-500" />
                  부서
                </label>
                <Input
                  name="department"
                  value={formData.department}
                  onChange={handleChange}
                  placeholder="부서명"
                  className="dark:bg-slate-700 dark:border-slate-600"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  직책
                </label>
                <Input
                  name="position"
                  value={formData.position}
                  onChange={handleChange}
                  placeholder="직책"
                  className="dark:bg-slate-700 dark:border-slate-600"
                />
              </div>
            </div>

            <div className="pt-4 flex items-center gap-3">
              <Button
                type="submit"
                disabled={isLoading}
                className="h-11 bg-primary hover:bg-primary-dark text-white font-semibold gap-2 transition-colors motion-reduce:transition-none"
              >
                <Save className="w-4 h-4" aria-hidden="true" />
                {isLoading ? '저장 중...' : '저장하기'}
              </Button>
              {saveStatus === 'saved' && (
                <span className="text-sm text-green-600 dark:text-green-400" role="status">
                  저장되었습니다.
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="text-sm text-red-600 dark:text-red-400" role="alert">
                  {errorMessage}
                </span>
              )}
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
