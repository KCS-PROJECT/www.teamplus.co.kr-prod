/**
 * 오픈클래스 프로모션 타입 정의
 */

export enum PromotionStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export enum DiscountType {
  FIXED = 'fixed',
  PERCENTAGE = 'percentage',
}

export interface AcademyPromotion {
  id: string;
  title: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number;
  startDate: string;
  endDate?: string;
  status: PromotionStatus;
  targetUserType?: string[];
  maxUsageCount?: number;
  currentUsageCount: number;
  clubId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAcademyPromotionRequest {
  title: string;
  description?: string;
  discountType: DiscountType;
  discountValue: number;
  startDate: string;
  endDate?: string;
  targetUserType?: string[];
  maxUsageCount?: number;
  clubId?: string;
}

export interface UpdateAcademyPromotionRequest
  extends Partial<CreateAcademyPromotionRequest> {
  status?: PromotionStatus;
}

export interface PromotionFilterParams {
  status?: PromotionStatus;
  clubId?: string;
  page?: number;
  pageSize?: number;
}
