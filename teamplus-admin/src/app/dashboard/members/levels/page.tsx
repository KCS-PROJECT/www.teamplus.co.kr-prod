'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Crown, Search, Edit, Gift } from 'lucide-react';
import { api } from '@/services/api-client';

interface MemberLevel {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  level: number;
  levelName: string;
  totalPoints: number;
  currentPoints: number;
  pointsToNext: number;
  levelUpdatedAt: string;
  createdAt: string;
}

const levelColors: Record<string, { bg: string; text: string; border: string }> = {
  Bronze:   { bg: 'bg-orange-100 dark:bg-orange-900/30',  text: 'text-orange-700 dark:text-orange-400',  border: 'border-orange-200 dark:border-orange-800' },
  Silver:   { bg: 'bg-slate-100 dark:bg-slate-700/50',    text: 'text-slate-700 dark:text-slate-300',    border: 'border-slate-300 dark:border-slate-600' },
  Gold:     { bg: 'bg-yellow-100 dark:bg-yellow-900/30',  text: 'text-yellow-700 dark:text-yellow-400',  border: 'border-yellow-300 dark:border-yellow-800' },
  Platinum: { bg: 'bg-cyan-100 dark:bg-cyan-900/30',      text: 'text-cyan-700 dark:text-cyan-400',      border: 'border-cyan-300 dark:border-cyan-800' },
  Diamond:  { bg: 'bg-purple-100 dark:bg-purple-900/30',  text: 'text-purple-700 dark:text-purple-400',  border: 'border-purple-300 dark:border-purple-800' },
};

const levelThresholds = [
  { level: 1, name: 'Bronze', minPoints: 0, maxPoints: 999, benefits: '기본 혜택' },
  { level: 2, name: 'Silver', minPoints: 1000, maxPoints: 4999, benefits: '배송비 무료' },
  { level: 3, name: 'Gold', minPoints: 5000, maxPoints: 14999, benefits: '5% 추가 할인' },
  { level: 4, name: 'Platinum', minPoints: 15000, maxPoints: 49999, benefits: '10% 추가 할인' },
  { level: 5, name: 'Diamond', minPoints: 50000, maxPoints: null, benefits: 'VIP 전용 혜택' },
];

interface ApiMemberLevel {
  id: string;
  userId: string;
  levelName: string;
  totalPoints: number;
  currentPoints: number;
  pointsToNext: number;
  levelUpdatedAt: string;
  user?: { id: string; email: string; username: string };
}

