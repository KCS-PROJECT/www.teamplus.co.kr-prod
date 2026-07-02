/**
 * Statistics Service — 감독 매출 리포트 데이터 계층
 *
 * 전략: Backend `GET /api/v1/statistics/director/revenue` 실데이터 연동.
 *       - 매출 인식 = 수납(결제완료) 기준
 *       - 선불(Payment) · 후불(MonthlyPostpaidBillingLine) 이중카운트는 백엔드 필터로 방지
 *       - 팀 격리(managedTeamIds)는 백엔드가 req.user 로 해석 (프론트는 teamId 미전달)
 *       - mock/fallback 없음 — 실패·빈 데이터는 화면에서 EmptyChart/빈 상태로 처리
 *
 * 계약 SoT: 백엔드 반환 객체와 `DirectorRevenueResponse` 는 1:1 동일해야 한다.
 */

import { api } from '@/services/api-client';
import type { ApiResponse } from '@/types/api';

// ─── Types (계약 SoT — Phase 3.5 대조 기준) ──────────
export type RevenueScope = 'month' | 'year';
// 프론트 로컬 세그먼트 (요청 파라미터 아님 — 백엔드는 항상 prepaid+postpaid 양쪽 반환)
export type RevenueSegment = 'all' | 'prepaid' | 'postpaid';
export type BillingMode = 'PREPAID' | 'POSTPAID' | 'BOTH';

export interface RevenueHero {
  totalRevenue: number; // 선택 기간 수납 총액 (prepaid + postpaid), ₩
  prepaidRevenue: number; // 선택 기간 선불 수납
  postpaidRevenue: number; // 선택 기간 후불 수납(paid)
  deltaAmount: number; // 이전 동일 기간 대비 증감액 (월간=전월비, 연간=전년비)
  deltaRate: number | null; // 증감률(%) — 이전 기간 0이면 null
  outstanding: number; // 현재 미수금 (기간 무관 pending 합), ₩
}

export interface RevenueSeriesPoint {
  bucket: string; // 'YYYY-MM'
  label: string; // 'M월' (월간·연간 모두 월 라벨)
  prepaid: number; // 버킷 선불 수납
  postpaid: number; // 버킷 후불 수납(paid)
  isCurrent: boolean; // 선택 anchor 버킷 강조 (월간 스코프에서 anchor월 true)
}

export interface RevenueClassLine {
  classId: string;
  className: string;
  billingMode: BillingMode;
  prepaid: number; // 선택 기간 해당 수업 선불 수납
  postpaid: number; // 선택 기간 해당 수업 후불 수납(paid)
  total: number; // prepaid + postpaid
}

export interface PostpaidStatus {
  hasPostpaid: boolean; // 팀에 POSTPAID/BOTH 수업 존재 → false면 섹션 숨김
  billed: number; // 기준 기간 후불 청구 총액 (paid + pending)
  collected: number; // 수납 (paid)
  outstanding: number; // 미수 (pending)
  outstandingPrevious: number; // 선택 기간 시작 이전 정산월의 미수 합 (과거분 안내)
  periodLabel: string; // '2026년 6월' | '2026년'
}

export interface RevenueMemberTrendPoint {
  month: string; // 'YYYY-MM'
  label: string; // 'M월'
  joined: number;
  left: number;
  total: number; // 버킷말 누적 활성 회원 수
}

export interface RevenueMemberSummary {
  totalMembers: number; // 현재 활성 회원 수
  newMembers: number; // 선택 기간 신규 가입 수
}

export interface DirectorRevenueResponse {
  scope: RevenueScope;
  anchor: string; // 'YYYY-MM' | 'YYYY'
  periodLabel: string; // '2026년 6월' | '2026년'
  hasManagedTeams: boolean; // false면 전 섹션 빈 상태
  hero: RevenueHero;
  series: RevenueSeriesPoint[]; // 월간 6개 / 연간 12개
  classRevenue: RevenueClassLine[]; // 매출 내림차순 (백엔드 정렬 권장, 프론트 재정렬 무해)
  postpaidStatus: PostpaidStatus;
  memberSummary: RevenueMemberSummary;
  memberTrend: RevenueMemberTrendPoint[]; // 월간 6개 / 연간 12개
}

// ─── Public API ─────────────────────────────────────

/**
 * 감독 매출 리포트 조회
 * @param scope - 'month' | 'year'
 * @param anchor - 'YYYY-MM'(월간) | 'YYYY'(연간)
 */
export async function getDirectorRevenue(
  scope: RevenueScope,
  anchor: string,
): Promise<ApiResponse<DirectorRevenueResponse>> {
  const query = `scope=${encodeURIComponent(scope)}&anchor=${encodeURIComponent(anchor)}`;
  return api.get<DirectorRevenueResponse>(`/statistics/director/revenue?${query}`);
}
