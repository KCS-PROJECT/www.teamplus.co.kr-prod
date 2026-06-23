'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, UserCheck, UserX } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { userService } from '@/services/user.service';
import type { User, UserType } from '@/types';

type MessageState = { type: 'success' | 'error'; text: string } | null;

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = String(params?.id || '');

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<MessageState>(null);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    userType: 'parent' as UserType,
    department: '',
    position: '',
  });

  useEffect(() => {
    const loadUser = async () => {
      if (!userId) {
        setIsLoading(false);
        return;
      }

      try {
        const detail = await userService.getUser(userId);
        setUser(detail);
        setFormData({
          name: detail.name || '',
          phone: detail.phone || '',
          userType: detail.userType,
          department: detail.department || '',
          position: detail.position || '',
        });
      } catch {
        try {
          // 백엔드 미연동 환경에서도 조회 가능하도록 목록에서 폴백
          const response = await userService.getUsers({ page: 1, pageSize: 100 });
          const found = response.data.find((item) => item.id === userId) || null;
          if (found) {
            setUser(found);
            setFormData({
              name: found.name || '',
              phone: found.phone || '',
              userType: found.userType,
              department: found.department || '',
              position: found.position || '',
            });
          } else {
            setMessage({ type: 'error', text: '사용자 정보를 찾을 수 없습니다.' });
          }
        } catch (error) {
          const text = error instanceof Error ? error.message : '사용자 정보를 불러오지 못했습니다.';
          setMessage({ type: 'error', text });
        }
      } finally {
        setIsLoading(false);
      }
    };

    void loadUser();
  }, [userId]);

  const roleLabel = useMemo(() => {
    switch (formData.userType) {
      case 'admin':
        return '관리자';
      case 'coach':
        return '코치';
      case 'parent':
        return '학부모';
      case 'child':
        return '선수';
      default:
        return '사용자';
    }
  }, [formData.userType]);

  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);
    setMessage(null);
    try {
      const updated = await userService.updateUser(user.id, formData);
      setUser(updated);
      setMessage({ type: 'success', text: '사용자 정보가 수정되었습니다.' });
    } catch (error) {
      const text = error instanceof Error ? error.message : '사용자 정보 수정에 실패했습니다.';
      setMessage({ type: 'error', text });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRoleChange = async () => {
    if (!user) return;
    try {
      const updated = await userService.changeUserRole(user.id, formData.userType);
      setUser(updated);
      setMessage({ type: 'success', text: '권한이 변경되었습니다.' });
    } catch (error) {
      const text = error instanceof Error ? error.message : '권한 변경에 실패했습니다.';
      setMessage({ type: 'error', text });
    }
  };

  const handleToggleActive = async (activate: boolean) => {
    if (!user) return;
    try {
      if (activate) {
        await userService.activateUser(user.id);
        setMessage({ type: 'success', text: '사용자가 활성화되었습니다.' });
      } else {
        await userService.deactivateUser(user.id);
        setMessage({ type: 'success', text: '사용자가 비활성화되었습니다.' });
      }
    } catch (error) {
      const text = error instanceof Error ? error.message : '상태 변경에 실패했습니다.';
      setMessage({ type: 'error', text });
    }
  };

  if (isLoading) {
    return <LoadingSpinner message="사용자 정보를 불러오는 중입니다..." />;
  }

  if (!user) {
    return (
      <Card className="p-8 text-center">
        <p className="text-slate-600 dark:text-slate-300">사용자 정보를 찾을 수 없습니다.</p>
        <Button className="mt-4" onClick={() => router.push('/dashboard/users')}>
          사용자 목록으로 이동
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="사용자 상세"
        subtitle="사용자 정보와 권한을 관리합니다."
        actions={[
          {
            label: '목록으로',
            onClick: () => router.push('/dashboard/users'),
            icon: ArrowLeft,
            variant: 'outline',
          },
          {
            label: isSaving ? '저장 중...' : '저장하기',
            onClick: handleSave,
            icon: Save,
          },
        ]}
      />

      {/* 프로필 히어로 */}
      <Card className="p-6 shadow-md rounded-xl space-y-5">
        <div className="flex items-start gap-5 pb-5 border-b border-slate-100 dark:border-slate-700">
          <div
            className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shrink-0 shadow-md"
            aria-hidden="true"
          >
            <span className="text-2xl font-bold text-white">
              {(user.name || user.email).charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white truncate">
                {user.name || '이름 미등록'}
              </h2>
              <Badge
                variant="outline"
                className="rounded-full px-2.5 py-0.5 text-xs font-bold bg-primary/10 text-primary border-primary/20"
              >
                {roleLabel}
              </Badge>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-1">
              ID: {user.id}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="user-name" className="block text-sm mb-1.5 font-medium text-slate-700 dark:text-slate-300">이름</label>
            <Input
              id="user-name"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="이름을 입력해주세요."
              className="h-11"
            />
          </div>
          <div>
            <label htmlFor="user-phone" className="block text-sm mb-1.5 font-medium text-slate-700 dark:text-slate-300">전화번호</label>
            <Input
              id="user-phone"
              value={formData.phone}
              onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="010-0000-0000"
              className="h-11"
            />
          </div>
          <div>
            <label htmlFor="user-email" className="block text-sm mb-1.5 font-medium text-slate-700 dark:text-slate-300">이메일</label>
            <Input id="user-email" value={user.email} readOnly aria-readonly="true" className="h-11 bg-slate-50 dark:bg-slate-700/60" />
          </div>
          <div>
            <label htmlFor="user-role" className="block text-sm mb-1.5 font-medium text-slate-700 dark:text-slate-300">권한</label>
            <select
              id="user-role"
              value={formData.userType}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, userType: e.target.value as UserType }))
              }
              className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="admin">관리자</option>
              <option value="coach">코치</option>
              <option value="parent">학부모</option>
              <option value="child">선수</option>
            </select>
          </div>
          <div>
            <label htmlFor="user-department" className="block text-sm mb-1.5 font-medium text-slate-700 dark:text-slate-300">부서</label>
            <Input
              id="user-department"
              value={formData.department}
              onChange={(e) => setFormData((prev) => ({ ...prev, department: e.target.value }))}
              placeholder="부서를 입력해주세요."
              className="h-11"
            />
          </div>
          <div>
            <label htmlFor="user-position" className="block text-sm mb-1.5 font-medium text-slate-700 dark:text-slate-300">직책</label>
            <Input
              id="user-position"
              value={formData.position}
              onChange={(e) => setFormData((prev) => ({ ...prev, position: e.target.value }))}
              placeholder="직책을 입력해주세요."
              className="h-11"
            />
          </div>
        </div>

        {message && (
          <div
            role={message.type === 'error' ? 'alert' : 'status'}
            className={`rounded-lg px-4 py-3 text-sm border ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800'
                : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
          <Button variant="outline" onClick={handleRoleChange} className="min-h-[44px]">
            권한 변경 적용
          </Button>
          <Button variant="warning" onClick={() => handleToggleActive(false)} className="min-h-[44px]">
            <UserX className="w-4 h-4" aria-hidden="true" />
            비활성화
          </Button>
          <Button variant="success" onClick={() => handleToggleActive(true)} className="min-h-[44px]">
            <UserCheck className="w-4 h-4" aria-hidden="true" />
            활성화
          </Button>
        </div>
      </Card>
    </div>
  );
}
