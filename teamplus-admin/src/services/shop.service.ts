/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * TEAMPLUS Shop Service
 * 쇼핑몰 관리 API 호출 (상품, 카테고리, 주문, 통계)
 */

import { api } from './api-client';
import { getApiErrorStatus, getApiErrorMessage } from "@/lib/api-error";
import {
  ShopProduct,
  ShopCategory,
  ShopOrder,
  ShopStats,
  CreateProductRequest,
  CreateOrderRequest,
  UpdateOrderStatusRequest,
  ProductFilterParams,
  OrderFilterParams,
  ImageUploadResponse,
  OrderStatus,
} from '../types';

// ==================== 카테고리 API ====================

/**
 * 카테고리 목록 조회
 */
export const getCategories = async (): Promise<ShopCategory[]> => {
  try {
    const categories = await api.get<ShopCategory[]>('/shop/categories');
    return categories;
  } catch (error: unknown) {
    console.error('[Shop Service] 카테고리 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '카테고리 목록을 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 카테고리 트리 구조 조회
 */
export const getCategoryTree = async (): Promise<ShopCategory[]> => {
  try {
    const categories = await api.get<ShopCategory[]>('/shop/categories/tree');
    return categories;
  } catch (error: unknown) {
    console.error('[Shop Service] 카테고리 트리 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '카테고리 트리를 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 카테고리 생성 (ADMIN 전용)
 */
export const createCategory = async (data: {
  name: string;
  description?: string;
  parentId?: string;
  displayOrder?: number;
  isActive?: boolean;
}): Promise<ShopCategory> => {
  try {
    const category = await api.post<ShopCategory>('/shop/categories', data);
    return category;
  } catch (error: unknown) {
    console.error('[Shop Service] 카테고리 생성 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '카테고리 생성에 실패했습니다.')
    );
  }
};

/**
 * 카테고리 수정 (ADMIN 전용)
 */
export const updateCategory = async (
  categoryId: string,
  data: Partial<{
    name: string;
    description?: string;
    parentId?: string;
    displayOrder?: number;
    isActive?: boolean;
  }>
): Promise<ShopCategory> => {
  try {
    const category = await api.put<ShopCategory>(`/shop/categories/${categoryId}`, data);
    return category;
  } catch (error: unknown) {
    console.error('[Shop Service] 카테고리 수정 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '카테고리 수정에 실패했습니다.')
    );
  }
};

/**
 * 카테고리 삭제 (ADMIN 전용)
 */
export const deleteCategory = async (categoryId: string): Promise<void> => {
  try {
    await api.delete(`/shop/categories/${categoryId}`);
  } catch (error: unknown) {
    console.error('[Shop Service] 카테고리 삭제 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '카테고리 삭제에 실패했습니다.')
    );
  }
};

// ==================== 상품 API ====================

/**
 * 상품 목록 조회
 */
export const getProducts = async (
  params?: ProductFilterParams
): Promise<ShopProduct[]> => {
  try {
    const products = await api.get<ShopProduct[]>('/shop/products', { params });
    return products;
  } catch (error: unknown) {
    console.error('[Shop Service] 상품 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '상품 목록을 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 상품 상세 조회
 */
export const getProduct = async (productId: string): Promise<ShopProduct> => {
  try {
    const product = await api.get<ShopProduct>(`/shop/products/${productId}`);
    return product;
  } catch (error: unknown) {
    console.error('[Shop Service] 상품 상세 조회 실패:', error);
    if (getApiErrorStatus(error) === 404) {
      throw new Error('상품을 찾을 수 없습니다.');
    }
    throw new Error(
      getApiErrorMessage(error, '상품 정보를 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 상품 생성 (ADMIN, COACH)
 */
export const createProduct = async (
  data: CreateProductRequest
): Promise<ShopProduct> => {
  try {
    const product = await api.post<ShopProduct>('/shop/products', data);
    return product;
  } catch (error: unknown) {
    console.error('[Shop Service] 상품 생성 실패:', error);
    if (getApiErrorStatus(error) === 403) {
      throw new Error('상품 등록 권한이 없습니다.');
    }
    throw new Error(
      getApiErrorMessage(error, '상품 등록에 실패했습니다.')
    );
  }
};

/**
 * 상품 수정 (ADMIN, COACH)
 */
export const updateProduct = async (
  productId: string,
  data: Partial<CreateProductRequest>
): Promise<ShopProduct> => {
  try {
    const product = await api.put<ShopProduct>(`/shop/products/${productId}`, data);
    return product;
  } catch (error: unknown) {
    console.error('[Shop Service] 상품 수정 실패:', error);
    if (getApiErrorStatus(error) === 403) {
      throw new Error('상품 수정 권한이 없습니다.');
    }
    throw new Error(
      getApiErrorMessage(error, '상품 수정에 실패했습니다.')
    );
  }
};

/**
 * 상품 삭제 (ADMIN, COACH)
 */
export const deleteProduct = async (productId: string): Promise<void> => {
  try {
    await api.delete(`/shop/products/${productId}`);
  } catch (error: unknown) {
    console.error('[Shop Service] 상품 삭제 실패:', error);
    if (getApiErrorStatus(error) === 403) {
      throw new Error('상품 삭제 권한이 없습니다.');
    }
    throw new Error(
      getApiErrorMessage(error, '상품 삭제에 실패했습니다.')
    );
  }
};

// ==================== 이미지 API ====================

/**
 * 이미지 업로드 — 통합 진입점 `POST /api/v1/files/upload` 사용
 *   (2026-05-23 — 기존 /shop/upload/image 대신 단일 FilesModule 진입점으로 통일.
 *    refType=shop_product 로 도메인 연결, 디스크는 uploads/image/{YYYY}/{MM}/{DD}/ 에 저장.)
 *
 * 응답 매핑: FilesController 가 반환하는 `{ url, originalName, ... }` (또는 `{ data: ... }`)
 * 를 기존 `ImageUploadResponse { url, filename }` 형태로 정규화하여 호출부 호환 유지.
 */
export const uploadImage = async (file: File): Promise<ImageUploadResponse> => {
  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', 'IMAGE');
    formData.append('refType', 'shop_product');

    const response = await api.post<unknown>('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    // api-client 가 `{ success, data }` 를 자동 해제하지만 안전망으로 양쪽 모두 대응.
    const raw = response as { url?: string; data?: { url?: string; originalName?: string }; originalName?: string };
    const uploaded = raw?.data ?? raw;
    const url = uploaded?.url;
    if (!url) {
      throw new Error('업로드 응답에 url 필드가 없습니다.');
    }
    return {
      url,
      filename: uploaded?.originalName ?? file.name,
    };
  } catch (error: unknown) {
    console.error('[Shop Service] 이미지 업로드 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '이미지 업로드에 실패했습니다.')
    );
  }
};

/**
 * 상품에 이미지 추가
 */
export const addProductImage = async (
  productId: string,
  data: { imageUrl: string; altText?: string }
): Promise<void> => {
  try {
    await api.post(`/shop/products/${productId}/images`, data);
  } catch (error: unknown) {
    console.error('[Shop Service] 상품 이미지 추가 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '이미지 추가에 실패했습니다.')
    );
  }
};

/**
 * 이미지 삭제
 */
export const deleteImage = async (imageId: string): Promise<void> => {
  try {
    await api.delete(`/shop/images/${imageId}`);
  } catch (error: unknown) {
    console.error('[Shop Service] 이미지 삭제 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '이미지 삭제에 실패했습니다.')
    );
  }
};

// ==================== 주문 API ====================

/**
 * 주문 목록 조회 (ADMIN, COACH)
 */
export const getOrders = async (
  params?: OrderFilterParams
): Promise<ShopOrder[]> => {
  try {
    const orders = await api.get<ShopOrder[]>('/shop/orders', { params });
    return orders;
  } catch (error: unknown) {
    console.error('[Shop Service] 주문 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '주문 목록을 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 내 주문 조회
 */
export const getMyOrders = async (
  params?: OrderFilterParams
): Promise<ShopOrder[]> => {
  try {
    const orders = await api.get<ShopOrder[]>('/shop/orders/my', { params });
    return orders;
  } catch (error: unknown) {
    console.error('[Shop Service] 내 주문 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '주문 목록을 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 주문 상세 조회
 */
export const getOrder = async (orderId: string): Promise<ShopOrder> => {
  try {
    const order = await api.get<ShopOrder>(`/shop/orders/${orderId}`);
    return order;
  } catch (error: unknown) {
    console.error('[Shop Service] 주문 상세 조회 실패:', error);
    if (getApiErrorStatus(error) === 404) {
      throw new Error('주문을 찾을 수 없습니다.');
    }
    throw new Error(
      getApiErrorMessage(error, '주문 정보를 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 주문 생성
 */
export const createOrder = async (
  data: CreateOrderRequest
): Promise<ShopOrder> => {
  try {
    const order = await api.post<ShopOrder>('/shop/orders', data);
    return order;
  } catch (error: unknown) {
    console.error('[Shop Service] 주문 생성 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '주문 생성에 실패했습니다.')
    );
  }
};

/**
 * 주문 상태 변경 (ADMIN, COACH)
 */
export const updateOrderStatus = async (
  orderId: string,
  data: UpdateOrderStatusRequest
): Promise<ShopOrder> => {
  try {
    const order = await api.patch<ShopOrder>(`/shop/orders/${orderId}/status`, data);
    return order;
  } catch (error: unknown) {
    console.error('[Shop Service] 주문 상태 변경 실패:', error);
    if (getApiErrorStatus(error) === 403) {
      throw new Error('주문 상태 변경 권한이 없습니다.');
    }
    throw new Error(
      getApiErrorMessage(error, '주문 상태 변경에 실패했습니다.')
    );
  }
};

/**
 * 주문 취소
 */
export const cancelOrder = async (orderId: string): Promise<ShopOrder> => {
  try {
    const order = await api.post<ShopOrder>(`/shop/orders/${orderId}/cancel`);
    return order;
  } catch (error: unknown) {
    console.error('[Shop Service] 주문 취소 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '주문 취소에 실패했습니다.')
    );
  }
};

// ==================== 배송 API ====================

/**
 * 배송 정책 (ShippingPolicy) 타입
 * Backend: prisma/schema.prisma `model ShippingPolicy`
 */
export interface ShippingPolicy {
  id: string;
  name: string;
  type: string;
  shippingFee: number;
  freeShippingThreshold: number | null;
  additionalFee: number;
  estimatedDays: string | null;
  regions: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 배송 정책 생성/수정 페이로드
 * Backend DTO: `CreateShippingPolicyDto` / `UpdateShippingPolicyDto`
 */
export interface ShippingPolicyPayload {
  name?: string;
  shippingFee?: number;
  freeShippingThreshold?: number;
  additionalFee?: number;
  estimatedDays?: string;
  isDefault?: boolean;
  isActive?: boolean;
}

/**
 * 배송 정책 목록 조회
 * GET /api/v1/shop/shipping/policies
 */
export const getShippingPolicies = async (): Promise<ShippingPolicy[]> => {
  try {
    const policies = await api.get<ShippingPolicy[]>('/shop/shipping/policies');
    return Array.isArray(policies) ? policies : [];
  } catch (error: unknown) {
    console.error('[Shop Service] 배송 정책 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '배송 정책을 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 배송 정책 생성 (ADMIN 전용)
 * POST /api/v1/shop/shipping/policies
 */
export const createShippingPolicy = async (
  payload: ShippingPolicyPayload
): Promise<ShippingPolicy> => {
  try {
    const policy = await api.post<ShippingPolicy>('/shop/shipping/policies', payload);
    return policy;
  } catch (error: unknown) {
    console.error('[Shop Service] 배송 정책 생성 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '배송 정책 생성에 실패했습니다.')
    );
  }
};

/**
 * 배송 정책 수정 (ADMIN 전용)
 * PUT /api/v1/shop/shipping/policies/:policyId
 */
export const updateShippingPolicy = async (
  policyId: string,
  payload: ShippingPolicyPayload
): Promise<ShippingPolicy> => {
  try {
    const policy = await api.put<ShippingPolicy>(
      `/shop/shipping/policies/${policyId}`,
      payload
    );
    return policy;
  } catch (error: unknown) {
    console.error('[Shop Service] 배송 정책 수정 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '배송 정책 수정에 실패했습니다.')
    );
  }
};

/**
 * 배송 정책 삭제 (ADMIN 전용)
 * DELETE /api/v1/shop/shipping/policies/:policyId
 */
export const deleteShippingPolicy = async (policyId: string): Promise<void> => {
  try {
    await api.delete(`/shop/shipping/policies/${policyId}`);
  } catch (error: unknown) {
    console.error('[Shop Service] 배송 정책 삭제 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '배송 정책 삭제에 실패했습니다.')
    );
  }
};

/**
 * 택배사 목록 조회
 */
export const getCouriers = async (): Promise<{ code: string; name: string }[]> => {
  try {
    const couriers = await api.get<{ code: string; name: string }[]>('/shop/shipping/couriers');
    return couriers;
  } catch (error: unknown) {
    console.error('[Shop Service] 택배사 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '택배사 목록을 불러오는 데 실패했습니다.')
    );
  }
};

/**
 * 배송 추적
 */
export const trackShipping = async (trackingNumber: string): Promise<any> => {
  try {
    const tracking = await api.get<any>(`/shop/shipping/tracking/${trackingNumber}`);
    return tracking;
  } catch (error: unknown) {
    console.error('[Shop Service] 배송 추적 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '배송 추적에 실패했습니다.')
    );
  }
};

// ==================== 통계 API ====================

/**
 * 쇼핑몰 통계 조회 (ADMIN, COACH)
 */
export const getStats = async (): Promise<ShopStats> => {
  try {
    const stats = await api.get<ShopStats>('/shop/stats/overview');
    return stats;
  } catch (error: unknown) {
    console.error('[Shop Service] 통계 조회 실패:', error);
    throw new Error(
      getApiErrorMessage(error, '통계를 불러오는 데 실패했습니다.')
    );
  }
};

// ==================== 헬퍼 함수 ====================

/**
 * 주문 상태 한글 변환
 */
export const getOrderStatusLabel = (status: OrderStatus): string => {
  const labels: Record<OrderStatus, string> = {
    [OrderStatus.PENDING]: '결제 대기',
    [OrderStatus.PAID]: '결제 완료',
    [OrderStatus.PREPARING]: '상품 준비중',
    [OrderStatus.SHIPPED]: '배송중',
    [OrderStatus.DELIVERED]: '배송 완료',
    [OrderStatus.CANCELLED]: '주문 취소',
    [OrderStatus.REFUNDED]: '환불 완료',
  };
  return labels[status] || status;
};

/**
 * 주문 상태 색상 클래스
 */
export const getOrderStatusColor = (status: OrderStatus): string => {
  const colors: Record<OrderStatus, string> = {
    [OrderStatus.PENDING]: 'bg-yellow-100 text-yellow-800',
    [OrderStatus.PAID]: 'bg-blue-100 text-blue-800',
    [OrderStatus.PREPARING]: 'bg-purple-100 text-purple-800',
    [OrderStatus.SHIPPED]: 'bg-cyan-100 text-cyan-800',
    [OrderStatus.DELIVERED]: 'bg-green-100 text-green-800',
    [OrderStatus.CANCELLED]: 'bg-red-100 text-red-800',
    [OrderStatus.REFUNDED]: 'bg-gray-100 text-gray-800',
  };
  return colors[status] || 'bg-gray-100 text-gray-800';
};

/**
 * Shop Service Export
 */
export const shopService = {
  // 카테고리
  getCategories,
  getCategoryTree,
  createCategory,
  updateCategory,
  deleteCategory,
  // 상품
  getProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  // 이미지
  uploadImage,
  addProductImage,
  deleteImage,
  // 주문
  getOrders,
  getMyOrders,
  getOrder,
  createOrder,
  updateOrderStatus,
  cancelOrder,
  // 배송
  getShippingPolicies,
  createShippingPolicy,
  updateShippingPolicy,
  deleteShippingPolicy,
  getCouriers,
  trackShipping,
  // 통계
  getStats,
  // 헬퍼
  getOrderStatusLabel,
  getOrderStatusColor,
};

export default shopService;
/* eslint-disable @typescript-eslint/no-explicit-any */
