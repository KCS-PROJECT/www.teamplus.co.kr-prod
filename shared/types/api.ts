/**
 * TEAMPLUS 공통 API 타입 정의
 * Web, Admin, App에서 공통으로 사용하는 API 응답/요청 타입
 */

import type { ErrorCodeType } from './error-codes';

// ==================== API 응답 ====================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  message?: string;
}

export interface ApiError {
  code: ErrorCodeType | string;
  message: string;
  statusCode?: number;
  details?: Record<string, unknown>;
}

// ==================== 페이지네이션 ====================

export interface PaginationRequest {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// ==================== 기본 엔티티 ====================

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt?: string;
}