interface ApiMemberLevelResponse {
  data: ApiMemberLevel[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export default function MemberLevelsPage() {
  const [members, setMembers] = useState<MemberLevel[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberLevel | null>(null);
  const [adjustPoints, setAdjustPoints] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState('');

  const loadMembers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<ApiMemberLevelResponse>('/admin/member-levels?limit=100');
      const mapped: MemberLevel[] = res.data.map((item) => ({
        id: item.id,
        userId: item.userId,
        userName: item.user?.username ?? '',
        userEmail: item.user?.email ?? '',
        level: levelThresholds.find((lt) => lt.name === item.levelName)?.level ?? 1,
        levelName: item.levelName,
        totalPoints: item.totalPoints,
        currentPoints: item.currentPoints,
        pointsToNext: item.pointsToNext,
        levelUpdatedAt: item.levelUpdatedAt.split('T')[0],
        createdAt: item.levelUpdatedAt.split('T')[0],
      }));
      setMembers(mapped);
    } catch (error) {
      console.error('[LevelsPage] 레벨 목록 로드 실패:', error);
      setMembers([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const filteredMembers = members.filter((member) => {
    const matchesSearch =
      member.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.userEmail.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesLevel =
      levelFilter === 'all' || member.level === parseInt(levelFilter);
    return matchesSearch && matchesLevel;
  });

  const handleOpenAdjust = (member: MemberLevel) => {
    setSelectedMember(member);
    setAdjustPoints(0);
    setAdjustReason('');
    setIsAdjustOpen(true);
  };

  const handleSaveAdjust = async () => {
    if (!selectedMember || adjustPoints === 0 || !adjustReason) return;
    try {
      await api.post(`/admin/users/${selectedMember.userId}/points/adjust`, {
        amount: adjustPoints,
        reason: adjustReason,
      });
      setIsAdjustOpen(false);
      loadMembers();
    } catch (error) {
      console.error('[LevelsPage] 포인트 조정 실패:', error);
    }
  };

  const getLevelStats = () => {
    const stats: Record<string, number> = {};
    levelThresholds.forEach((lt) => {
      stats[lt.name] = members.filter((m) => m.levelName === lt.name).length;
    });
    return stats;
  };

  const levelStats = getLevelStats();

  const getProgressPercentage = (member: MemberLevel) => {
    const currentThreshold = levelThresholds.find((lt) => lt.level === member.level);
    const nextThreshold = levelThresholds.find((lt) => lt.level === member.level + 1);

    if (!currentThreshold || !nextThreshold) return 100;

    const range = nextThreshold.minPoints - currentThreshold.minPoints;
    const progress = member.totalPoints - currentThreshold.minPoints;

    return Math.min(100, Math.round((progress / range) * 100));
  };

  if (isLoading) {
    return <LoadingSpinner message="레벨 정보를 불러오는 중..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="회원 레벨 관리"
        description="회원 등급과 포인트를 관리합니다."
      />

      {/* 레벨 분포 통계 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {levelThresholds.map((lt) => {
          const color = levelColors[lt.name];
          return (
            <div
              key={lt.level}
              className={`rounded-xl border p-4 shadow-md ${color.bg} ${color.border}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Crown className={`h-5 w-5 ${color.text}`} />
                <span className={`font-medium ${color.text}`}>{lt.name}</span>
              </div>
              <div className={`text-2xl font-bold ${color.text}`}>
                {levelStats[lt.name] || 0}명
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{lt.benefits}</div>
            </div>
          );
        })}
      </div>

      {/* 레벨 기준표 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-md">
        <h3 className="font-semibold mb-3 flex items-center gap-2 text-slate-900 dark:text-white">
          <Gift className="h-4 w-4 text-primary" aria-hidden="true" />
          레벨별 기준 및 혜택
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/50">
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">레벨</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">등급명</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">누적 포인트</th>
                <th className="text-center py-3 px-4 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">혜택</th>
              </tr>
            </thead>
            <tbody>
              {levelThresholds.map((lt) => {
                const color = levelColors[lt.name];
                return (
                  <tr key={lt.level} className="border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="py-3 px-4 text-center text-slate-700 dark:text-slate-300">{lt.level}</td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex justify-center">
                        <Badge className={`${color.bg} ${color.text} border ${color.border}`}>
                          {lt.name}
                        </Badge>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-center text-slate-700 dark:text-slate-300">
                      {lt.minPoints.toLocaleString()}P
                      {lt.maxPoints && ` ~ ${lt.maxPoints.toLocaleString()}P`}
                      {!lt.maxPoints && ' 이상'}
                    </td>
                    <td className="py-3 px-4 text-center text-slate-700 dark:text-slate-300">{lt.benefits}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 필터 및 검색 */}
      <div className="flex flex-col sm:flex-row gap-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-md p-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
          <Input
            placeholder="회원명 또는 이메일 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="회원명 또는 이메일로 검색"
            className="pl-10 h-11"
          />
        </div>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-full sm:w-40 h-11">
            <SelectValue placeholder="등급 필터" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 등급</SelectItem>
            {levelThresholds.map((lt) => (
              <SelectItem key={lt.level} value={lt.level.toString()}>
                {lt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 회원 테이블 */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-md">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700">
              <TableHead className="text-center px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">회원</TableHead>
              <TableHead className="text-center px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">등급</TableHead>
              <TableHead className="text-right px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">누적 포인트</TableHead>
              <TableHead className="text-right px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">가용 포인트</TableHead>
              <TableHead className="text-center px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">다음 등급까지</TableHead>
              <TableHead className="text-center px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">등급 변경일</TableHead>
              <TableHead className="text-center px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMembers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-slate-500 dark:text-slate-400">
                  회원 정보가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              filteredMembers.map((member) => {
                const color = levelColors[member.levelName];
                const progress = getProgressPercentage(member);
                return (
                  <TableRow key={member.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <TableCell className="text-center px-4 py-4">
                      <div className="flex flex-col items-center gap-0.5">
                        <p className="font-medium text-slate-900 dark:text-white">{member.userName}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{member.userEmail}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-center px-4 py-4">
                      <div className="flex justify-center">
                        <Badge className={`${color.bg} ${color.text} border ${color.border}`}>
                          <Crown className="h-3 w-3 mr-1" />
                          {member.levelName}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right px-4 py-4">
                      <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{member.totalPoints.toLocaleString()}P</span>
                    </TableCell>
                    <TableCell className="text-right px-4 py-4">
                      <span className="text-blue-600 dark:text-blue-400 font-semibold tabular-nums">{member.currentPoints.toLocaleString()}P</span>
                    </TableCell>
                    <TableCell className="text-center px-4 py-4">
                      {member.level < 5 ? (
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 dark:bg-blue-400"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{progress}%</span>
                          </div>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {member.pointsToNext.toLocaleString()}P 필요
                          </span>
                        </div>
                      ) : (
                        <div className="flex justify-center">
                          <Badge variant="outline" className="text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-700">
                            최고 등급
                          </Badge>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-center px-4 py-4">
                      <span className="text-sm text-slate-600 dark:text-slate-300">{member.levelUpdatedAt}</span>
                    </TableCell>
                    <TableCell className="text-center px-4 py-4">
                      <div className="flex justify-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenAdjust(member)}
                          title="포인트 조정"
                          className="hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          <Edit className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* 포인트 조정 다이얼로그 */}
      <Dialog open={isAdjustOpen} onOpenChange={setIsAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>포인트 조정</DialogTitle>
            <DialogDescription>
              회원의 포인트를 수동으로 조정합니다. 양수는 적립, 음수는 차감입니다.
            </DialogDescription>
          </DialogHeader>
          {selectedMember && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">{selectedMember.userName}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{selectedMember.userEmail}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-500 dark:text-slate-400">현재 가용 포인트</p>
                    <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {selectedMember.currentPoints.toLocaleString()}P
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">조정 포인트</label>
                <Input
                  type="number"
                  value={adjustPoints}
                  onChange={(e) => setAdjustPoints(parseInt(e.target.value) || 0)}
                  placeholder="예: 1000 (적립) 또는 -500 (차감)"
                />
                {adjustPoints !== 0 && (
                  <p className="text-sm mt-1">
                    조정 후 잔액:{' '}
                    <span
                      className={
                        selectedMember.currentPoints + adjustPoints >= 0
                          ? 'text-blue-600'
                          : 'text-red-600'
                      }
                    >
                      {(selectedMember.currentPoints + adjustPoints).toLocaleString()}P
                    </span>
                  </p>
                )}
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">조정 사유</label>
                <Input
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="조정 사유를 입력하세요"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAdjustOpen(false)}>
              취소
            </Button>
            <Button
              onClick={handleSaveAdjust}
              disabled={adjustPoints === 0 || !adjustReason}
            >
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
