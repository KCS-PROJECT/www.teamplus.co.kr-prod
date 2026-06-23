'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, Package, Users, FileText, Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { classService } from '@/services/class.service';
import type { Class, ClassProduct, ClassSchedule } from '@/types';

type MessageState = { type: 'error'; text: string } | null;

export default function ClassDetailPage() {
  const params = useParams();
  const router = useRouter();
  const classId = String(params?.id || '');

  const [classInfo, setClassInfo] = useState<Class | null>(null);
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [products, setProducts] = useState<ClassProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<MessageState>(null);

  useEffect(() => {
    const load = async () => {
      if (!classId) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setMessage(null);
      try {
        const [detail, scheduleList, productList] = await Promise.all([
          classService.getClass(classId),
          classService.getClassSchedules(classId).catch(() => []),
          classService.getClassProducts(classId).catch(() => []),
        ]);
        setClassInfo(detail);
        setSchedules(scheduleList);
        setProducts(productList);
      } catch (error) {
        const text = error instanceof Error ? error.message : '수업 정보를 불러오지 못했습니다.';
        setMessage({ type: 'error', text });
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [classId]);

  if (isLoading) {
    return <LoadingSpinner message="수업 정보를 불러오는 중입니다..." />;
  }

  if (!classInfo) {
    return (
      <Card className="p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
          <FileText className="h-6 w-6 text-slate-400" aria-hidden="true" />
        </div>
        <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
          {message?.text || '수업 정보를 찾을 수 없습니다.'}
        </p>
        <Button className="mt-5" onClick={() => router.push('/dashboard/attendance')}>
          수업 목록으로 이동
        </Button>
      </Card>
    );
  }

  const enrollmentPercent =
    typeof classInfo.currentEnrollment === 'number' && classInfo.capacity > 0
      ? Math.min(100, Math.round((classInfo.currentEnrollment / classInfo.capacity) * 100))
      : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="수업 상세"
        subtitle="수업 기본 정보, 일정, 상품 정보를 확인합니다."
        actions={[
          {
            label: '목록으로',
            onClick: () => router.push('/dashboard/attendance'),
            icon: ArrowLeft,
            variant: 'outline',
          },
          {
            label: '일정 관리',
            onClick: () => router.push(`/dashboard/classes/${classId}/schedules`),
            icon: CalendarDays,
          },
        ]}
      />

      {/* 수업 요약 */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="bg-primary/5 text-primary ring-1 ring-inset ring-primary/20">
                <Sparkles className="mr-1 h-3 w-3" aria-hidden="true" />
                수업
              </Badge>
              <Badge variant="outline">정원 {classInfo.capacity}명</Badge>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">{classInfo.className}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">클럽 ID {classInfo.clubId}</p>
          </div>

          {/* 등록률 */}
          <div className="min-w-[180px] rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900/50">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" aria-hidden="true" />
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">등록 현황</p>
            </div>
            <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">
              {typeof classInfo.currentEnrollment === 'number' ? classInfo.currentEnrollment : 0}
              <span className="ml-1 text-sm font-medium text-slate-400">/ {classInfo.capacity}</span>
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full bg-primary transition-all motion-reduce:transition-none"
                style={{ width: `${enrollmentPercent}%` }}
                role="progressbar"
                aria-valuenow={enrollmentPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          <InfoRow label="수업 ID" value={classInfo.id} />
          <InfoRow label="최소 연령" value={classInfo.ageMin ? `${classInfo.ageMin}세` : '-'} />
          <InfoRow label="최대 연령" value={classInfo.ageMax ? `${classInfo.ageMax}세` : '-'} />
          <InfoRow
            label="현재 등록 인원"
            value={typeof classInfo.currentEnrollment === 'number' ? `${classInfo.currentEnrollment}명` : '-'}
          />
          <InfoRow label="생성일" value={new Date(classInfo.createdAt).toLocaleString('ko-KR')} />
        </div>

        <div className="mt-6 border-t border-slate-100 pt-5 dark:border-slate-700">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">설명</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            {classInfo.description || '등록된 설명이 없습니다.'}
          </p>
        </div>
      </Card>

      {/* 수업 일정 */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">수업 일정</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">총 {schedules.length}건</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/classes/${classId}/schedules`)}>
            전체 보기
          </Button>
        </div>
        {schedules.length === 0 ? (
          <div className="py-8 text-center">
            <CalendarDays className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" aria-hidden="true" />
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">등록된 일정이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {schedules.slice(0, 5).map((schedule) => (
              <div
                key={schedule.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm transition-colors motion-reduce:transition-none hover:border-primary/30 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700">
                    <CalendarDays className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                  </div>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {new Date(schedule.scheduledDate).toLocaleString('ko-KR')}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className={
                    schedule.isCancelled
                      ? 'bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:ring-rose-800/50'
                      : 'bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:ring-emerald-800/50'
                  }
                >
                  {schedule.isCancelled ? '취소됨' : '예정'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 수업 상품 */}
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-4 dark:border-slate-700">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Package className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">수업 상품</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">총 {products.length}건</p>
          </div>
        </div>
        {products.length === 0 ? (
          <div className="py-8 text-center">
            <Package className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" aria-hidden="true" />
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">등록된 상품이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {products.map((product) => (
              <div
                key={product.id}
                className="rounded-lg border border-slate-200 bg-white p-4 transition-colors motion-reduce:transition-none hover:border-primary/30 dark:border-slate-700 dark:bg-slate-800"
              >
                <p className="font-semibold text-slate-900 dark:text-white">{product.productName}</p>
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <span className="font-bold tabular-nums text-primary">{product.price.toLocaleString()}원</span>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {product.packageWeeks && product.packageSessionsPerWeek
                      ? `${product.packageWeeks}주 정기권 · 주 ${product.packageSessionsPerWeek}회`
                      : `총 ${product.sessionsPerMonth}회`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/30">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 break-all text-sm font-medium text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}
