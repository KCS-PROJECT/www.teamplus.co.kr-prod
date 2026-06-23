"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ProductImage, ProductOption } from "@/types/shop-product-form";
import { useProductFormState } from "@/hooks/useProductFormState";
import { ProductOptionsTab } from "@/components/shop/ProductOptionsTab";
import { ProductDetailTab } from "@/components/shop/ProductDetailTab";
import { useRouter, useParams } from "next/navigation";
import { MESSAGES } from "@/lib/messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { sanitizeHtml } from "@/lib/sanitize";
import {
  ArrowLeft,
  Save,
  Image as ImageIcon,
  Plus,
  Trash2,
  GripVertical,
  X,
  Upload,
  Star,
  Package,
  Tag,
  FileText,
  Settings,
} from "lucide-react";
import { shopService } from "@/services";
import { ShopCategory } from "@/types";

type TabType = "basic" | "images" | "detail" | "options" | "seo";
export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("basic");
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 카테고리 데이터
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");

  // 기본 정보
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    brand: "",
    manufacturer: "",
    origin: "",
    price: 0,
    salePrice: 0,
    costPrice: 0,
    stock: 0,
    minOrderQty: 1,
    maxOrderQty: 0,
    weight: 0,
    status: "active" as "active" | "inactive",
    isFeatured: false,
    isNew: false,
  });

  // 이미지
  const {
    images, setImages, options, setOptions, newOption, setNewOption,
    setMainImage, removeImage, addOption, removeOption,
  } = useProductFormState();

  // 상세 설명
  const [shortDescription, setShortDescription] = useState("");
  const [detailDescription, setDetailDescription] = useState("");

  // 옵션
  const [useOptions, setUseOptions] = useState(false);


  // SEO
  const [seoData, setSeoData] = useState({
    metaTitle: "",
    metaDescription: "",
    keywords: "",
  });

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // 병렬로 카테고리와 상품 데이터 로드
      const [categoriesData, productData] = await Promise.all([
        shopService.getCategories(),
        shopService.getProduct(productId),
      ]);

      setCategories(categoriesData);
      setSelectedCategoryId(productData.categoryId);

      // 폼 데이터 설정
      setFormData({
        name: productData.name,
        code: productData.code,
        brand: productData.brand || "",
        manufacturer: "",
        origin: "",
        price: productData.price,
        salePrice: productData.salePrice || 0,
        costPrice: 0,
        stock: productData.stock,
        minOrderQty: 1,
        maxOrderQty: 0,
        weight: 0,
        status: productData.isActive ? "active" : "inactive",
        isFeatured: productData.isFeatured,
        isNew: false,
      });

      // 이미지 설정
      if (productData.images && productData.images.length > 0) {
        setImages(
          productData.images.map((img) => ({
            id: img.id,
            url: img.imageUrl,
            isMain: img.isMain,
          })),
        );
      }

      // 설명 설정
      setDetailDescription(productData.description || "");

      // 옵션 설정
      if (productData.options && productData.options.length > 0) {
        setUseOptions(true);
        setOptions(
          productData.options.map((opt) => ({
            id: opt.id,
            name: opt.optionName,
            value: opt.optionValue,
            additionalPrice: opt.additionalPrice,
            stock: opt.stock,
            isActive: opt.isActive,
          })),
        );
      }
    } catch (err) {
      console.error("데이터 로드 실패:", err);
      setError(
        err instanceof Error
          ? err.message
          : "데이터를 불러오는 데 실패했습니다.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedCategoryName =
    categories.find((c) => c.id === selectedCategoryId)?.name || "";

  // 이미지 업로드 핸들러
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const newImage: ProductImage = {
          id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          url: event.target?.result as string,
          isMain: images.length === 0,
          file,
        };
        setImages((prev) => [...prev, newImage]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };





  const handleSave = async () => {
    if (!formData.name.trim()) {
      setActionMsg({ type: "error", text: MESSAGES.shopProduct.nameRequired });
      setTimeout(() => setActionMsg(null), 3000);
      setActiveTab("basic");
      return;
    }
    if (!formData.code.trim()) {
      setActionMsg({ type: "error", text: MESSAGES.shopProduct.skuRequired });
      setTimeout(() => setActionMsg(null), 3000);
      setActiveTab("basic");
      return;
    }
    if (formData.price <= 0) {
      setActionMsg({ type: "error", text: MESSAGES.shopProduct.priceRequired });
      setTimeout(() => setActionMsg(null), 3000);
      setActiveTab("basic");
      return;
    }
    if (!selectedCategoryId) {
      setActionMsg({ type: "error", text: MESSAGES.shopProduct.categoryRequired });
      setTimeout(() => setActionMsg(null), 3000);
      setActiveTab("basic");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const updateData = {
        categoryId: selectedCategoryId,
        name: formData.name,
        code: formData.code,
        description: detailDescription || undefined,
        price: formData.price,
        salePrice: formData.salePrice > 0 ? formData.salePrice : undefined,
        stock: formData.stock,
        brand: formData.brand || undefined,
        isFeatured: formData.isFeatured,
        isActive: formData.status === "active",
        options: useOptions
          ? options.map((opt) => ({
              optionName: opt.name,
              optionValue: opt.value,
              additionalPrice: opt.additionalPrice,
              stock: opt.stock,
              isActive: opt.isActive,
            }))
          : undefined,
      };

      await shopService.updateProduct(productId, updateData);
      setActionMsg({ type: "success", text: MESSAGES.shopProduct.updated });
      setTimeout(() => {
        setActionMsg(null);
        router.push(`/dashboard/shop/products/${productId}`);
      }, 1500);
    } catch (err) {
      console.error("상품 수정 실패:", err);
      setActionMsg({
        type: "error",
        text: err instanceof Error ? err.message : "상품 수정에 실패했습니다.",
      });
      setTimeout(() => setActionMsg(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const tabs = [
    { id: "basic" as TabType, label: "기본 정보", icon: Package },
    { id: "images" as TabType, label: "이미지", icon: ImageIcon },
    { id: "detail" as TabType, label: "상세 설명", icon: FileText },
    { id: "options" as TabType, label: "옵션", icon: Settings },
    { id: "seo" as TabType, label: "SEO", icon: Tag },
  ];

  if (isLoading) {
    return <LoadingSpinner message="상품 정보를 불러오는 중..." />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <X
              className="w-8 h-8 text-red-600 dark:text-red-400"
              aria-hidden="true"
            />
          </div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
            오류가 발생했습니다
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              className="h-12 px-5 text-base font-bold"
            >
              뒤로 가기
            </Button>
            <Button
              type="button"
              onClick={loadData}
              className="h-12 px-5 text-base font-bold bg-primary hover:bg-primary-dark text-white"
            >
              다시 시도
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {actionMsg && (
        <div
          className={`p-3 rounded-lg text-sm ${
            actionMsg.type === "success"
              ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
              : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
          }`}
        >
          {actionMsg.text}
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="뒤로가기"
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft
              className="w-5 h-5 text-slate-600 dark:text-slate-400"
              aria-hidden="true"
            />
          </button>
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              상품 수정
            </h1>
            <p className="text-base text-slate-500 dark:text-slate-400 mt-2">
              SKU: {formData.code}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            className="h-12 px-5 text-base font-bold"
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="h-12 px-5 text-base font-bold bg-primary hover:bg-primary-dark text-white gap-2"
          >
            <Save className="w-4 h-4" aria-hidden="true" />
            {isSaving ? "저장 중..." : "수정하기"}
          </Button>
        </div>
      </div>

      {/* Tab Navigation */}
      <Card className="rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-4 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary dark:text-primary-light"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
            >
              <tab.icon className="w-4 h-4" aria-hidden="true" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* 기본 정보 탭 */}
          {activeTab === "basic" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
                  상품 기본 정보
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      상품명 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="상품명을 입력하세요"
                      className="h-11"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      상품 코드 (SKU) <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={formData.code}
                      onChange={(e) =>
                        setFormData({ ...formData, code: e.target.value })
                      }
                      placeholder="SKU-001"
                      className="h-11"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      상태
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          status: e.target.value as "active" | "inactive",
                        })
                      }
                      className="w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    >
                      <option value="active">판매중</option>
                      <option value="inactive">판매중지</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
                  카테고리
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      카테고리 <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedCategoryId}
                      onChange={(e) => setSelectedCategoryId(e.target.value)}
                      className="w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    >
                      <option value="">카테고리 선택</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.parentId ? `└ ${cat.name}` : cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {selectedCategoryId && (
                    <div className="flex items-end">
                      <div className="px-3 py-2 bg-slate-50 dark:bg-slate-700 rounded-lg text-sm text-slate-600 dark:text-slate-300">
                        선택됨:{" "}
                        <span className="font-medium text-slate-900 dark:text-white">
                          {selectedCategoryName}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
                  브랜드/제조사 정보
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      브랜드
                    </label>
                    <Input
                      value={formData.brand}
                      onChange={(e) =>
                        setFormData({ ...formData, brand: e.target.value })
                      }
                      placeholder="CCM, Bauer 등"
                      className="h-11"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      제조사
                    </label>
                    <Input
                      value={formData.manufacturer}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          manufacturer: e.target.value,
                        })
                      }
                      placeholder="제조사명"
                      className="h-11"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      원산지
                    </label>
                    <Input
                      value={formData.origin}
                      onChange={(e) =>
                        setFormData({ ...formData, origin: e.target.value })
                      }
                      placeholder="캐나다, 미국 등"
                      className="h-11"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
                  가격 정보
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      판매가 <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Input
                        type="number"
                        value={formData.price || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            price: parseInt(e.target.value) || 0,
                          })
                        }
                        placeholder="0"
                        className="h-11 pr-12"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">
                        원
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      할인가
                    </label>
                    <div className="relative">
                      <Input
                        type="number"
                        value={formData.salePrice || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            salePrice: parseInt(e.target.value) || 0,
                          })
                        }
                        placeholder="0"
                        className="h-11 pr-12"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">
                        원
                      </span>
                    </div>
                    {formData.salePrice > 0 && formData.price > 0 && (
                      <p className="text-xs text-red-600 mt-1">
                        {Math.round(
                          (1 - formData.salePrice / formData.price) * 100,
                        )}
                        % 할인
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      원가
                    </label>
                    <div className="relative">
                      <Input
                        type="number"
                        value={formData.costPrice || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            costPrice: parseInt(e.target.value) || 0,
                          })
                        }
                        placeholder="0"
                        className="h-11 pr-12"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">
                        원
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
                  재고/배송 정보
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      재고 수량
                    </label>
                    <Input
                      type="number"
                      value={formData.stock || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          stock: parseInt(e.target.value) || 0,
                        })
                      }
                      placeholder="0"
                      className="h-11"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      최소 주문 수량
                    </label>
                    <Input
                      type="number"
                      value={formData.minOrderQty || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          minOrderQty: parseInt(e.target.value) || 1,
                        })
                      }
                      placeholder="1"
                      className="h-11"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      최대 주문 수량
                    </label>
                    <Input
                      type="number"
                      value={formData.maxOrderQty || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          maxOrderQty: parseInt(e.target.value) || 0,
                        })
                      }
                      placeholder="제한없음"
                      className="h-11"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      무게 (g)
                    </label>
                    <Input
                      type="number"
                      value={formData.weight || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          weight: parseInt(e.target.value) || 0,
                        })
                      }
                      placeholder="0"
                      className="h-11"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
                  노출 설정
                </h3>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isFeatured}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          isFeatured: e.target.checked,
                        })
                      }
                      className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      추천 상품
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isNew}
                      onChange={(e) =>
                        setFormData({ ...formData, isNew: e.target.checked })
                      }
                      className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      신상품
                    </span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* 이미지 탭 */}
          {activeTab === "images" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                    상품 이미지
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    첫 번째 이미지가 대표 이미지로 설정됩니다.
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-12 px-5 text-base font-bold gap-2"
                >
                  <Upload className="w-4 h-4" aria-hidden="true" />
                  이미지 업로드
                </Button>
              </div>

              {images.length === 0 ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-12 text-center cursor-pointer hover:border-primary dark:hover:border-blue-500 hover:bg-primary/5 transition-colors"
                >
                  <ImageIcon
                    className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4"
                    aria-hidden="true"
                  />
                  <p className="text-slate-600 dark:text-slate-300 font-medium">
                    이미지를 업로드하세요
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    권장 크기: 1000 x 1000px
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {images.map((image, index) => (
                    <div
                      key={image.id}
                      className={`relative aspect-square rounded-xl overflow-hidden border-2 ${
                        image.isMain
                          ? "border-primary dark:border-primary-light"
                          : "border-slate-200 dark:border-slate-600"
                      }`}
                    >
                      <div className="w-full h-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                        <ImageIcon
                          className="w-10 h-10 text-slate-300 dark:text-slate-500"
                          aria-hidden="true"
                        />
                      </div>
                      {image.isMain && (
                        <div className="absolute top-2 left-2 bg-primary dark:bg-primary-dark text-white text-xs px-2 py-1 rounded font-medium">
                          대표
                        </div>
                      )}
                      <div className="absolute top-2 right-2 flex gap-1">
                        {!image.isMain && (
                          <button
                            type="button"
                            onClick={() => setMainImage(image.id)}
                            aria-label="대표 이미지로 설정"
                            className="p-1.5 bg-white dark:bg-slate-700 rounded-lg shadow-sm hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                            title="대표 이미지로 설정"
                          >
                            <Star
                              className="w-4 h-4 text-slate-500 dark:text-slate-400"
                              aria-hidden="true"
                            />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeImage(image.id)}
                          aria-label="이미지 삭제"
                          className="p-1.5 bg-white dark:bg-slate-700 rounded-lg shadow-sm hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                          title="삭제"
                        >
                          <X
                            className="w-4 h-4 text-red-500"
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                      <div className="absolute bottom-2 left-2 right-2">
                        <div className="flex items-center gap-1 text-xs text-white bg-black/50 rounded px-2 py-1">
                          <GripVertical
                            className="w-3 h-3"
                            aria-hidden="true"
                          />
                          {index + 1}번째 이미지
                        </div>
                      </div>
                    </div>
                  ))}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 flex flex-col items-center justify-center cursor-pointer hover:border-primary dark:hover:border-blue-500 hover:bg-primary/5 transition-colors"
                  >
                    <Plus
                      className="w-8 h-8 text-slate-400 dark:text-slate-500"
                      aria-hidden="true"
                    />
                    <span className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                      추가
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 상세 설명 탭 */}
        {activeTab === "detail" && (
          <ProductDetailTab
            shortDescription={shortDescription}
            setShortDescription={setShortDescription}
            detailDescription={detailDescription}
            setDetailDescription={setDetailDescription}
          />
        )}

          {/* 옵션 탭 */}
        {activeTab === "options" && (
          <ProductOptionsTab
            useOptions={useOptions}
            setUseOptions={setUseOptions}
            options={options}
            newOption={newOption}
            setNewOption={setNewOption}
            addOption={addOption}
            removeOption={removeOption}
          />
        )}

          {/* SEO 탭 */}
          {activeTab === "seo" && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
                  검색 엔진 최적화 (SEO)
                </h3>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    메타 타이틀
                  </label>
                  <Input
                    value={seoData.metaTitle}
                    onChange={(e) =>
                      setSeoData({ ...seoData, metaTitle: e.target.value })
                    }
                    placeholder="검색 결과에 표시될 제목"
                    className="h-11"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    메타 설명
                  </label>
                  <textarea
                    value={seoData.metaDescription}
                    onChange={(e) =>
                      setSeoData({
                        ...seoData,
                        metaDescription: e.target.value,
                      })
                    }
                    placeholder="검색 결과에 표시될 설명"
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    키워드
                  </label>
                  <Input
                    value={seoData.keywords}
                    onChange={(e) =>
                      setSeoData({ ...seoData, keywords: e.target.value })
                    }
                    placeholder="아이스하키, 스케이트, CCM"
                    className="h-11"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    쉼표로 구분
                  </p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                  검색 결과 미리보기
                </h4>
                <div className="p-4 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg">
                  <p className="text-blue-700 dark:text-primary-light text-lg hover:underline cursor-pointer">
                    {seoData.metaTitle || formData.name || "상품명"}
                  </p>
                  <p className="text-green-700 dark:text-green-400 text-sm">
                    www.teamplus.com/shop/products/...
                  </p>
                  <p className="text-slate-600 dark:text-slate-300 text-sm mt-1">
                    {seoData.metaDescription ||
                      shortDescription ||
                      "상품 설명이 여기에 표시됩니다."}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* 하단 저장 버튼 (모바일) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 p-4 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 shadow-lg">
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="flex-1"
          >
            취소
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 bg-primary hover:bg-primary-dark text-white"
          >
            {isSaving ? "저장 중..." : "수정하기"}
          </Button>
        </div>
      </div>
    </div>
  );
}
