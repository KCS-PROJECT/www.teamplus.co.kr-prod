"use client";

// 상품 등록/수정 공유 상세설명 탭 (C-4 JSX 중복 제거 · 2026-06-07)
import { useId, type Dispatch, type SetStateAction } from "react";
import { Input } from "@/components/ui/input";
import { sanitizeHtml } from "@/lib/sanitize";

interface ProductDetailTabProps {
  shortDescription: string;
  setShortDescription: Dispatch<SetStateAction<string>>;
  detailDescription: string;
  setDetailDescription: Dispatch<SetStateAction<string>>;
}

export function ProductDetailTab({
  shortDescription,
  setShortDescription,
  detailDescription,
  setDetailDescription,
}: ProductDetailTabProps) {
  const shortDescriptionId = useId();
  const detailDescriptionId = useId();

  return (
                <div className="space-y-6">
                  {/* 간단 설명 */}
                  <div>
                    <label
                      htmlFor={shortDescriptionId}
                      className="block text-base font-semibold text-slate-900 dark:text-white mb-2"
                    >
                      간단 설명
                    </label>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                      상품 목록에서 보이는 간단한 설명입니다. (최대 200자)
                    </p>
                    <textarea
                      id={shortDescriptionId}
                      value={shortDescription}
                      onChange={(e) => setShortDescription(e.target.value)}
                      placeholder="상품의 주요 특징을 간단하게 입력해주세요"
                      aria-label="상품 간단 설명 입력 (최대 200자)"
                      rows={3}
                      maxLength={200}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-slate-400"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 text-right">
                      {shortDescription.length}/200
                    </p>
                  </div>

                  {/* 상세 설명 */}
                  <div>
                    <label
                      htmlFor={detailDescriptionId}
                      className="block text-base font-semibold text-slate-900 dark:text-white mb-2"
                    >
                      상세 설명
                    </label>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
                      상품 상세 페이지에 표시되는 내용입니다. HTML 태그를 사용할 수
                      있습니다.
                    </p>

                    {/* 간단 툴바 */}
                    <div className="flex items-center gap-1 p-2 bg-slate-50 dark:bg-slate-700 border border-b-0 border-slate-200 dark:border-slate-600 rounded-t-lg">
                      <button
                        type="button"
                        onClick={() =>
                          setDetailDescription((prev) => prev + "<h2></h2>")
                        }
                        className="px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded"
                      >
                        제목
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDetailDescription((prev) => prev + "<p></p>")
                        }
                        className="px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded"
                      >
                        문단
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDetailDescription(
                            (prev) => prev + "<ul><li></li></ul>",
                          )
                        }
                        className="px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded"
                      >
                        목록
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDetailDescription((prev) => prev + "<strong></strong>")
                        }
                        className="px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 rounded"
                      >
                        굵게
                      </button>
                      <div className="flex-1" />
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        HTML 지원
                      </span>
                    </div>

                    <textarea
                      id={detailDescriptionId}
                      value={detailDescription}
                      onChange={(e) => setDetailDescription(e.target.value)}
                      placeholder={`<h2>상품 특징</h2>
    <p>CCM 타랙스 AS-V 프로 스케이트는 프로 선수들을 위한 최상위 모델입니다.</p>

    <h2>주요 사양</h2>
    <ul>
      <li>소재: 고급 탄소 복합재</li>
      <li>블레이드: 스테인리스 스틸</li>
      <li>무게: 850g</li>
    </ul>

    <h2>사용 안내</h2>
    <p>처음 사용 시 블레이드 날 갈이가 필요합니다.</p>`}
                      aria-label="상품 상세 설명 입력 (HTML 지원)"
                      rows={20}
                      className="w-full px-4 py-3 rounded-b-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder:text-slate-400"
                    />
                  </div>

                  {/* 미리보기 — XSS 방지를 위해 DOMPurify sanitize 적용 */}
                  {detailDescription && (
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">
                        미리보기
                      </h3>
                      <div
                        className="p-4 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg prose prose-slate dark:prose-invert max-w-none"
                        dangerouslySetInnerHTML={{
                          __html: sanitizeHtml(detailDescription),
                        }}
                      />
                    </div>
                  )}
                </div>
  );
}
