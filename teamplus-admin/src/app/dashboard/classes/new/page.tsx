'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, CheckCircle2, AlertCircle, Users, Calendar } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { classService } from '@/services/class.service';
import { clubService } from '@/services/club.service';
import type { Club } from '@/types';

type MessageState = { type: 'success' | 'error'; text: string } | null;

export default function NewClassPage() {
  const router = useRouter();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingClubs, setIsLoadingClubs] = useState(true);
  const [createdClassId, setCreatedClassId] = useState('');
  const [message, setMessage] = useState<MessageState>(null);
  const [formData, setFormData] = useState({
    clubId: '',
    className: '',
    description: '',
    capacity: '20',
    ageMin: '',
    ageMax: '',
  });

  useEffect(() => {
    const loadClubs = async () => {
      try {
        const list = await clubService.getClubs({ page: 1, pageSize: 50 });
        setClubs(list);
        if (list.length > 0) {
          setFormData((prev) => ({ ...prev, clubId: list[0].id }));
        }
      } catch {
        setClubs([]);
      } finally {
        setIsLoadingClubs(false);
      }
    };

    void loadClubs();
  }, []);

  const handleSubmit = async () => {
    if (!formData.clubId) {
      setMessage({ type: 'error', text: '클럽을 선택해주세요.' });
      return;
    }
    if (!formData.className.trim()) {
      setMessage({ type: 'error', text: '수업명을 입력해주세요.' });
      return;
    }

    const capacity = Number(formData.capacity);
    if (!Number.isFinite(capacity) || capacity <= 0) {
      setMessage({ type: 'error', text: '정원은 1명 이상이어야 합니다.' });
      return;
    }

    const ageMin = formData.ageMin ? Number(formData.ageMin) : undefined;
    const ageMax = formData.ageMax ? Number(formData.ageMax) : undefined;
    if (ageMin !== undefined && ageMax !== undefined && ageMin > ageMax) {
      setMessage({ type: 'error', text: '최소 연령은 최대 연령보다 클 수 없습니다.' });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);
    try {
      const created = await classService.createClass(formData.clubId, {
        className: formData.className.trim(),
        description: formData.description.trim() || undefined,
        capacity,
        ageMin,
        ageMax,
      });
      setCreatedClassId(created.id);
      setMessage({ type: 'success', text: '수업이 등록되었습니다.' });
      setFormData((prev) => ({
        ...prev,
        className: '',
        description: '',
        capacity: '20',
        ageMin: '',
        ageMax: '',
      }));
    } catch (error) {
      const text = error instanceof Error ? error.message : '수업 등록에 실패했습니다.';
      setMessage({ type: 'error', text });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="수업 등록"
        subtitle="클럽에 새로운 수업을 추가합니다."
        actions={[
          {
            label: '수업 목록',
            onClick: () => router.push('/dashboard/classes'),
            icon: ArrowLeft,
            variant: 'outline',
          },
          {
            label: isSubmitting ? '등록 중...' : '등록하기',
            onClick: () => void handleSubmit(),
            icon: Save,
          },
        ]}
      />

      {/* 메시지 */}
      {message && (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300'
              : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-300'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span className="flex-1">{message.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* 기본 정보 */}
          <Card className="p-6">
            <div className="mb-5 flex items-center gap-2 border-b border-slate-100 pb-4 dark:border-slate-700">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Users className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">기본 정보</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">수업이 속할 클럽과 기본 속성을 입력합니다.</p>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                  클럽 <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formData.clubId}
                  onChange={(e) => setFormData((prev) => ({ ...prev, clubId: e.target.value }))}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 transition-colors motion-reduce:transition-none focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-900"
                  disabled={isLoadingClubs || clubs.length === 0}
                >
                  {clubs.map((club) => (
                    <option key={club.id} value={club.id}>
                      {club.clubName}
                    </option>
                  ))}
                </select>
                {!isLoadingClubs && clubs.length === 0 && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                    등록 가능한 클럽이 없습니다. 먼저 클럽을 생성해주세요.
                  </p>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                  수업명 <span className="text-rose-500">*</span>
                </label>
                <Input
                  value={formData.className}
                  onChange={(e) => setFormData((prev) => ({ ...prev, className: e.target.value }))}
                  placeholder="예: 초급 정규반"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">수업 설명</label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="수업의 목적, 운영 방식, 준비물을 입력해주세요."
                  rows={5}
                />
                <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">학부모가 수업을 이해할 수 있도록 자세하게 작성해주세요.</p>
              </div>
            </div>
          </Card>

          {/* 정원 및 연령 */}
          <Card className="p-6">
            <div className="mb-5 flex items-center gap-2 border-b border-slate-100 pb-4 dark:border-slate-700">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <Calendar className="h-4 w-4 text-primary" aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">정원 및 연령 제한</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">수업 수용 인원과 대상 연령대를 설정합니다.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">정원</label>
                <Input
                  type="number"
                  min={1}
                  value={formData.capacity}
                  onChange={(e) => setFormData((prev) => ({ ...prev, capacity: e.target.value }))}
                />
                <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">최소 1명 이상</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">최소 연령</label>
                <Input
                  type="number"
                  min={1}
                  value={formData.ageMin}
                  onChange={(e) => setFormData((prev) => ({ ...prev, ageMin: e.target.value }))}
                  placeholder="선택"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">최대 연령</label>
                <Input
                  type="number"
                  min={1}
                  value={formData.ageMax}
                  onChange={(e) => setFormData((prev) => ({ ...prev, ageMax: e.target.value }))}
                  placeholder="선택"
                />
              </div>
            </div>
          </Card>

          {/* 하단 액션 */}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => router.push('/dashboard/classes')}>
              취소
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={isSubmitting}>
              <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {isSubmitting ? '등록 중...' : '등록하기'}
            </Button>
          </div>
        </div>

        {/* 우측 가이드 */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">등록 가이드</h3>
            <ul className="space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
              <li className="flex gap-2">
                <span className="mt-0.5 text-primary">•</span>
                <span>수업명은 학부모가 쉽게 이해할 수 있도록 작성해주세요.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 text-primary">•</span>
                <span>정원은 실제 수업 운영 가능 인원으로 설정합니다.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 text-primary">•</span>
                <span>대회 또는 시합 유형은 연령 제한을 권장합니다.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 text-primary">•</span>
                <span>등록 후 일정과 상품은 상세 페이지에서 추가할 수 있습니다.</span>
              </li>
            </ul>
          </Card>

          {createdClassId && (
            <Card className="border-emerald-200 bg-emerald-50/50 p-5 dark:border-emerald-900/50 dark:bg-emerald-900/10">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">등록 완료</p>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">생성된 수업 ID</p>
              <p className="mt-1 break-all rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-slate-800 dark:border-emerald-900/50 dark:bg-slate-900 dark:text-slate-100">
                {createdClassId}
              </p>
              <div className="mt-3 flex flex-col gap-2">
                <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/classes/${createdClassId}`)}>
                  수업 상세 보기
                </Button>
                <Button variant="secondary" size="sm" onClick={() => router.push('/dashboard/classes')}>
                  수업 목록 보기
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
