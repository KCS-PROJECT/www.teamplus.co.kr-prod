import { api } from './api-client';
import type { ScheduleItemProps } from '@/components/dashboard/ScheduleItem';
import type { PendingMemberItemProps } from '@/components/dashboard/PendingMemberItem';
import type { CoachProgress } from '@/components/dashboard/CoachProgressItem';
import type { UpcomingEvent } from '@/components/dashboard/DirectorEventItem';
import type { TodoItem } from '@/components/coach/TodoList';
import type { StudentInfo } from '@/components/coach/NextClassDetail';

// ============================================
// 코치 다음 수업 상세 데이터 타입
// (순환 참조 방지를 위해 서비스 레이어에 정의)
// ============================================
export interface NextClassDetailData {
  time: string;
  title: string;
  students: StudentInfo[];
  totalStudents: number;
}

// ============================================
// 학부모 대시보드 API 응답 타입
// ============================================
export interface ParentDashboardApiData {
  parentName?: string;
  name?: string;
  creditData?: { current: number; expiryDate: string };
  credits?: number;
  credit?: number;
  expiryDate?: string;
  nextClass?: {
    tag: string;
    title: string;
    time: string;
    teacher: string;
    imageUrl?: string;
  };
  upcomingSchedules?: Array<Record<string, unknown>>;
  upcomingClasses?: Array<Record<string, unknown>>;
  recentActivities?: Array<{
    icon: string;
    text: string;
    time: string;
    iconColor: string;
  }>;
  children?: Array<{
    id: string;
    name: string;
    grade: string;
    attendanceRate: number;
    nextClass: string;
    nextClassTime: string;
    profileEmoji: string;
    remainingCredits: number;
  }>;
  weeklyAttendance?: Array<{
    date: string;
    dayLabel: string;
    attended: boolean;
  }>;
  notices?: Array<{
    id: string;
    title: string;
    date: string;
    isNew: boolean;
  }>;
}

// ============================================
// 코치 대시보드 API 응답 타입
// ============================================
export interface CoachDashboardApiData {
  coachName?: string;
  name?: string;
  stats?: {
    todayClasses?: number;
    nextClassTime?: string;
    pendingApprovals?: number;
    monthlyAttendance?: number;
    attendanceTrend?: string;
    totalMembers?: number;
    newMembers?: number;
    attendanceCount?: number;
    attendanceTotal?: number;
  };
  schedules?: ScheduleItemProps[];
  pendingMembers?: Omit<PendingMemberItemProps, 'onApprove' | 'onReject'>[];
  todoItems?: TodoItem[];
  nextClassDetail?: NextClassDetailData;
}

// ============================================
// 감독 대시보드 API 응답 타입
// ============================================
export interface DirectorDashboardApiData {
  directorName?: string;
  name?: string;
  stats?: {
    attendanceRate?: number;
    attendanceChange?: number;
    totalMembers?: number;
    presentMembers?: number;
    absentMembers?: number;
    trainingRate?: number;
    trainingChange?: number;
  };
  coaches?: CoachProgress[];
  events?: UpcomingEvent[];
}

/**
 * 대시보드 관련 API 서비스
 * api 객체를 사용하여 Native Bridge 자동 분기 지원
 */
export const dashboardService = {
  /**
   * 학부모 대시보드 데이터 조회
   */
  async getParentDashboard() {
    return api.get<ParentDashboardApiData>('/dashboard/parent');
  },

  /**
   * 코치 대시보드 데이터 조회
   */
  async getCoachDashboard() {
    return api.get<CoachDashboardApiData>('/dashboard/coach');
  },

  /**
   * 감독 대시보드 데이터 조회
   */
  async getDirectorDashboard() {
    return api.get<DirectorDashboardApiData>('/dashboard/director');
  },

  /**
   * 어린이(CHILD) 대시보드 데이터 조회
   */
  async getChildDashboard() {
    return api.get('/dashboard/child');
  },

  /**
   * 학생(TEEN) 대시보드 데이터 조회
   */
  async getTeenDashboard() {
    return api.get('/dashboard/teen');
  },
};
