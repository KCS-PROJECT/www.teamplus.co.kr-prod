/**
 * class-product.service.ts (2026-05-22 신규 · v2 통합 엔드포인트)
 *
 * 수업 패키지(ClassProduct) CRUD 호출 래퍼. classId 만으로 owner 자동 판별
 * (Class.teamId 우선 → academyId). 백엔드 엔드포인트:
 *   GET    /api/v1/classes/:classId/products
 *   POST   /api/v1/classes/:classId/products            (COACH/DIRECTOR/ACADEMY_DIRECTOR/ADMIN)
 *   PATCH  /api/v1/classes/:classId/products/:productId (COACH/DIRECTOR/ACADEMY_DIRECTOR/ADMIN)
 *   DELETE /api/v1/classes/:classId/products/:productId (COACH/DIRECTOR/ACADEMY_DIRECTOR/ADMIN)
 *
 * GET 응답에는 PACKAGE_END_GUARD 계산 필드(isPurchasable, classEndDate,
 * expectedExpiresAt, disabledReason)가 포함된다.
 *
 * 기존 `/teams/:teamId/classes/:classId/products` 경로는 deprecated (오픈클래스 비호환).
 */
import { api } from "./api-client";

export interface ClassProductDto {
  id: string;
  productName: string;
  description?: string | null;
  price: number;
  sessionsPerMonth: number;
  durationDays?: number | null;
  feeType?: string;
  feePerSession?: number | null;
  sessionsPerWeek?: number | null;
  billingTiming?: string;
  isActive: boolean;
  createdAt?: string;
  // PACKAGE_END_GUARD 계산 필드 (백엔드 주입)
  isPurchasable: boolean;
  classEndDate: string | null;
  expectedExpiresAt: string | null;
  disabledReason: string | null;
}

export interface CreateClassProductInput {
  productName: string;
  description?: string;
  price: number;
  sessionsPerMonth: number;
  durationDays?: number;
  // 2026-05-22 옵션 H — PackageEditSheet 자동 변환 결과 명시.
  feeType?: string;
  sessionsPerWeek?: number;
}

export interface UpdateClassProductInput {
  productName?: string;
  description?: string;
  price?: number;
  sessionsPerMonth?: number;
  durationDays?: number;
  sessionsPerWeek?: number;
  feePerSession?: number;
  isActive?: boolean;
  feeType?: string;
}

export interface DeleteClassProductResponse {
  id: string;
  deleted: "hard" | "soft";
}

export interface BulkUpsertItem {
  /** 없으면 create, 있으면 update */
  id?: string;
  productName: string;
  price: number;
  feeType: string;
  sessionsPerMonth: number;
  sessionsPerWeek?: number;
  durationDays?: number;
  description?: string;
}

export interface BulkUpsertClassProductsBody {
  upserts: BulkUpsertItem[];
  deleteIds: string[];
}

function buildBase(classId: string): string {
  return `/classes/${classId}/products`;
}

export async function listClassProducts(
  classId: string,
): Promise<ClassProductDto[]> {
  const res = await api.get<ClassProductDto[]>(buildBase(classId));
  if (!res.success || !Array.isArray(res.data)) return [];
  return res.data;
}

export async function createClassProduct(
  classId: string,
  input: CreateClassProductInput,
): Promise<ClassProductDto | null> {
  const res = await api.post<ClassProductDto>(buildBase(classId), input);
  return res.success && res.data ? res.data : null;
}

export async function updateClassProduct(
  classId: string,
  productId: string,
  input: UpdateClassProductInput,
): Promise<ClassProductDto | null> {
  const res = await api.patch<ClassProductDto>(
    `${buildBase(classId)}/${productId}`,
    input,
  );
  return res.success && res.data ? res.data : null;
}

export async function deleteClassProduct(
  classId: string,
  productId: string,
): Promise<DeleteClassProductResponse | null> {
  const res = await api.delete<DeleteClassProductResponse>(
    `${buildBase(classId)}/${productId}`,
  );
  return res.success && res.data ? res.data : null;
}

/**
 * '수정하기' 클릭 시 패키지 추가/수정/삭제를 한 번에 반영하는 일괄 엔드포인트.
 * 백엔드는 단일 트랜잭션으로 처리하며 갱신 후 전체 패키지 배열(계산필드 포함)을 반환한다.
 * 빈 입력은 no-op로 현재 목록을 반환한다.
 */
export async function bulkUpsertClassProducts(
  classId: string,
  body: BulkUpsertClassProductsBody,
): Promise<ClassProductDto[] | null> {
  const res = await api.put<ClassProductDto[]>(
    `${buildBase(classId)}/bulk`,
    body,
  );
  return res.success && Array.isArray(res.data) ? res.data : null;
}
