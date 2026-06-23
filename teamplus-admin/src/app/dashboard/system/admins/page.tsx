'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, Mail, Phone, Users, Plus, Edit2, Trash2 } from 'lucide-react';
import { Modal, ModalHeader, ModalBody, ModalFooter, ConfirmModal } from '@/components/ui/modal';
import { api } from '@/services/api-client';
import { SYSTEM_ADMIN_EMAIL, WEB_ADMIN_EMAIL } from '@/lib/admin-constants';

interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  createdAt: string;
  userType?: string;
}

// [수정 2026-05-22] 역할 분류 — userType(SYSTEM/OPER/ADMIN) 우선, 이메일은 하위호환 폴백.
function classifyAdmin(item: AdminUser): 'system' | 'web' | 'oper' {
  const ut = String(item.userType ?? '').toUpperCase();
  if (ut === 'SYSTEM' || item.email === SYSTEM_ADMIN_EMAIL) return 'system';
  if (ut === 'ADMIN' || item.email === WEB_ADMIN_EMAIL) return 'web';
  return 'oper';
}

interface AdminForm {
  email: string;
  password: string;
  name: string;
  phone: string;
  userType: 'SYSTEM' | 'OPER';
}

const EMPTY_FORM: AdminForm = {
  email: '', password: '', name: '', phone: '', userType: 'OPER',
};

