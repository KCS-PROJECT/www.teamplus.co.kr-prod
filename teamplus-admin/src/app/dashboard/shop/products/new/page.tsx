"use client";

import { useState, useEffect, useRef, useId } from "react";
import type { ProductImage, ProductOption } from "@/types/shop-product-form";
import { useProductFormState } from "@/hooks/useProductFormState";
import { ProductOptionsTab } from "@/components/shop/ProductOptionsTab";
import { ProductDetailTab } from "@/components/shop/ProductDetailTab";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { MESSAGES } from "@/lib/messages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { sanitizeHtml } from "@/lib/sanitize";
import { env } from "@/lib/env";
import { shopService } from "@/services";
import type { CreateProductRequest } from "@/types";
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
  Info,
  Link as LinkIcon,
  Loader2,
} from "lucide-react";

// API Base URL — `/api/v1` suffix 없는 origin (수동 path 조립 용)
const API_BASE_URL = env.API_ORIGIN;

interface Category {
  id: string;
  name: string;
  level: number;
  parentId: string | null;
  path: string;
}

type TabType = "basic" | "images" | "detail" | "options" | "seo";
type ImageInputMode = "upload" | "url";

export default function NewProductPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("basic");
  const [imageInputMode, setImageInputMode] =
    useState<ImageInputMode>("upload");
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [actionMsg, setActionMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Accessibility: stable ids for label-htmlFor bindings
  const productNameId = useId();
  const productCodeId = useId();
  const productStatusId = useId();
  const categoryLevel1Id = useId();
  const categoryLevel2Id = useId();
  const categoryLevel3Id = useId();
  const categoryLevel4Id = useId();
  const brandId = useId();
  const manufacturerId = useId();
  const originId = useId();
  const priceId = useId();
  const salePriceId = useId();
  const costPriceId = useId();
  const stockId = useId();
  const minOrderQtyId = useId();
  const maxOrderQtyId = useId();
  const weightId = useId();
  const isFeaturedId = useId();
  const isNewId = useId();
  const useOptionsId = useId();
  const urlInputId = useId();
  const shortDescriptionId = useId();
  const detailDescriptionId = useId();
  const optionNameId = useId();
  const optionValueId = useId();
  const optionAdditionalPriceId = useId();
  const optionStockId = useId();
  const metaTitleId = useId();
  const metaDescriptionId = useId();
  const keywordsId = useId();

  // 카테고리 데이터
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<{
    level1: string;
    level2: string;
    level3: string;
    level4: string;
  }>({ level1: "", level2: "", level3: "", level4: "" });

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

  useEffect(() => {
    // DashboardLayout에서 이미 인증 체크 완료

    // Mock 카테고리 데이터 로드
    setTimeout(() => {
      setCategories([
        {
          id: "1",
          name: "스케이트",
          level: 1,
          parentId: null,
          path: "스케이트",
        },
        {
          id: "1-1",
          name: "아이스하키 스케이트",
          level: 2,
          parentId: "1",
          path: "스케이트 > 아이스하키 스케이트",
        },
        {
          id: "1-1-1",
          name: "프로용",
          level: 3,
          parentId: "1-1",
          path: "스케이트 > 아이스하키 스케이트 > 프로용",
        },
        {
          id: "1-1-2",
          name: "주니어용",
          level: 3,
          parentId: "1-1",
          path: "스케이트 > 아이스하키 스케이트 > 주니어용",
        },
        {
          id: "1-2",
          name: "피겨 스케이트",
          level: 2,
          parentId: "1",
          path: "스케이트 > 피겨 스케이트",
        },
        {
          id: "2",
          name: "보호장비",
          level: 1,
          parentId: null,
          path: "보호장비",
        },
        {
          id: "2-1",
          name: "헬멧",
          level: 2,
          parentId: "2",
          path: "보호장비 > 헬멧",
        },
        {
          id: "2-2",
          name: "글러브",
          level: 2,
          parentId: "2",
          path: "보호장비 > 글러브",
        },
        {
          id: "2-3",
          name: "패드",
          level: 2,
          parentId: "2",
          path: "보호장비 > 패드",
        },
        { id: "3", name: "스틱", level: 1, parentId: null, path: "스틱" },
        { id: "4", name: "의류", level: 1, parentId: null, path: "의류" },
        {
          id: "5",
          name: "액세서리",
          level: 1,
          parentId: null,
          path: "액세서리",
        },
      ]);
      setIsLoading(false);
    }, 300);
  }, [router]);

  // 카테고리 필터링
  const level1Categories = categories.filter((c) => c.level === 1);
  const level2Categories = categories.filter(
    (c) => c.level === 2 && c.parentId === selectedCategory.level1,
  );
  const level3Categories = categories.filter(
    (c) => c.level === 3 && c.parentId === selectedCategory.level2,
  );
  const level4Categories = categories.filter(
    (c) => c.level === 4 && c.parentId === selectedCategory.level3,
  );

  // 이미지 파일 업로드 핸들러 — 통합 진입점 `POST /api/v1/files/upload` 사용
  //   (2026-05-23 — 기존 /shop/upload/image 대신 단일 FilesModule 진입점으로 통일)
  //   refType=shop_product 로 도메인 연결, 백엔드는 uploads/image/{YYYY}/{MM}/{DD}/ 에 저장.
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setIsUploadingImage(true);

    for (const file of Array.from(files)) {
      try {
        const { url: relativeUrl } = await shopService.uploadImage(file);

        const newImage: ProductImage = {
          id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          url: `${API_BASE_URL}${relativeUrl}`,
          isMain: images.length === 0,
          isExternal: false,
        };
        setImages((prev) => [...prev, newImage]);
      } catch (error) {
        console.error("이미지 업로드 실패:", error);
        setActionMsg({ type: "error", text: MESSAGES.shopProduct.imageUploadError });
        setTimeout(() => setActionMsg(null), 3000);
      }
    }

    setIsUploadingImage(false);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // URL로 이미지 추가 핸들러
  const handleAddImageUrl = () => {
    if (!urlInput.trim()) {
      setUrlError("URL을 입력해주세요.");
      return;
    }

    // URL 유효성 검사
    const urlPattern = /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;
    if (!urlPattern.test(urlInput)) {
      setUrlError("유효한 이미지 URL을 입력해주세요. (jpg, png, gif, webp)");
      return;
    }

    const newImage: ProductImage = {
      id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      url: urlInput,
      isMain: images.length === 0,
      isExternal: true,
    };

    setImages((prev) => [...prev, newImage]);
    setUrlInput("");
    setUrlError("");
  };

  // 메인 이미지 설정

  // 이미지 삭제

  // 옵션 추가

  // 옵션 삭제

  // 저장
  const handleSave = async () => {
    // Validation
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

    const categoryId =
      selectedCategory.level4 ||
      selectedCategory.level3 ||
      selectedCategory.level2 ||
      selectedCategory.level1;
    if (!categoryId) {
      setActionMsg({ type: "error", text: MESSAGES.shopProduct.categoryRequired });
      setTimeout(() => setActionMsg(null), 3000);
      setActiveTab("basic");
      return;
    }

    setIsSaving(true);

    try {
      // 백엔드 API 호출을 위한 페이로드 구성
      const payload = {
        categoryId,
        name: formData.name,
        code: formData.code,
        description: detailDescription || shortDescription,
        price: formData.price,
        salePrice: formData.salePrice || undefined,
        costPrice: formData.costPrice || undefined,
        stock: formData.stock,
        minOrderQty: formData.minOrderQty,
        maxOrderQty: formData.maxOrderQty || undefined,
        brand: formData.brand || undefined,
        manufacturer: formData.manufacturer || undefined,
        origin: formData.origin || undefined,
        weight: formData.weight || undefined,
        isActive: formData.status === "active",
        isFeatured: formData.isFeatured,
        isNew: formData.isNew,
        images: images.map((img, index) => ({
          imageUrl: img.url,
          altText: `${formData.name} 이미지 ${index + 1}`,
          isMain: img.isMain,
          displayOrder: index,
        })),
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

      await shopService.createProduct(payload as CreateProductRequest);

      setActionMsg({ type: "success", text: MESSAGES.shopProduct.created });
      setTimeout(() => {
        setActionMsg(null);
        router.push("/dashboard/shop/products");
      }, 1500);
    } catch (error) {
      console.error("상품 등록 실패:", error);
      setActionMsg({
        type: "error",
        text:
          error instanceof Error ? error.message : MESSAGES.shopProduct.createError,
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
    return <LoadingSpinner message="상품 등록 화면을 불러오는 중..." />;
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
              상품 등록
            </h1>
            <p className="text-base text-slate-500 dark:text-slate-400 mt-2">
              새 상품을 등록합니다
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
            {isSaving ? "저장 중..." : "저장하기"}
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
              {/* 상품 기본 정보 */}
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
                  상품 기본 정보
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label
                      htmlFor={productNameId}
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      상품명 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      id={productNameId}
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="상품명을 입력해주세요"
                      aria-label="상품명 입력"
                      aria-required="true"
                      className="h-11"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      네이버쇼핑 등 외부 채널에 노출되는 상품명입니다.
                    </p>
                  </div>
                  <div>
                    <label
                      htmlFor={productCodeId}
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      상품 코드 (SKU) <span className="text-red-500">*</span>
                    </label>
                    <Input
                      id={productCodeId}
                      value={formData.code}
                      onChange={(e) =>
                        setFormData({ ...formData, code: e.target.value })
                      }
                      placeholder="예: SKU-001"
                      aria-label="상품 코드(SKU) 입력"
                      aria-required="true"
                      className="h-11"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={productStatusId}
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      상태
                    </label>
                    <select
                      id={productStatusId}
                      value={formData.status}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          status: e.target.value as "active" | "inactive",
                        })
                      }
                      aria-label="상품 판매 상태 선택"
                      className="w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    >
                      <option value="active">판매중</option>
                      <option value="inactive">판매중지</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 카테고리 선택 */}
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
                  카테고리
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label
                      htmlFor={categoryLevel1Id}
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      대분류
                    </label>
                    <select
                      id={categoryLevel1Id}
                      value={selectedCategory.level1}
                      onChange={(e) =>
                        setSelectedCategory({
                          level1: e.target.value,
                          level2: "",
                          level3: "",
                          level4: "",
                        })
                      }
                      aria-label="상품 대분류 카테고리 선택"
                      className="w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                    >
                      <option value="" disabled>
                        대분류를 선택해주세요
                      </option>
                      {level1Categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor={categoryLevel2Id}
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      중분류
                    </label>
                    <select
                      id={categoryLevel2Id}
                      value={selectedCategory.level2}
                      onChange={(e) =>
                        setSelectedCategory({
                          ...selectedCategory,
                          level2: e.target.value,
                          level3: "",
                          level4: "",
                        })
                      }
                      aria-label="상품 중분류 카테고리 선택"
                      className="w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                      disabled={!selectedCategory.level1}
                    >
                      <option value="" disabled>
                        중분류를 선택해주세요
                      </option>
                      {level2Categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor={categoryLevel3Id}
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      소분류
                    </label>
                    <select
                      id={categoryLevel3Id}
                      value={selectedCategory.level3}
                      onChange={(e) =>
                        setSelectedCategory({
                          ...selectedCategory,
                          level3: e.target.value,
                          level4: "",
                        })
                      }
                      aria-label="상품 소분류 카테고리 선택"
                      className="w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                      disabled={!selectedCategory.level2}
                    >
                      <option value="" disabled>
                        소분류를 선택해주세요
                      </option>
                      {level3Categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor={categoryLevel4Id}
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      세분류
                    </label>
                    <select
                      id={categoryLevel4Id}
                      value={selectedCategory.level4}
                      onChange={(e) =>
                        setSelectedCategory({
                          ...selectedCategory,
                          level4: e.target.value,
                        })
                      }
                      aria-label="상품 세분류 카테고리 선택"
                      className="w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
                      disabled={!selectedCategory.level3}
                    >
                      <option value="" disabled>
                        세분류를 선택해주세요
                      </option>
                      {level4Categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* 브랜드/제조사 정보 */}
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
                  브랜드/제조사 정보
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label
                      htmlFor={brandId}
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      브랜드
                    </label>
                    <Input
                      id={brandId}
                      value={formData.brand}
                      onChange={(e) =>
                        setFormData({ ...formData, brand: e.target.value })
                      }
                      placeholder="예: CCM, Bauer"
                      aria-label="브랜드명 입력"
                      className="h-11"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={manufacturerId}
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      제조사
                    </label>
                    <Input
                      id={manufacturerId}
                      value={formData.manufacturer}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          manufacturer: e.target.value,
                        })
                      }
                      placeholder="제조사명을 입력해주세요"
                      aria-label="제조사명 입력"
                      className="h-11"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={originId}
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      원산지
                    </label>
                    <Input
                      id={originId}
                      value={formData.origin}
                      onChange={(e) =>
                        setFormData({ ...formData, origin: e.target.value })
                      }
                      placeholder="예: 캐나다, 미국"
                      aria-label="원산지 입력"
                      className="h-11"
                    />
                  </div>
                </div>
              </div>

              {/* 가격 정보 */}
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
                  가격 정보
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label
                      htmlFor={priceId}
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      판매가 <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Input
                        id={priceId}
                        type="number"
                        value={formData.price || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            price: parseInt(e.target.value) || 0,
                          })
                        }
                        placeholder="판매가를 입력해주세요"
                        aria-label="상품 판매가 입력 (원)"
                        aria-required="true"
                        className="h-11 pr-12"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">
                        원
                      </span>
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor={salePriceId}
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      할인가
                    </label>
                    <div className="relative">
                      <Input
                        id={salePriceId}
                        type="number"
                        value={formData.salePrice || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            salePrice: parseInt(e.target.value) || 0,
                          })
                        }
                        placeholder="할인가를 입력해주세요"
                        aria-label="상품 할인가 입력 (원)"
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
                    <label
                      htmlFor={costPriceId}
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      원가
                    </label>
                    <div className="relative">
                      <Input
                        id={costPriceId}
                        type="number"
                        value={formData.costPrice || ""}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            costPrice: parseInt(e.target.value) || 0,
                          })
                        }
                        placeholder="원가를 입력해주세요"
                        aria-label="상품 원가 입력 (원)"
                        className="h-11 pr-12"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400">
                        원
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 재고/배송 정보 */}
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
                  재고/배송 정보
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label
                      htmlFor={stockId}
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      재고 수량
                    </label>
                    <Input
                      id={stockId}
                      type="number"
                      value={formData.stock || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          stock: parseInt(e.target.value) || 0,
                        })
                      }
                      placeholder="재고 수량을 입력해주세요"
                      aria-label="재고 수량 입력"
                      className="h-11"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={minOrderQtyId}
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      최소 주문 수량
                    </label>
                    <Input
                      id={minOrderQtyId}
                      type="number"
                      value={formData.minOrderQty || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          minOrderQty: parseInt(e.target.value) || 1,
                        })
                      }
                      placeholder="최소 주문 수량을 입력해주세요"
                      aria-label="최소 주문 수량 입력"
                      className="h-11"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={maxOrderQtyId}
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      최대 주문 수량
                    </label>
                    <Input
                      id={maxOrderQtyId}
                      type="number"
                      value={formData.maxOrderQty || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          maxOrderQty: parseInt(e.target.value) || 0,
                        })
                      }
                      placeholder="제한없음 (0)"
                      aria-label="최대 주문 수량 입력 (0은 제한없음)"
                      className="h-11"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={weightId}
                      className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                    >
                      무게 (g)
                    </label>
                    <Input
                      id={weightId}
                      type="number"
                      value={formData.weight || ""}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          weight: parseInt(e.target.value) || 0,
                        })
                      }
                      placeholder="무게를 입력해주세요"
                      aria-label="상품 무게 입력 (그램)"
                      className="h-11"
                    />
                  </div>
                </div>
              </div>

              {/* 노출 설정 */}
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
                  노출 설정
                </h3>
                <div className="flex flex-wrap gap-4">
                  <label
                    htmlFor={isFeaturedId}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      id={isFeaturedId}
                      type="checkbox"
                      checked={formData.isFeatured}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          isFeatured: e.target.checked,
                        })
                      }
                      aria-label="추천 상품으로 노출"
                      className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      추천 상품
                    </span>
                  </label>
                  <label
                    htmlFor={isNewId}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <input
                      id={isNewId}
                      type="checkbox"
                      checked={formData.isNew}
                      onChange={(e) =>
                        setFormData({ ...formData, isNew: e.target.checked })
                      }
                      aria-label="신상품으로 노출"
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
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  상품 이미지
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  첫 번째 이미지가 대표 이미지로 설정됩니다.
                </p>
              </div>

              {/* 이미지 입력 방식 선택 탭 */}
              <div className="flex border-b border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setImageInputMode("upload")}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    imageInputMode === "upload"
                      ? "border-primary text-primary dark:text-primary-light"
                      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  <Upload className="w-4 h-4" aria-hidden="true" />
                  파일 업로드
                </button>
                <button
                  type="button"
                  onClick={() => setImageInputMode("url")}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    imageInputMode === "url"
                      ? "border-primary text-primary dark:text-primary-light"
                      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                  }`}
                >
                  <LinkIcon className="w-4 h-4" aria-hidden="true" />
                  URL 입력
                </button>
              </div>

              {/* 파일 업로드 모드 */}
              {imageInputMode === "upload" && (
                <div className="space-y-4">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                    multiple
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  <div
                    onClick={() =>
                      !isUploadingImage && fileInputRef.current?.click()
                    }
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                      isUploadingImage
                        ? "border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 cursor-wait"
                        : "border-slate-300 dark:border-slate-600 cursor-pointer hover:border-primary dark:hover:border-blue-500 hover:bg-primary/5"
                    }`}
                  >
                    {isUploadingImage ? (
                      <>
                        <Loader2
                          className="w-10 h-10 text-primary dark:text-primary-light mx-auto mb-3 animate-spin"
                          aria-hidden="true"
                        />
                        <p className="text-slate-600 dark:text-slate-300 font-medium">
                          업로드 중...
                        </p>
                      </>
                    ) : (
                      <>
                        <Upload
                          className="w-10 h-10 text-slate-400 dark:text-slate-500 mx-auto mb-3"
                          aria-hidden="true"
                        />
                        <p className="text-slate-600 dark:text-slate-300 font-medium">
                          클릭하여 이미지 선택
                        </p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                          또는 파일을 여기에 드래그하세요
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                          JPG, PNG, GIF, WebP (최대 10MB)
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* URL 입력 모드 */}
              {imageInputMode === "url" && (
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label htmlFor={urlInputId} className="sr-only">
                        이미지 URL 입력
                      </label>
                      <Input
                        id={urlInputId}
                        value={urlInput}
                        onChange={(e) => {
                          setUrlInput(e.target.value);
                          setUrlError("");
                        }}
                        placeholder="https://example.com/image.jpg 형식으로 입력해주세요"
                        aria-label="상품 이미지 URL 입력"
                        aria-invalid={urlError ? "true" : "false"}
                        className={`h-11 ${urlError ? "border-red-300 focus:ring-red-500" : ""}`}
                      />
                      {urlError && (
                        <p className="text-xs text-red-500 mt-1">{urlError}</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      onClick={handleAddImageUrl}
                      className="h-11 bg-primary hover:bg-primary-dark text-white gap-2"
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                      추가
                    </Button>
                  </div>

                  {/* URL 미리보기 */}
                  {urlInput && !urlError && (
                    <div className="p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
                        미리보기
                      </p>
                      <div className="relative w-32 h-32 rounded-lg overflow-hidden bg-white dark:bg-slate-600 border border-slate-200 dark:border-slate-500">
                        <Image
                          src={urlInput}
                          alt="미리보기"
                          fill
                          className="object-cover"
                          sizes="128px"
                          unoptimized
                          onError={() => {
                            setUrlError("이미지를 불러올 수 없습니다.");
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 등록된 이미지 목록 */}
              {images.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                    등록된 이미지 ({images.length}개)
                  </h4>
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
                        <Image
                          src={image.url}
                          alt={`상품 이미지 ${index + 1}`}
                          fill
                          className="object-cover"
                          sizes="(min-width: 1024px) 20vw, (min-width: 768px) 25vw, 50vw"
                          unoptimized={image.isExternal}
                        />
                        {image.isMain && (
                          <div className="absolute top-2 left-2 bg-primary dark:bg-primary-dark text-white text-xs px-2 py-1 rounded font-medium">
                            대표
                          </div>
                        )}
                        {image.isExternal && (
                          <div className="absolute top-2 left-2 bg-slate-700 text-white text-xs px-2 py-1 rounded font-medium flex items-center gap-1">
                            <LinkIcon className="w-3 h-3" aria-hidden="true" />
                            외부
                          </div>
                        )}
                        <div className="absolute top-2 right-2 flex gap-1">
                          {!image.isMain && (
                            <button
                              type="button"
                              onClick={() => setMainImage(image.id)}
                              className="p-1.5 bg-white dark:bg-slate-700 rounded-lg shadow-sm hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                              title="대표 이미지로 설정"
                              aria-label="대표 이미지로 설정"
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
                            className="p-1.5 bg-white dark:bg-slate-700 rounded-lg shadow-sm hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                            title="삭제"
                            aria-label="이미지 삭제"
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
                            {index + 1}번째
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
                <div className="flex items-start gap-2">
                  <Info
                    className="w-4 h-4 text-slate-500 dark:text-slate-400 mt-0.5"
                    aria-hidden="true"
                  />
                  <div className="text-sm text-slate-600 dark:text-slate-300">
                    <p className="font-medium mb-1">이미지 가이드</p>
                    <ul className="list-disc list-inside space-y-1 text-slate-500 dark:text-slate-400">
                      <li>권장 크기: 1000 x 1000px (정사각형)</li>
                      <li>지원 형식: JPG, PNG, GIF, WebP</li>
                      <li>최대 파일 크기: 10MB</li>
                      <li>외부 URL은 이미지 확장자로 끝나야 합니다</li>
                    </ul>
                  </div>
                </div>
              </div>
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
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  검색 엔진에서 상품이 잘 노출되도록 메타 정보를 입력하세요.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label
                    htmlFor={metaTitleId}
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    메타 타이틀
                  </label>
                  <Input
                    id={metaTitleId}
                    value={seoData.metaTitle}
                    onChange={(e) =>
                      setSeoData({ ...seoData, metaTitle: e.target.value })
                    }
                    placeholder="검색 결과에 표시될 제목을 입력해주세요 (비워두면 상품명 사용)"
                    aria-label="SEO 메타 타이틀 입력"
                    className="h-11"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    권장: 60자 이내
                  </p>
                </div>

                <div>
                  <label
                    htmlFor={metaDescriptionId}
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    메타 설명
                  </label>
                  <textarea
                    id={metaDescriptionId}
                    value={seoData.metaDescription}
                    onChange={(e) =>
                      setSeoData({
                        ...seoData,
                        metaDescription: e.target.value,
                      })
                    }
                    placeholder="검색 결과에 표시될 설명을 입력해주세요"
                    aria-label="SEO 메타 설명 입력"
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-slate-400"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    권장: 160자 이내
                  </p>
                </div>

                <div>
                  <label
                    htmlFor={keywordsId}
                    className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
                  >
                    키워드
                  </label>
                  <Input
                    id={keywordsId}
                    value={seoData.keywords}
                    onChange={(e) =>
                      setSeoData({ ...seoData, keywords: e.target.value })
                    }
                    placeholder="예: 아이스하키, 스케이트, CCM, 하키장비"
                    aria-label="SEO 검색 키워드 입력 (쉼표로 구분)"
                    className="h-11"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    쉼표로 구분하여 입력
                  </p>
                </div>
              </div>

              {/* SEO 미리보기 */}
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
            {isSaving ? "저장 중..." : "저장하기"}
          </Button>
        </div>
      </div>
    </div>
  );
}
