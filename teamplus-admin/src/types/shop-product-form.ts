// 상품 등록/수정 폼 공유 타입 (C-4 중복 제거 · 2026-06-07)
// products/new · products/[id]/edit 양쪽에서 사용.

export interface ProductImage {
  id: string;
  url: string;
  isMain: boolean;
  file?: File;
  isUploading?: boolean; // new 전용(업로드 중) — edit 미사용(optional)
  isExternal?: boolean;
}

export interface ProductOption {
  id: string;
  name: string;
  value: string;
  additionalPrice: number;
  stock: number;
  isActive: boolean;
}