export default function AdminAccountsPage() {
  const [items, setItems] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 등록/수정 모달
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<AdminForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 삭제 확인 모달
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<{ data?: AdminUser[] } | AdminUser[]>('/admin/users', { params: { userType: 'ADMIN,SYSTEM,OPER' } });
      const list = (res as { data?: AdminUser[] })?.data ?? res ?? [];
      setItems(Array.isArray(list) ? list : []);
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── 모달 열기 ─────────────────────────────────
  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (item: AdminUser) => {
    setEditTarget(item);
    setForm({
      email: item.email,
      password: '',
      name: item.name ?? '',
      phone: item.phone ?? '',
      userType: classifyAdmin(item) === 'system' ? 'SYSTEM' : 'OPER',
    });
    setFormError('');
    setFormOpen(true);
  };

  const closeForm = () => {
    if (isSubmitting) return;
    setFormOpen(false);
  };

  // ─── 등록/수정 제출 ─────────────────────────────
  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setFormError('관리자명을 입력해주세요.');
      return;
    }
    if (!editTarget) {
      // 등록 — 이메일·비밀번호 필수
      if (!form.email.trim()) {
        setFormError('이메일(ID)을 입력해주세요.');
        return;
      }
      if (form.password.length < 8) {
        setFormError('비밀번호는 8자 이상이어야 합니다.');
        return;
      }
    }

    try {
      setIsSubmitting(true);
      setFormError('');
      if (editTarget) {
        // 수정 — 기본정보(이름·연락처)만. lastName 에 이름 전체 저장.
        await api.put(`/admin/users/${editTarget.id}`, {
          firstName: '',
          lastName: form.name.trim(),
          phone: form.phone.trim() || undefined,
        });
      } else {
        await api.post('/admin/admins', {
          email: form.email.trim(),
          password: form.password,
          firstName: '',
          lastName: form.name.trim(),
          phone: form.phone.trim() || undefined,
          userType: form.userType,
        });
      }
      setFormOpen(false);
      await fetchData();
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      setFormError(msg || '저장에 실패했습니다. 입력값을 확인해주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── 삭제 ──────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setIsDeleting(true);
      await api.delete(`/admin/admins/${deleteTarget.id}`);
      setDeleteTarget(null);
      await fetchData();
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      alert(msg || '삭제에 실패했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) return <LoadingSpinner message="관리자 계정을 불러오는 중..." />;

  const systemCount = items.filter(i => classifyAdmin(i) === 'system').length;
  const normalCount = items.filter(i => classifyAdmin(i) === 'oper').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="관리자 계정 관리"
        description="시스템 관리자 및 업무 관리자 계정을 등록·수정·삭제합니다"
        action={{ label: '관리자 등록', onClick: openCreate, icon: Plus }}
      />

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
              <Users className="w-5 h-5 text-slate-600 dark:text-slate-300" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">전체 관리자</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">{items.length}<span className="text-sm font-medium text-slate-500 ml-1">명</span></p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-red-600 dark:text-red-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">시스템 관리자</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">{systemCount}<span className="text-sm font-medium text-slate-500 ml-1">명</span></p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">업무 관리자</p>
              <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">{normalCount}<span className="text-sm font-medium text-slate-500 ml-1">명</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">관리자명</th>
                <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">이메일 (ID)</th>
                <th scope="col" className="text-left px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">연락처</th>
                <th scope="col" className="text-center px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">역할</th>
                <th scope="col" className="text-right px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider tabular-nums">가입일</th>
                <th scope="col" className="text-center px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">관리</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <Shield className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" aria-hidden="true" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">관리자 계정이 없습니다.</p>
                  </td>
                </tr>
              ) : items.map(item => {
                const adminKind = classifyAdmin(item);
                const isSystem = adminKind === 'system';
                const isWebAdmin = adminKind === 'web';
                const roleLabel = isSystem ? '시스템관리자' : isWebAdmin ? '웹관리자' : '업무관리자';
                const avatarBg = isSystem
                  ? 'bg-red-100 dark:bg-red-900/30'
                  : isWebAdmin
                    ? 'bg-blue-100 dark:bg-blue-900/30'
                    : 'bg-amber-100 dark:bg-amber-900/30';
                const avatarIcon = isSystem
                  ? 'text-red-600 dark:text-red-400'
                  : isWebAdmin
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-amber-600 dark:text-amber-400';
                const badgeClass = isSystem
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
                  : isWebAdmin
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                    : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800';
                return (
                  <tr
                    key={item.id}
                    className="border-b border-slate-100 dark:border-slate-700/50 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700/30 motion-reduce:transition-none transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${avatarBg}`}>
                          <Shield className={`w-4 h-4 ${avatarIcon}`} aria-hidden="true" />
                        </div>
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                        <span className="truncate">{item.email}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 tabular-nums">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                        <span>{item.phone || '-'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant="outline" className={badgeClass}>
                        {roleLabel}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                      {new Date(item.createdAt).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(item)}
                          className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-primary hover:text-primary hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors motion-reduce:transition-none"
                          aria-label={`${item.name} 수정`}
                        >
                          <Edit2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(item)}
                          className="w-9 h-9 flex items-center justify-center rounded-lg border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-red-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors motion-reduce:transition-none"
                          aria-label={`${item.name} 삭제`}
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 등록/수정 모달 ── */}
      <Modal isOpen={formOpen} onClose={closeForm} size="md">
        <ModalHeader title={editTarget ? '관리자 정보 수정' : '관리자 등록'} />
        <ModalBody scrollable maxHeight="70vh">
          <div className="space-y-4">
            <Field label="관리자명" required>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="예: 홍길동"
                maxLength={30}
              />
            </Field>

            <Field label="이메일 (ID)" required>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="admin@example.com"
                disabled={!!editTarget}
              />
              {editTarget && (
                <p className="mt-1 text-xs text-slate-400">이메일(ID)은 변경할 수 없습니다.</p>
              )}
            </Field>

            {!editTarget && (
              <Field label="비밀번호" required>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="8자 이상"
                  autoComplete="new-password"
                />
              </Field>
            )}

            <Field label="연락처">
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="010-0000-0000"
              />
            </Field>

            <Field label="관리자 유형" required>
              <select
                value={form.userType}
                onChange={(e) => setForm((f) => ({ ...f, userType: e.target.value as 'SYSTEM' | 'OPER' }))}
                disabled={!!editTarget}
                className="w-full h-11 px-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white disabled:opacity-60"
              >
                <option value="OPER">업무관리자</option>
                <option value="SYSTEM">시스템관리자</option>
              </select>
              {editTarget && (
                <p className="mt-1 text-xs text-slate-400">관리자 유형은 변경할 수 없습니다.</p>
              )}
            </Field>

            {formError && (
              <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={closeForm}
            disabled={isSubmitting}
            className="flex-1 h-11"
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 h-11"
          >
            {isSubmitting ? '저장 중...' : editTarget ? '수정하기' : '등록하기'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ── 삭제 확인 모달 ── */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => !isDeleting && setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="관리자 삭제"
        description={
          deleteTarget
            ? `${deleteTarget.name} (${deleteTarget.email}) 관리자 계정을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`
            : '이 작업은 되돌릴 수 없습니다.'
        }
        variant="danger"
        confirmText="삭제하기"
        cancelText="취소"
        isLoading={isDeleting}
      />
    </div>
  );
}

// ─── 폼 필드 래퍼 ──────────────────────────────────
function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}
