// 상품 등록/수정 폼 공유 상태 훅 (C-4 중복 제거 · 2026-06-07)
// products/new · products/[id]/edit 의 동일한 이미지/옵션 state + 핸들러를 단일화.
import { useState } from "react";
import type { ProductImage, ProductOption } from "@/types/shop-product-form";

interface NewOptionInput {
  name: string;
  value: string;
  additionalPrice: number;
  stock: number;
}

export function useProductFormState() {
  const [images, setImages] = useState<ProductImage[]>([]);
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [newOption, setNewOption] = useState<NewOptionInput>({
    name: "",
    value: "",
    additionalPrice: 0,
    stock: 0,
  });

  const setMainImage = (imageId: string) => {
    setImages((prev) =>
      prev.map((img) => ({ ...img, isMain: img.id === imageId })),
    );
  };

  const removeImage = (imageId: string) => {
    setImages((prev) => {
      const filtered = prev.filter((img) => img.id !== imageId);
      if (filtered.length > 0 && !filtered.some((img) => img.isMain)) {
        filtered[0].isMain = true;
      }
      return filtered;
    });
  };

  const addOption = () => {
    if (!newOption.name || !newOption.value) return;
    const option: ProductOption = {
      id: `opt-${Date.now()}`,
      name: newOption.name,
      value: newOption.value,
      additionalPrice: newOption.additionalPrice,
      stock: newOption.stock,
      isActive: true,
    };
    setOptions((prev) => [...prev, option]);
    setNewOption({ name: "", value: "", additionalPrice: 0, stock: 0 });
  };

  const removeOption = (optionId: string) => {
    setOptions((prev) => prev.filter((opt) => opt.id !== optionId));
  };

  return {
    images,
    setImages,
    options,
    setOptions,
    newOption,
    setNewOption,
    setMainImage,
    removeImage,
    addOption,
    removeOption,
  };
}
