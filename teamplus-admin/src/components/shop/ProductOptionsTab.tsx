"use client";

// 상품 등록/수정 공유 옵션 탭 (C-4 JSX 중복 제거 · 2026-06-07)
// 접근성(id/aria) 우수한 new 버전 기준으로 단일화.
import { useId } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Trash2, Settings } from "lucide-react";
import type { ProductOption } from "@/types/shop-product-form";

interface NewOptionInput {
  name: string;
  value: string;
  additionalPrice: number;
  stock: number;
}

interface ProductOptionsTabProps {
  useOptions: boolean;
  setUseOptions: (v: boolean) => void;
  options: ProductOption[];
  newOption: NewOptionInput;
  setNewOption: (v: NewOptionInput) => void;
  addOption: () => void;
  removeOption: (id: string) => void;
}

export function ProductOptionsTab({
  useOptions,
  setUseOptions,
  options,
  newOption,
  setNewOption,
  addOption,
  removeOption,
}: ProductOptionsTabProps) {
  const useOptionsId = useId();
  const optionNameId = useId();
  const optionValueId = useId();
  const optionAdditionalPriceId = useId();
  const optionStockId = useId();

  return (
    <div className="space-y-6">
      {/* 옵션 사용 여부 */}
      <div className="flex items-center gap-3">
        <label
          htmlFor={useOptionsId}
          className="flex items-center gap-2 cursor-pointer"
        >
          <input
            id={useOptionsId}
            type="checkbox"
            checked={useOptions}
            onChange={(e) => setUseOptions(e.target.checked)}
            aria-label="상품 옵션 기능 사용"
            className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary"
          />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            상품 옵션 사용
          </span>
        </label>
      </div>

      {useOptions && (
        <>
          {/* 옵션 추가 폼 */}
          <Card className="p-4 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
              옵션 추가
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label
                  htmlFor={optionNameId}
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  옵션명
                </label>
                <Input
                  id={optionNameId}
                  value={newOption.name}
                  onChange={(e) =>
                    setNewOption({ ...newOption, name: e.target.value })
                  }
                  placeholder="예: 사이즈"
                  aria-label="옵션명 입력"
                  className="h-10"
                />
              </div>
              <div>
                <label
                  htmlFor={optionValueId}
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  옵션값
                </label>
                <Input
                  id={optionValueId}
                  value={newOption.value}
                  onChange={(e) =>
                    setNewOption({
                      ...newOption,
                      value: e.target.value,
                    })
                  }
                  placeholder="예: 270mm"
                  aria-label="옵션값 입력"
                  className="h-10"
                />
              </div>
              <div>
                <label
                  htmlFor={optionAdditionalPriceId}
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  추가금액
                </label>
                <Input
                  id={optionAdditionalPriceId}
                  type="number"
                  value={newOption.additionalPrice || ""}
                  onChange={(e) =>
                    setNewOption({
                      ...newOption,
                      additionalPrice: parseInt(e.target.value) || 0,
                    })
                  }
                  placeholder="추가금액을 입력해주세요"
                  aria-label="옵션 추가금액 입력 (원)"
                  className="h-10"
                />
              </div>
              <div>
                <label
                  htmlFor={optionStockId}
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  재고
                </label>
                <Input
                  id={optionStockId}
                  type="number"
                  value={newOption.stock || ""}
                  onChange={(e) =>
                    setNewOption({
                      ...newOption,
                      stock: parseInt(e.target.value) || 0,
                    })
                  }
                  placeholder="재고 수량을 입력해주세요"
                  aria-label="옵션 재고 수량 입력"
                  className="h-10"
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  onClick={addOption}
                  disabled={!newOption.name || !newOption.value}
                  className="w-full h-10 bg-primary hover:bg-primary-dark text-white"
                >
                  추가
                </Button>
              </div>
            </div>
          </Card>

          {/* 옵션 목록 */}
          {options.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
                등록된 옵션 ({options.length}개)
              </h4>
              <div className="border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden">
                <div className="grid grid-cols-5 gap-4 px-4 py-2 bg-slate-50 dark:bg-slate-700 text-xs font-medium text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-600">
                  <span>옵션명</span>
                  <span>옵션값</span>
                  <span>추가금액</span>
                  <span>재고</span>
                  <span className="text-center">삭제</span>
                </div>
                {options.map((option) => (
                  <div
                    key={option.id}
                    className="grid grid-cols-5 gap-4 px-4 py-3 items-center border-b border-slate-100 dark:border-slate-700 last:border-b-0 bg-white dark:bg-slate-800"
                  >
                    <span className="text-sm text-slate-900 dark:text-white">
                      {option.name}
                    </span>
                    <span className="text-sm text-slate-900 dark:text-white">
                      {option.value}
                    </span>
                    <span className="text-sm text-slate-900 dark:text-white">
                      {option.additionalPrice > 0
                        ? `+${option.additionalPrice.toLocaleString()}원`
                        : "-"}
                    </span>
                    <span className="text-sm text-slate-900 dark:text-white">
                      {option.stock}개
                    </span>
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => removeOption(option.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                        aria-label="옵션 삭제"
                      >
                        <Trash2
                          className="w-4 h-4"
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {options.length === 0 && (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              <Settings
                className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3"
                aria-hidden="true"
              />
              <p>등록된 옵션이 없습니다.</p>
              <p className="text-sm">위 폼에서 옵션을 추가해주세요.</p>
            </div>
          )}
        </>
      )}

      {!useOptions && (
        <div className="text-center py-12 text-slate-500 dark:text-slate-400">
          <Settings
            className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3"
            aria-hidden="true"
          />
          <p>
            옵션을 사용하면 사이즈, 색상 등 다양한 선택지를 제공할 수
            있습니다.
          </p>
          <p className="text-sm mt-1">
            위의 체크박스를 클릭하여 옵션 기능을 활성화하세요.
          </p>
        </div>
      )}
    </div>
  );
}
