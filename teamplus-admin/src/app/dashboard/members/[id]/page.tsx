'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Check, X, CreditCard } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { clubService } from '@/services/club.service';
import { attendanceService } from '@/services/attendance.service';
import { Status, type TeamMember, type MemberCredit } from '@/types';

type MessageState = { type: 'success' | 'error'; text: string } | null;

const getStatusLabel = (status: TeamMember['approvalStatus']) => {
  switch (status) {
    case 'approved':
      return '승인됨';
    case 'rejected':
      return '거절됨';
    case 'pending':
    default:
      return '승인 대기';
  }
};

export default function MemberDetailPage() {
  const params = useParams();
  const router = useRouter();
  const memberId = String(params?.id || '');

  const [member, setMember] = useState<TeamMember | null>(null);
  const [credit, setCredit] = useState<MemberCredit | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<MessageState>(null);

  const statusTone = useMemo(() => {
    if (!member) return 'text-slate-600';
    if (member.approvalStatus === 'approved') return 'text-green-600';
    if (member.approvalStatus === 'rejected') return 'text-red-600';
    return 'text-amber-600';
  }, [member]);

  useEffect(() => {
    const load = async () => {
      if (!memberId) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await clubService.getMember(memberId);
        setMember(data);
        try {
          const creditData = await attendanceService.getMemberCredit(memberId);
          setCredit(creditData);
        } catch {
          setCredit(null);
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : '회원 정보를 불러오지 못했습니다.';
        setMessage({ type: 'error', text });
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, [memberId]);

  const handleApprove = async () => {
    if (!member) return;
    try {
      const updated = await clubService.approveMember(member.id, Status.APPROVED);
      setMember(updated);
      setMessage({ type: 'success', text: '회원이 승인되었습니다.' });
    } catch (error) {
      const text = error instanceof Error ? error.message : '회원 승인에 실패했습니다.';
      setMessage({ type: 'error', text });
    }
  };

  const handleReject = async () => {
    if (!member) return;
    try {
      const updated = await clubService.rejectMember(member.id);
      setMember(updated);
      setMessage({ type: 'success', text: '회원이 거절되었습니다.' });
    } catch (error) {
      const text = error instanceof Error ? error.message : '회원 거절에 실패했습니다.';
      setMessage({ type: 'error', text });
    }
  };

  if (isLoading) {
    return <LoadingSpinner message="회원 정보를 불러오는 중입니다..." />;
  }

  if (!member) {
    return (
      <Card className="p-8 text-center">
        <p className="text-slate-600 dark:text-slate-300">회원 정보를 찾을 수 없습니다.</p>
        <Button className="mt-4" onClick={() => router.push('/dashboard/members')}>
          회원 목록으로 이동
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="회원 상세"
        subtitle="회원 프로필, 승인 상태, 결제권 정보를 확인합니다."
        action={{
          label: '목록으로',
          onClick: () => router.push('/dashboard/members'),
          icon: ArrowLeft,
          variant: 'outline',
        }}
      />

      {/* 프로필 히어로 */}
      <Card className="p-6 shadow-md rounded-xl space-y-6">
        <div className="flex items-start gap-5">
          <div
            className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center shrink-0 shadow-md"
            aria-hidden="true"
          >
            <span className="text-2xl font-bold text-white">
              {(member.playerName?.charAt(0) || '?').toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white truncate">
                {member.playerName}
              </h2>
              <Badge
                variant="outline"
                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${statusTone}`}
              >
                {getStatusLabel(member.approvalStatus)}
              </Badge>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              선수 {member.playerAge}세
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-1">
              ID: {member.id}
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm border-t border-slate-100 dark:border-slate-700 pt-5">
          <InfoRow label="보호자" value={member.user?.name || '-'} />
          <InfoRow label="연락처" value={member.user?.phone || '-'} />
          <InfoRow label="이메일" value={member.user?.email || '-'} />
          <InfoRow label="팀 ID" value={member.teamId ?? member.clubId ?? '-'} />
        </dl>
      </Card>

      {/* 결제권 정보 */}
      <Card className="p-6 shadow-md rounded-xl">
        <div className="flex items-center gap-2 mb-4">
          <CreditCard className="w-4 h-4 text-primary" aria-hidden="true" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">결제권 정보</h2>
        </div>
        {credit ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <MetricCard label="총 결제권" value={`${credit.totalCredits}`} accent="default" />
            <MetricCard label="사용 결제권" value={`${credit.usedCredits}`} accent="blue" />
            <MetricCard label="잔여 결제권" value={`${credit.remainingCredits}`} accent="primary" />
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            결제권 정보가 없습니다.
          </p>
        )}
      </Card>

      {message && (
        <Card
          className={`p-4 text-sm shadow-md rounded-xl ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800'
              : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800'
          }`}
          role={message.type === 'error' ? 'alert' : 'status'}
        >
          {message.text}
        </Card>
      )}

      {/* 승인 처리 */}
      <Card className="p-6 shadow-md rounded-xl">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-3">승인 처리</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          가입 신청을 승인하거나 거절하여 회원 상태를 변경합니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="success" onClick={handleApprove} className="min-h-[44px]">
            <Check className="w-4 h-4" aria-hidden="true" />
            승인하기
          </Button>
          <Button variant="destructive" onClick={handleReject} className="min-h-[44px]">
            <X className="w-4 h-4" aria-hidden="true" />
            거절하기
          </Button>
        </div>
      </Card>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-800/30">
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 font-medium text-slate-800 dark:text-slate-100 break-all">{value}</dd>
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent = 'default',
}: {
  label: string;
  value: string;
  accent?: 'default' | 'blue' | 'primary';
}) {
  const valueClass =
    accent === 'primary'
      ? 'text-primary dark:text-primary-light'
      : accent === 'blue'
        ? 'text-blue-600 dark:text-blue-400'
        : 'text-slate-900 dark:text-white';
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-800/30">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums text-right ${valueClass}`}>{value}</p>
    </div>
  );
}
