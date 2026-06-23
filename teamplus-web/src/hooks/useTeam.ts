'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '@/services/api-client';

interface TeamInfo {
  name: string;
  code: string;
  description: string;
  memberCount: number;
  establishedYear: number;
  rink: string;
}

interface Coach {
  id: number;
  name: string;
  role: string;
  career: string;
}

interface TeamMember {
  id: number;
  name: string;
  age: number;
  position: string;
  level: string;
}

interface TeamSchedule {
  id: number;
  date: string;
  day: string;
  time: string;
  title: string;
  location: string;
  type: 'training' | 'match';
}

// ─── 백엔드 clubs API 응답 타입 ──────────────────────────
interface ClubListItem {
  id: string;
  clubCode: string;
  clubName: string;
  coachName: string;
  location: string;
  role: string;
  joinedAt: string;
}

interface ClubDetail {
  id: string;
  clubCode: string;
  clubName: string;
  description?: string;
  location: string;
  establishedYear?: number;
  members?: Array<{
    id: string;
    playerName: string;
    playerAge: number;
    approvalStatus: string;
  }>;
  coaches?: Array<{
    id: string;
    coachName: string;
    role?: string;
    career?: string;
  }>;
  schedules?: Array<{
    id: string;
    scheduledAt: string;
    title: string;
    location: string;
    type?: string;
  }>;
}

// ─── 요일 변환 ────────────────────────────────────────────
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function formatScheduleDate(iso: string): { date: string; day: string; time: string } {
  const d = new Date(iso);
  return {
    date: iso.slice(0, 10),
    day: DAY_LABELS[d.getDay()],
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
}

export function useTeam() {
  const [teamInfo, setTeamInfo] = useState<TeamInfo | null>(null);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [schedules, setSchedules] = useState<TeamSchedule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTeamData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // 1) 내가 속한 팀 목록 조회
      const listRes = await apiRequest<ClubListItem[]>({
        method: 'GET',
        url: '/teams/my/list',
        retry: false,
      });

      if (!listRes.success || !listRes.data?.length) {
        // 팀 없음 또는 API 오류 → 빈 상태
        setTeamInfo(null);
        setCoaches([]);
        setMembers([]);
        setSchedules([]);
        if (!listRes.success) {
          setError(listRes.error?.message ?? '팀 정보를 불러올 수 없습니다.');
        }
        return;
      }

      // 첫 번째 팀을 메인 팀으로 사용
      const firstClub = listRes.data[0];

      // 2) 팀 상세 정보 조회
      const detailRes = await apiRequest<ClubDetail>({
        method: 'GET',
        url: `/teams/${firstClub.id}`,
        retry: false,
      });

      if (detailRes.success && detailRes.data) {
        const club = detailRes.data;

        setTeamInfo({
          name: club.clubName,
          code: club.clubCode,
          description: club.description ?? '',
          memberCount: club.members?.filter((m) => m.approvalStatus === 'APPROVED').length ?? 0,
          establishedYear: club.establishedYear ?? new Date().getFullYear(),
          rink: club.location,
        });

        // 코치 매핑
        setCoaches(
          (club.coaches ?? []).map((c, i) => ({
            id: i + 1,
            name: c.coachName,
            role: c.role ?? '코치',
            career: c.career ?? '',
          }))
        );

        // 승인된 멤버 매핑
        setMembers(
          (club.members ?? [])
            .filter((m) => m.approvalStatus === 'APPROVED')
            .map((m, i) => ({
              id: i + 1,
              name: m.playerName,
              age: m.playerAge,
              position: '-',
              level: '-',
            }))
        );

        // 일정 매핑
        setSchedules(
          (club.schedules ?? []).map((s, i) => {
            const { date, day, time } = formatScheduleDate(s.scheduledAt);
            return {
              id: i + 1,
              date,
              day,
              time: `${time} -`,
              title: s.title,
              location: s.location,
              type: s.type === 'match' ? 'match' : 'training',
            };
          })
        );
      } else {
        // 상세 API 실패 시 목록 데이터로 기본 정보만 표시
        setTeamInfo({
          name: firstClub.clubName,
          code: firstClub.clubCode,
          description: '',
          memberCount: 0,
          establishedYear: new Date().getFullYear(),
          rink: firstClub.location,
        });
        setCoaches([]);
        setMembers([]);
        setSchedules([]);
      }
    } catch {
      setError('네트워크 연결을 확인해주세요.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeamData();
  }, [fetchTeamData]);

  return {
    teamInfo,
    coaches,
    members,
    schedules,
    isLoading,
    error,
    refresh: fetchTeamData,
  };
}
