/**
 * User Report Service (UGC 신고 관리)
 * 정보통신망법 §44조의2 + 앱마켓 UGC 심사 대응 — 신고 접수 → 조치 루프의 운영자측 API.
 *
 * ⚠️ 이 파일의 타입은 백엔드 소스를 직접 읽고 1:1 로 맞춘 것이다 (추측 금지).
 *   - teamplus-backend/src/user-safety/user-safety.controller.ts (136 / 158 / 169행)
 *   - teamplus-backend/src/user-safety/user-safety.service.ts    (getAdminReports / getAdminReportDetail / resolveReport)
 *   - teamplus-backend/prisma/schema.prisma                      (model UserReport)
 *
 * baseURL(env.NEXT_PUBLIC_API_URL)에 이미 `/api/v1` 이 포함되므로 path 는 `/admin/reports` 부터.
 *
 * 엔드포인트 (모두 @Roles("ADMIN","DIRECTOR"))
 *   GET   /admin/reports        신고 목록 (status/category/page/limit)
 *   GET   /admin/reports/:id    신고 상세
 *   PATCH /admin/reports/:id    신고 처리 (status/adminNote)
 *
 * ─── 백엔드 API 제약 (화면에서 우회하지 않고 그대로 노출) ───────────────
 * 1. 목록 필터는 `status` · `category` 뿐이다. `targetType` · 기간(from/to) 필터는 미지원.
 *    → 서버 페이지네이션과 함께 클라이언트 필터를 섞으면 "현재 페이지만 걸러진" 잘못된 결과가
 *      나오므로 구현하지 않는다.
 * 2. 상태 카운트 전용 엔드포인트가 없다. → limit=1 로 status 별 `total` 만 병렬 조회한다.
 * 3. PATCH 가 받는 status 는 `resolved | rejected` 뿐이다 (controller 시그니처).
 *    `reviewing`(검토중) 전이는 백엔드 미지원 → 화면에서도 제공하지 않는다.
 *    (단, 이미 reviewing 인 데이터는 목록/상세에서 정상 표시한다.)
 * 4. UserReport 모델에 처리자(resolvedBy) 컬럼이 없다 → "처리자" 표시 불가. 처리일시로 대체.
 */

import { api } from './api-client';
import { getApiErrorMessage } from '@/lib/api-error';

// ==================== 타입 (백엔드 1:1) ====================

/** 신고 대상 유형 — schema.prisma `UserReport.targetType` 주석과 1:1 */
export type ReportTargetType =
  | 'user'
  | 'chat_message'
  | 'pickup_match'
  | 'review'
  | 'notice';

/** 신고 사유 카테고리 — schema.prisma `UserReport.category` 주석과 1:1 */
export type ReportCategory =
  | 'spam'
  | 'harassment'
  | 'inappropriate'
  | 'fake_profile'
  | 'other';

/** 신고 처리 상태 — schema.prisma `UserReport.status` 주석과 1:1 */
export type ReportStatus = 'pending' | 'reviewing' | 'resolved' | 'rejected';

/** PATCH 로 전이 가능한 상태 — controller `resolveReport` 시그니처와 1:1 */
export type ReportResolveStatus = Extract<
  ReportStatus,
  'resolved' | 'rejected'
>;

/**
 * 목록 행 — `user-safety.service.ts` getAdminReports 의 `items.map()` 결과와 1:1.
 * (목록은 reporter/reported 를 `{ id, name }` 로 평탄화해서 내려준다 — 상세와 형태가 다름)
 */
export interface UserReportListItem {
  id: string;
  targetType: string;
  /** 콘텐츠 신고 시 대상 리소스 ID (사용자 신고면 null) */
  targetId: string | null;
  category: string;
  status: string;
  createdAt: string;
  reporter: { id: string; name: string };
  reported: { id: string; name: string };
}

