'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { clubService } from '@/services/club.service';
import { Status, type Club, type TeamMember } from '@/types';

type MessageState = { type: 'success' | 'error'; text: string } | null;

export default function PendingMembersPage() {
  const router = useRouter();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedClubId, setSelectedClubId] = useState('');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<MessageState>(null);

  useEffect(() => {
    const loadClubs = async () => {
      try {
        const list = await clubService.getClubs({ page: 1, pageSize: 50 });
        setClubs(list);
        setSelectedClubId(list[0]?.id ?? '');
      } catch (error) {
        setClubs([]);
        setSelectedClubId('');
        const text = error instanceof Error
          ? error.message
          : '클럽 목록을 불러오는 중 오류가 발생했습니다.';
        setMessage({ type: 'error', text });
      }
    };

    void loadClubs();
  }, []);

  const loadPendingMembers = async (clubId: string) => {
    if (!clubId) return;
    setIsLoading(true);
    setSelectedIds([]);
    try {
      const list = await clubService.getPendingMembers(clubId);
      setMembers(list.filter((item) => item.approvalStatus === Status.PENDING));
    } catch (error) {
      setMembers([]);
      const text = error instanceof Error
        ? error.message
        : '승인 대기 회원 목록을 불러오는 중 오류가 발생했습니다.';
      setMessage({ type: 'error', text });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedClubId) {
      void loadPendingMembers(selectedClubId);
    }
  }, [selectedClubId]);

  const filteredMembers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return members;
    return members.filter((member) => {
      return (
        member.playerName.toLowerCase().includes(q) ||
        (member.user?.name || '').toLowerCase().includes(q) ||
        (member.user?.email || '').toLowerCase().includes(q)
      );
    });
  }, [members, searchTerm]);

  const toggleSelection = (memberId: string) => {
    setSelectedIds((prev) =>
      prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
    );
  };

  const toggleAllSelection = () => {
    if (selectedIds.length === filteredMembers.length) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(filteredMembers.map((member) => member.id));
  };

  const removeProcessedMembers = (processedIds: string[]) => {
    setMembers((prev) => prev.filter((member) => !processedIds.includes(member.id)));
    setSelectedIds([]);
  };

  const handleApproveOne = async (memberId: string) => {
    try {
      await clubService.approveMember(memberId, Status.APPROVED);
      removeProcessedMembers([memberId]);
      setMessage({ type: 'success', text: '회원이 승인되었습니다.' });
    } catch (error) {
      const text = error instanceof Error ? error.message : '회원 승인 중 오류가 발생했습니다.';
      setMessage({ type: 'error', text });
    }
  };

  const handleRejectOne = async (memberId: string) => {
    try {
      await clubService.rejectMember(memberId);
      removeProcessedMembers([memberId]);
      setMessage({ type: 'success', text: '회원이 거절되었습니다.' });
    } catch (error) {
      const text = error instanceof Error ? error.message : '회원 거절 중 오류가 발생했습니다.';
      setMessage({ type: 'error', text });
    }
  };

  const handleBulkAction = async (status: Status.APPROVED | Status.REJECTED) => {
    if (selectedIds.length === 0) return;
    try {
      await clubService.bulkApproveMembers(selectedIds, status);
      removeProcessedMembers(selectedIds);
      setMessage({
        type: 'success',
        text: status === Status.APPROVED ? '선택한 회원을 승인했습니다.' : '선택한 회원을 거절했습니다.',
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : '일괄 처리 중 오류가 발생했습니다.';
      setMessage({ type: 'error', text });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="가입 승인 대기"
        subtitle="가입 신청한 회원을 승인 또는 거절합니다."
        actions={[
          {
            label: '새로고침',
            onClick: () => void loadPendingMembers(selectedClubId),
            icon: RefreshCw,
            variant: 'outline',
          },
          {
            label: '회원 목록',
            onClick: () => router.push('/dashboard/members'),
            variant: 'secondary',
          },
        ]}
      />

      <Card className="p-5 space-y-4 shadow-md rounded-xl">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label htmlFor="pending-club" className="block text-sm mb-1.5 font-medium text-slate-700 dark:text-slate-300">클럽</label>
            <select
              id="pending-club"
              value={selectedClubId}
              onChange={(e) => setSelectedClubId(e.target.value)}
              className="w-full h-11 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              {clubs.map((club) => (
                <option key={club.id} value={club.id}>
                  {club.clubName}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="pending-search" className="block text-sm mb-1.5 font-medium text-slate-700 dark:text-slate-300">검색</label>
            <Input
              id="pending-search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="선수명, 보호자명, 이메일로 검색하세요."
              className="h-11"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline" className="px-3 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800">
            대기 회원 {filteredMembers.length}명
          </Badge>
          <Badge variant="outline" className="px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
            선택 {selectedIds.length}명
          </Badge>
        </div>
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

      <Card className="p-5 shadow-md rounded-xl">
        {isLoading ? (
          <LoadingSpinner message="승인 대기 회원을 불러오는 중입니다..." />
        ) : filteredMembers.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-3">
              <Check className="w-6 h-6 text-slate-400 dark:text-slate-500" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">승인 대기 회원이 없습니다.</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">새 가입 신청이 있으면 이곳에 표시됩니다.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-700">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selectedIds.length > 0 && selectedIds.length === filteredMembers.length}
                  onChange={toggleAllSelection}
                  className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/20"
                  aria-label="전체 선택"
                />
                전체 선택
              </label>
              <div className="flex gap-2">
                <Button
                  variant="success"
                  disabled={selectedIds.length === 0}
                  onClick={() => void handleBulkAction(Status.APPROVED)}
                  className="min-h-[44px]"
                >
                  <Check className="w-4 h-4" aria-hidden="true" />
                  선택 승인하기
                </Button>
                <Button
                  variant="destructive"
                  disabled={selectedIds.length === 0}
                  onClick={() => void handleBulkAction(Status.REJECTED)}
                  className="min-h-[44px]"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                  선택 거절하기
                </Button>
              </div>
            </div>

            {filteredMembers.map((member) => (
              <div
                key={member.id}
                className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 hover:border-primary/30 dark:hover:border-primary/40 hover:shadow-md transition-all motion-reduce:transition-none bg-white dark:bg-slate-800/50"
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(member.id)}
                    onChange={() => toggleSelection(member.id)}
                    className="mt-1.5 w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/20"
                    aria-label={`${member.playerName} 선택`}
                  />
                  <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0" aria-hidden="true">
                    <span className="text-sm font-bold text-amber-700 dark:text-amber-300">
                      {member.playerName.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {member.playerName}
                      </p>
                      <Badge variant="outline" className="rounded-full px-2 py-0.5 text-xs bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600">
                        {member.playerAge}세
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                      보호자: {member.user?.name || '-'} · {member.user?.email || '-'}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 shrink-0">
                  <Button variant="success" onClick={() => void handleApproveOne(member.id)} className="min-h-[44px]">
                    <Check className="w-4 h-4" aria-hidden="true" />
                    승인하기
                  </Button>
                  <Button variant="destructive" onClick={() => void handleRejectOne(member.id)} className="min-h-[44px]">
                    <X className="w-4 h-4" aria-hidden="true" />
                    거절하기
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
