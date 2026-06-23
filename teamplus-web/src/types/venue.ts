/**
 * 구장(Venue) 타입 정의
 * - 백엔드 `VenuesController` DTO / `VENUE_PUBLIC_SELECT` 와 1:1 동기화
 * - 경로: /Users/doseunghyeon/developerApp/flutter_dev/www.teamplus.com/teamplus-backend/src/venues/
 */

export type VenueStatus = "active" | "maintenance" | "closed";

export type VenueAmenity =
  | "locker_room"
  | "shower"
  | "parking"
  | "stand"
  | "cafe"
  | "pro_shop"
  | "rental"
  | "kids_room";

export interface VenueOperatingHours {
  open: string; // "HH:mm"
  close: string; // "HH:mm"
}

/**
 * 공개 조회용 구장 정보 (venues.service.ts VENUE_PUBLIC_SELECT 와 동일)
 * 숫자형 Prisma.Decimal 은 JSON 직렬화 시 string 으로 내려오므로 string | number 로 관용 처리
 */
export interface Venue {
  id: string;
  clubId: string | null;
  name: string;
  address: string | null;
  addressDetail: string | null;
  city: string | null;
  zipCode: string | null;
  phone: string | null;
  latitude: string | number | null;
  longitude: string | number | null;
  capacity: number | null;
  rinkSize: string | null;
  amenities: VenueAmenity[] | null;
  operatingHours: VenueOperatingHours | null;
  status: VenueStatus;
  imageUrl: string | null;
  hourlyRate: number | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VenueListResponse {
  data: Venue[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** 생성/수정 요청 DTO (백엔드 CreateVenueDto / UpdateVenueDto 매칭) */
export interface VenuePayload {
  name: string;
  address?: string | null;
  addressDetail?: string | null;
  city?: string | null;
  zipCode?: string | null;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  capacity?: number | null;
  rinkSize?: string | null;
  amenities?: VenueAmenity[] | null;
  operatingHours?: VenueOperatingHours | null;
  status?: VenueStatus;
  imageUrl?: string | null;
  hourlyRate?: number | null;
  clubId?: string | null;
  description?: string | null;
}

/** 역할 기반 권한 (프론트 게이트) */
export interface VenuePermissions {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canToggleStatus: boolean;
  canUploadImage: boolean;
  canViewManage: boolean;
}

/** 시설 표시용 메타 */
export interface FacilityMeta {
  key: VenueAmenity;
  icon: string;
  labelKey: VenueAmenity;
}

export const FACILITY_META: readonly FacilityMeta[] = [
  { key: "locker_room", icon: "checkroom", labelKey: "locker_room" },
  { key: "shower", icon: "shower", labelKey: "shower" },
  { key: "parking", icon: "local_parking", labelKey: "parking" },
  { key: "stand", icon: "stadium", labelKey: "stand" },
  { key: "cafe", icon: "local_cafe", labelKey: "cafe" },
  { key: "pro_shop", icon: "storefront", labelKey: "pro_shop" },
  { key: "rental", icon: "sports_hockey", labelKey: "rental" },
  { key: "kids_room", icon: "child_care", labelKey: "kids_room" },
] as const;