/** 목록 응답 — getAdminReports 반환값과 1:1 */
export interface UserReportListResponse {
  items: UserReportListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** 상세의 사용자 정보 — getAdminReportDetail 의 prisma select 와 1:1 (목록과 달리 name 필드 없음) */
export interface UserReportPerson {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

/** 상세 응답 — getAdminReportDetail 의 prisma select 와 1:1 */
export interface UserReportDetail {
  id: string;
  targetType: string;
  targetId: string | null;
  category: string;
  description: string | null;
  status: string;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  reporter: UserReportPerson;
  reported: UserReportPerson;
}

/** 처리 응답 — resolveReport 반환값과 1:1 */
export interface ResolveReportResponse {
  success: boolean;
  id: string;
  status: string;
  resolvedAt: string | null;
}

/** 목록 조회 파라미터 — controller `getAdminReports` @Query 와 1:1 */
export interface UserReportListParams {
  status?: ReportStatus;
  category?: ReportCategory;
  page?: number;
  /** 백엔드에서 Math.min(limit, 100) 로 클램프됨 */
  limit?: number;
}

/** 처리 요청 바디 — controller `resolveReport` @Body 와 1:1 */
export interface ResolveReportRequest {
  status: ReportResolveStatus;
  adminNote?: string;
}

/** 상태별 미처리 현황 (전용 API 없음 → status 별 total 집계) */
export interface UserReportStats {
  total: number;
  pending: number;
  reviewing: number;
  resolved: number;
  rejected: number;
}

const BASE = '/admin/reports';

// ==================== API ====================

/** 신고 목록 조회 */
export const getUserReports = async (
  params?: UserReportListParams,
): Promise<UserReportListResponse> => {
  try {
    return await api.get<UserReportListResponse>(BASE, { params });
  } catch (error: unknown) {
    console.error('[UserReport Service] 목록 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '신고 목록을 불러오는 데 실패했습니다.'),
    );
  }
};

/** 신고 상세 조회 */
export const getUserReport = async (id: string): Promise<UserReportDetail> => {
  try {
    return await api.get<UserReportDetail>(`${BASE}/${id}`);
  } catch (error: unknown) {
    console.error('[UserReport Service] 상세 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '신고 상세를 불러오는 데 실패했습니다.'),
    );
  }
};

/**
 * 신고 처리 (resolved / rejected)
 * adminNote(처리 사유)는 백엔드에서 optional 이지만, 분쟁 대응을 위해 화면에서 필수로 강제한다.
 */
export const resolveUserReport = async (
  id: string,
  data: ResolveReportRequest,
): Promise<ResolveReportResponse> => {
  try {
    return await api.patch<ResolveReportResponse>(`${BASE}/${id}`, data);
  } catch (error: unknown) {
    console.error('[UserReport Service] 처리 실패:', error);
    throw new Error(getApiErrorMessage(error, '신고 처리에 실패했습니다.'));
  }
};

/**
 * 상태별 건수 집계.
 * 백엔드에 stats 엔드포인트가 없어서 `limit=1` 로 status 별 `total` 만 병렬 조회한다.
 * (items 는 최대 1건만 전송되므로 전송량 부담이 작다)
 */
export const getUserReportStats = async (): Promise<UserReportStats> => {
  const STATUSES: ReportStatus[] = [
    'pending',
    'reviewing',
    'resolved',
    'rejected',
  ];
  try {
    const [all, ...byStatus] = await Promise.all([
      api.get<UserReportListResponse>(BASE, { params: { page: 1, limit: 1 } }),
      ...STATUSES.map((status) =>
        api.get<UserReportListResponse>(BASE, {
          params: { status, page: 1, limit: 1 },
        }),
      ),
    ]);

    return {
      total: all?.total ?? 0,
      pending: byStatus[0]?.total ?? 0,
      reviewing: byStatus[1]?.total ?? 0,
      resolved: byStatus[2]?.total ?? 0,
      rejected: byStatus[3]?.total ?? 0,
    };
  } catch (error: unknown) {
    console.error('[UserReport Service] 통계 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '신고 현황을 불러오는 데 실패했습니다.'),
    );
  }
};

/** 통합 서비스 객체 */
export const userReportService = {
  list: getUserReports,
  get: getUserReport,
  resolve: resolveUserReport,
  getStats: getUserReportStats,
};

export default userReportService;
