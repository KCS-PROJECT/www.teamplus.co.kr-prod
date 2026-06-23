'use client';

/**
 * 쇼핑몰 카테고리 관리 페이지 - TEAMPLUS
 *
 * === Design 7 Principles 적용 ===
 * 1. 화면 분석: 4단계 계층 카테고리 관리
 * 2. 휴먼 디자인: 트리 구조 펼침/접기 UI
 * 3. AI 스타일 금지: gradient, blur 미사용
 * 4. 페르소나 융합: frontend + architect
 * 5. Tone & Manner: 존댓말, 액션 동사
 */

import { useState, useEffect, Fragment, useCallback, useRef } from 'react';
import { MESSAGES } from '@/lib/messages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader, StatsGrid } from '@/components/ui/page-header';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  FolderTree,
  ChevronRight,
  ChevronDown,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  MoreHorizontal,
  ChevronUp,
} from 'lucide-react';
import { shopService } from '@/services/shop.service';
import { authService } from '@/services/auth.service';
import type { ShopCategory } from '@/types';

type LineStyle = 'solid' | 'dashed';
type LineWeight = 'thin' | 'thick';
type LineTone = 'blue' | 'slate' | 'amber';

const HIGHLIGHT_DURATION_MS = 2600;

// 레벨별 이름
const levelNames: Record<number, string> = {
  1: '대분류',
  2: '중분류',
  3: '소분류',
  4: '세분류',
};

// 레벨별 색상 (단순화, 다크모드 지원)
const levelStyles: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: 'bg-primary/5 dark:bg-primary/20', text: 'text-blue-700 dark:text-primary-light', border: 'border-blue-200 dark:border-blue-800' },
  2: { bg: 'bg-slate-50 dark:bg-slate-700', text: 'text-slate-600 dark:text-slate-300', border: 'border-slate-200 dark:border-slate-600' },
  3: { bg: 'bg-slate-50 dark:bg-slate-700', text: 'text-slate-500 dark:text-slate-400', border: 'border-slate-200 dark:border-slate-600' },
  4: { bg: 'bg-slate-50 dark:bg-slate-700', text: 'text-slate-400 dark:text-slate-500', border: 'border-slate-200 dark:border-slate-600' },
};

// 레벨별 들여쓰기 및 스타일
const levelIndent: Record<number, number> = {
  1: 0,
  2: 24,
  3: 48,
  4: 72,
};

export default function ShopCategoriesPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ShopCategory | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [showPath, setShowPath] = useState(false);
  const [lineStyle, setLineStyle] = useState<LineStyle>('solid');
  const [lineWeight, setLineWeight] = useState<LineWeight>('thin');
  const [lineTone, setLineTone] = useState<LineTone>('blue');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string } | null>(null);
  const [prefsKey, setPrefsKey] = useState('shopCategoryViewPrefs:guest');
  const categoryRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const user = authService.getCurrentUser();
    setPrefsKey(`shopCategoryViewPrefs:${user?.id || 'guest'}`);
  }, []);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(prefsKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as {
          showPath?: boolean;
          lineStyle?: LineStyle;
          lineWeight?: LineWeight;
          lineTone?: LineTone;
        };
        if (typeof parsed.showPath === 'boolean') setShowPath(parsed.showPath);
        if (parsed.lineStyle === 'solid' || parsed.lineStyle === 'dashed') setLineStyle(parsed.lineStyle);
        if (parsed.lineWeight === 'thin' || parsed.lineWeight === 'thick') setLineWeight(parsed.lineWeight);
        if (parsed.lineTone === 'blue' || parsed.lineTone === 'slate' || parsed.lineTone === 'amber') setLineTone(parsed.lineTone);
        return;
      } catch {
        // ignore parse errors and fall back to legacy keys
      }
    }

    const savedShowPath = window.localStorage.getItem('shopCategoryShowPath');
    const savedLineStyle = window.localStorage.getItem('shopCategoryLineStyle') as LineStyle | null;
    const savedLineWeight = window.localStorage.getItem('shopCategoryLineWeight') as LineWeight | null;
    const savedLineTone = window.localStorage.getItem('shopCategoryLineTone') as LineTone | null;
    if (savedShowPath !== null) setShowPath(savedShowPath === 'true');
    if (savedLineStyle === 'solid' || savedLineStyle === 'dashed') setLineStyle(savedLineStyle);
    if (savedLineWeight === 'thin' || savedLineWeight === 'thick') setLineWeight(savedLineWeight);
    if (savedLineTone === 'blue' || savedLineTone === 'slate' || savedLineTone === 'amber') setLineTone(savedLineTone);
  }, [prefsKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = JSON.stringify({
      showPath,
      lineStyle,
      lineWeight,
      lineTone,
    });
    window.localStorage.setItem(prefsKey, payload);
  }, [prefsKey, showPath, lineStyle, lineWeight, lineTone]);

  // Form state — 2026-05-20 Phase C-D 백엔드 alias 제거로 form 키도 canonical 통일.
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    parentId: '',
    displayOrder: 0,
    isActive: true,
  });

  const loadCategories = useCallback(async () => {
    const start = Date.now();
    try {
      setIsLoading(true);
      const data = await shopService.getCategoryTree();
      setCategories(data);

      // 초기 로드 시 대분류는 펼쳐두기
      const level1Ids = data.map(c => c.id);
      setExpandedIds(prev => {
        if (prev.size === 0) return new Set(level1Ids);
        return prev;
      });
    } catch (error) {
      console.error('카테고리 로드 실패:', error);
    } finally {
      const elapsed = Date.now() - start;
      const delay = Math.max(0, 600 - elapsed);
      if (delay > 0) await new Promise(r => setTimeout(r, delay));
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // 모든 카테고리를 평탄화 (검색 및 부모 선택용)
  const flattenCategories = (cats: ShopCategory[]): ShopCategory[] => {
    let result: ShopCategory[] = [];
    cats.forEach((cat) => {
      result.push(cat);
      if (cat.children) {
        result = result.concat(flattenCategories(cat.children));
      }
    });
    return result;
  };

  const allCategories = flattenCategories(categories);

  // 상위 카테고리 후보 목록
  const getParentCandidates = (maxLevel: number): ShopCategory[] => {
    // level은 1부터 시작한다고 가정
    return allCategories.filter((c) => c.level < maxLevel && c.isActive);
  };

  // 카테고리 펼침/접기 토글
  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // 검색 필터링
  const filterCategories = (
    cats: ShopCategory[],
    term: string,
    ancestors: string[] = [],
  ): ShopCategory[] => {
    if (!term) return cats;
    const normalizedTerm = term.toLowerCase();

    return cats.reduce((acc: ShopCategory[], cat) => {
      const pathText = [...ancestors, cat.name].join(' > ');
      const matchesSelf =
        cat.name.toLowerCase().includes(normalizedTerm) ||
        pathText.toLowerCase().includes(normalizedTerm);
      const filteredChildren = cat.children
        ? filterCategories(cat.children, term, [...ancestors, cat.name])
        : [];

      if (matchesSelf || filteredChildren.length > 0) {
        acc.push({
          ...cat,
          children: filteredChildren.length > 0 ? filteredChildren : cat.children,
        });
        // 검색 결과가 있으면 해당 경로 펼치기
        setExpandedIds(prev => new Set(prev).add(cat.id));
      }
      return acc;
    }, []);
  };

  const filteredCategories = filterCategories(categories, searchTerm);

  const stats = {
    totalCategories: allCategories.length,
    activeCategories: allCategories.filter((c) => c.isActive).length,
    level1Count: allCategories.filter((c) => c.level === 1).length,
    level2Count: allCategories.filter((c) => c.level === 2).length,
    level3Count: allCategories.filter((c) => c.level === 3).length,
    level4Count: allCategories.filter((c) => c.level === 4).length,
  };

  const handleAddCategory = (parentCategory?: ShopCategory) => {
    const newLevel = parentCategory ? (parentCategory.level + 1) : 1;
    if (newLevel > 4) {
      setActionMsg({ type: 'error', text: MESSAGES.shopCategory.maxDepth }); setTimeout(() => setActionMsg(null), 3000);
      return;
    }

    setFormData({
      name: '',
      description: '',
      parentId: parentCategory?.id || '',
      displayOrder: 0,
      isActive: true,
    });
    setEditingCategory(null);
    setShowAddModal(true);
    setActiveDropdown(null);
  };

  const handleEditCategory = (category: ShopCategory) => {
    setFormData({
      name: category.name,
      description: category.description || '',
      parentId: category.parentId || '',
      // 2026-05-20 Phase C-D — canonical displayOrder only (alias 제거 완료).
      displayOrder: category.displayOrder,
      isActive: category.isActive,
    });
    setEditingCategory(category);
    setShowAddModal(true);
    setActiveDropdown(null);
  };

  const handleSaveCategory = async () => {
    if (!formData.name.trim()) {
      setActionMsg({ type: 'error', text: MESSAGES.shopCategory.nameRequired }); setTimeout(() => setActionMsg(null), 3000);
      return;
    }

    try {
      if (editingCategory) {
        await shopService.updateCategory(editingCategory.id, {
          name: formData.name,
          description: formData.description,
          parentId: formData.parentId || undefined,
          displayOrder: formData.displayOrder,
          isActive: formData.isActive,
        });
      } else {
        await shopService.createCategory({
          name: formData.name,
          description: formData.description,
          parentId: formData.parentId || undefined,
          displayOrder: formData.displayOrder,
          isActive: formData.isActive,
        });
      }
      
      await loadCategories();
      setShowAddModal(false);
      setEditingCategory(null);
    } catch (error) {
      console.error('카테고리 저장 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.shopCategory.saveError }); setTimeout(() => setActionMsg(null), 3000);
    }
  };

  const handleDeleteCategory = (categoryId: string) => {
    const category = allCategories.find((c) => c.id === categoryId);
    if (category?.children && category.children.length > 0) {
      setActionMsg({ type: 'error', text: MESSAGES.shopCategory.hasChildren }); setTimeout(() => setActionMsg(null), 3000);
      setActiveDropdown(null);
      return;
    }
    setConfirmAction({ id: categoryId, action: 'delete' });
    setActiveDropdown(null);
  };

  const handleDeleteCategoryConfirmed = async (categoryId: string) => {
    try {
      await shopService.deleteCategory(categoryId);
      setConfirmAction(null);
      await loadCategories();
    } catch (error) {
      console.error('카테고리 삭제 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.shopCategory.deleteError }); setTimeout(() => setActionMsg(null), 3000);
      setConfirmAction(null);
    }
  };

  const handleToggleActive = async (categoryId: string, currentStatus: boolean) => {
    try {
      await shopService.updateCategory(categoryId, { isActive: !currentStatus });
      await loadCategories();
    } catch (error) {
      console.error('상태 변경 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.shopCategory.statusError }); setTimeout(() => setActionMsg(null), 3000);
    }
  };

  // 드롭다운 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = () => setActiveDropdown(null);
    if (activeDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [activeDropdown]);

  // 카테고리 아이템 렌더링 (트리 라인 포함)
  const renderCategoryItem = (
    category: ShopCategory,
    ancestorHasSiblings: boolean[] = [],
    ancestorNames: string[] = [],
    isLast = false,
  ): JSX.Element[] => {
    const hasChildren = category.children && category.children.length > 0;
    const isExpanded = expandedIds.has(category.id);
    const level = category.level;
    const style = levelStyles[level] || levelStyles[4];
    const indent = levelIndent[level] || levelIndent[4];
    const treeStep = 16;
    const treeIndent = Math.max(0, (level - 1) * treeStep);
    const pathText = [...ancestorNames, category.name].join(' > ');
    const toneClass =
      lineTone === 'amber'
        ? 'border-amber-500/35 dark:border-amber-300/40'
        : lineTone === 'slate'
          ? 'border-slate-400/40 dark:border-slate-500/50'
          : 'border-primary/25 dark:border-primary-light/35';
    const lineClass = `${toneClass} ${lineStyle === 'dashed' ? 'border-dashed' : 'border-solid'} ${lineWeight === 'thick' ? 'border-l-2 border-t-2' : ''}`;

    const items: JSX.Element[] = [
      <div
        ref={(el) => {
          categoryRefs.current.set(category.id, el);
        }}
        key={category.id}
        className={`
          flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700
          hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors
          ${level === 1 ? 'bg-white dark:bg-slate-800' : 'bg-slate-25 dark:bg-slate-800/50'}
          ${!category.isActive ? 'opacity-60' : ''}
          ${highlightId === category.id ? 'ring-2 ring-primary/45 dark:ring-primary-light/60 bg-primary/10 dark:bg-primary/18 shadow-[0_0_0_4px_hsl(var(--ice-primary)/0.08)]' : ''}
        `}
      >
        {/* 계층 (들여쓰기 및 펼침/접기 버튼 + 폴더 아이콘) */}
        <div className="w-[120px] sm:w-[140px] lg:w-[180px] shrink-0 flex items-center justify-start">
          <div
            className="relative flex items-center shrink-0 h-8"
            style={{ width: indent + 32, minWidth: indent + 32 }}
          >
            {/* 트리 라인 (상위 계층) */}
            {ancestorHasSiblings.map((hasSibling, index) => (
              hasSibling ? (
                <span
                  key={`${category.id}-line-${index}`}
                  className={`absolute top-0 bottom-0 border-l ${lineClass}`}
                  style={{ left: index * treeStep + 6 }}
                />
              ) : null
            ))}

            {/* 현재 계층 라인 */}
            {level > 1 && (
              <span
                className={`absolute top-1/2 border-t ${lineClass}`}
                style={{ left: treeIndent + 6, width: 10 }}
              />
            )}
            {!isLast && level > 1 && (
              <span
                className={`absolute top-1/2 bottom-0 border-l ${lineClass}`}
                style={{ left: treeIndent + 6 }}
              />
            )}

            <div style={{ width: indent }} />
            {hasChildren ? (
              <button
                onClick={(e) => toggleExpand(category.id, e)}
                className="w-6 h-6 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600 rounded transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                )}
              </button>
            ) : (
              <span className="w-6" />
            )}
          </div>

          <div className="shrink-0">
            {hasChildren && isExpanded ? (
              <FolderOpen className="w-5 h-5 text-amber-500" />
            ) : hasChildren ? (
              <Folder className="w-5 h-5 text-amber-500" />
            ) : (
              <FolderTree className="w-5 h-5 text-slate-400" />
            )}
          </div>
        </div>

        {/* 카테고리 정보 */}
        <div
          className="flex-1 min-w-0 flex items-center justify-start gap-3 pl-[15px]"
          style={{ paddingLeft: 12 + (level - 1) * 12 }}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3 min-w-0">
              <span className={`font-medium truncate ${level === 1 ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                {category.name}
              </span>
              <Badge
                variant="outline"
                className={`shrink-0 text-xs px-2 py-0.5 ${style.bg} ${style.text} ${style.border}`}
              >
                {levelNames[level] || '세분류'}
              </Badge>
              {category.description && (
                <span className="hidden md:inline text-xs text-slate-400 dark:text-slate-500 truncate max-w-[200px]">
                  {category.description}
                </span>
              )}
            </div>
            {showPath && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSearchTerm(pathText);
                  const target = categoryRefs.current.get(category.id);
                  if (target) {
                    requestAnimationFrame(() => {
                      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    });
                  }
                  setHighlightId(category.id);
                  if (highlightTimeoutRef.current) {
                    clearTimeout(highlightTimeoutRef.current);
                  }
                  highlightTimeoutRef.current = setTimeout(() => {
                    setHighlightId(null);
                  }, HIGHLIGHT_DURATION_MS);
                }}
                className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500 truncate hover:text-slate-600 dark:hover:text-slate-300 transition-colors text-left"
                title="경로로 검색"
              >
                {pathText}
              </button>
            )}
          </div>
        </div>

        {/* 상품 수 */}
        <div className="hidden md:flex items-center justify-end w-20 shrink-0">
          <span className="text-sm text-slate-600 dark:text-slate-400 tabular-nums">{(category.productCount || 0).toLocaleString()}개</span>
        </div>

        {/* 상태 */}
        <div className="hidden sm:flex items-center justify-start w-20 shrink-0">
          <button
            onClick={() => handleToggleActive(category.id, category.isActive)}
            className={`
              inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors
              ${category.isActive
                ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/50'
                : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600'
              }
            `}
          >
            {category.isActive ? (
              <>
                <Eye className="w-3 h-3" />
                <span>활성</span>
              </>
            ) : (
              <>
                <EyeOff className="w-3 h-3" />
                <span>비활성</span>
              </>
            )}
          </button>
        </div>

        {/* 작업 버튼 */}
        <div className="w-[120px] lg:w-[140px] flex items-center justify-start gap-1 shrink-0">
          {/* 데스크탑: 인라인 버튼 */}
          <div className="hidden lg:flex items-center gap-1">
            {level < 4 && (
              <button
                onClick={() => handleAddCategory(category)}
                className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors"
                title="하위 카테고리 추가"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => handleEditCategory(category)}
              className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-primary-light hover:bg-primary/5 dark:hover:bg-primary/20 transition-colors"
              title="수정"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleDeleteCategory(category.id)}
              className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
              title="삭제"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* 모바일/태블릿: 드롭다운 메뉴 */}
          <div className="lg:hidden relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveDropdown(activeDropdown === category.id ? null : category.id);
              }}
              className="p-2 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>

            {activeDropdown === category.id && (
              <div
                className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-20"
                onClick={(e) => e.stopPropagation()}
              >
                {level < 4 && (
                  <button
                    onClick={() => handleAddCategory(category)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    하위 추가
                  </button>
                )}
                <button
                  onClick={() => handleEditCategory(category)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  수정
                </button>
                <button
                  onClick={() => handleDeleteCategory(category.id)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  삭제
                </button>
              </div>
            )}
          </div>
        </div>
      </div>,
    ];

    // 하위 카테고리 렌더링
    if (hasChildren && isExpanded) {
      category.children!.forEach((child, index) => {
        const isChildLast = index === category.children!.length - 1;
        items.push(
          ...renderCategoryItem(
            child,
            [...ancestorHasSiblings, !isLast],
            [...ancestorNames, category.name],
            isChildLast,
          ),
        );
      });
    }

    return items;
  };

  const getSelectableParentLevel = (): number => {
    if (editingCategory) {
      return editingCategory.level;
    }
    return 4;
  };

  if (isLoading) {
    return <LoadingSpinner message="카테고리 정보를 불러오는 중..." />;
  }

  return (
    <div className="space-y-6">
      {actionMsg && (
        <div className={`p-3 rounded-lg text-sm ${
          actionMsg.type === 'success'
            ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
            : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
        }`}>
          {actionMsg.text}
        </div>
      )}
      {/* 페이지 헤더 */}
      <PageHeader
        title="카테고리 관리"
        description={`전체 ${stats.totalCategories}개 카테고리를 관리합니다`}
        action={{
          label: '대분류 추가',
          onClick: () => handleAddCategory(),
          icon: Plus,
        }}
      />

      {/* 레벨별 통계 카드 */}
      <StatsGrid
        stats={[
          { label: '대분류', value: stats.level1Count, icon: FolderTree },
          { label: '중분류', value: stats.level2Count, icon: Folder },
          { label: '소분류', value: stats.level3Count, icon: Folder },
          { label: '세분류', value: stats.level4Count, icon: Folder },
        ]}
      />

      {/* 검색 및 액션 바 */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="카테고리명 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-10 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
          />
        </div>
        <div className="flex gap-2 flex-wrap sm:flex-nowrap">
          <div className="sm:hidden w-full">
            <select
              value={lineTone}
              onChange={(e) => setLineTone(e.target.value as LineTone)}
              className="h-10 w-full px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200"
            >
              <option value="blue">라인: 블루</option>
              <option value="slate">라인: 슬레이트</option>
              <option value="amber">라인: 앰버</option>
            </select>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLineTone('blue')}
              className={`h-10 px-3 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700 ${lineTone === 'blue' ? 'bg-primary/10 text-primary' : ''}`}
            >
              블루
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLineTone('slate')}
              className={`h-10 px-3 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700 ${lineTone === 'slate' ? 'bg-slate-100 text-slate-700 dark:bg-slate-700/60' : ''}`}
            >
              슬레이트
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLineTone('amber')}
              className={`h-10 px-3 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700 ${lineTone === 'amber' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : ''}`}
            >
              앰버
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLineStyle((prev) => (prev === 'solid' ? 'dashed' : 'solid'))}
            className="h-10 px-3 gap-1.5 w-full sm:w-auto dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {lineStyle === 'solid' ? '라인 점선' : '라인 실선'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLineWeight((prev) => (prev === 'thin' ? 'thick' : 'thin'))}
            className="h-10 px-3 gap-1.5 w-full sm:w-auto dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {lineWeight === 'thin' ? '라인 두껍게' : '라인 얇게'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPath((prev) => !prev)}
            className="h-10 px-3 gap-1.5 w-full sm:w-auto dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            {showPath ? '경로 숨기기' : '경로 표시'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpandedIds(new Set(allCategories.map((c) => c.id)))}
            className="h-10 px-3 gap-1.5 w-full sm:w-auto dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <ChevronDown className="w-4 h-4" />
            <span className="hidden sm:inline">전체 펼치기</span>
            <span className="sm:hidden">전체 펼치기</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpandedIds(new Set())}
            className="h-10 px-3 gap-1.5 w-full sm:w-auto dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <ChevronUp className="w-4 h-4" />
            <span className="hidden sm:inline">전체 접기</span>
            <span className="sm:hidden">전체 접기</span>
          </Button>
        </div>
      </div>

      {/* 카테고리 리스트 헤더 */}
      <Card className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden rounded-xl">
        {/* 헤더 */}
        <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-700/50 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
          <div className="w-[120px] sm:w-[140px] lg:w-[180px] shrink-0 text-left">계층</div>
          <div className="flex-1 min-w-0 text-left">카테고리명</div>
          <div className="hidden md:block w-20 text-right shrink-0">상품 수</div>
          <div className="hidden sm:block w-20 text-center shrink-0">상태</div>
          <div className="w-[120px] lg:w-[140px] text-center shrink-0">작업</div>
        </div>

        {/* 삭제 확인 UI */}
        {confirmAction?.action === 'delete' && (
          <div className="flex items-center gap-2 mx-4 my-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <span className="text-sm text-red-700 dark:text-red-400">정말 삭제하시겠습니까?</span>
            <Button size="sm" variant="outline" onClick={() => setConfirmAction(null)} className="h-7 text-xs">취소</Button>
            <Button size="sm" onClick={() => handleDeleteCategoryConfirmed(confirmAction.id)} className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white">삭제하기</Button>
          </div>
        )}

        {/* 카테고리 목록 */}
        <div className="divide-y divide-slate-100 dark:divide-slate-700">
          {filteredCategories.length > 0 ? (
            filteredCategories.map((category, index) => (
              <Fragment key={category.id}>
                {renderCategoryItem(category, [], [], index === filteredCategories.length - 1)}
              </Fragment>
            ))
          ) : (
            <div className="px-6 py-8">
              <EmptyState
                icon={<FolderTree className="w-12 h-12 text-slate-300 dark:text-slate-600" />}
                title={searchTerm ? '검색 결과가 없습니다.' : '등록된 카테고리가 없습니다.'}
                description={searchTerm ? '다른 검색어로 다시 시도해주세요.' : '첫 카테고리를 추가해보세요.'}
                actionLabel={!searchTerm ? '첫 카테고리 추가하기' : undefined}
                onAction={!searchTerm ? () => handleAddCategory() : undefined}
              />
            </div>
          )}
        </div>
      </Card>

      {/* 추가/수정 모달 */}
      <Modal
        isOpen={showAddModal}
        onClose={() => {
          setShowAddModal(false);
          setEditingCategory(null);
        }}
        size="md"
      >
        <ModalHeader
          title={editingCategory ? '카테고리 수정' : '카테고리 추가'}
        />
        <ModalBody>
          <div className="space-y-5">
            {/* 상위 카테고리 선택 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                상위 카테고리
              </label>
              <select
                value={formData.parentId}
                onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                className="w-full h-11 px-3 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={!!editingCategory}
              >
                <option value="">없음 (대분류)</option>
                {getParentCandidates(getSelectableParentLevel()).map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {'─'.repeat(cat.level - 1)} {cat.name} ({levelNames[cat.level]})
                  </option>
                ))}
              </select>
              {formData.parentId && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                  새 카테고리 레벨: {levelNames[((allCategories.find((c) => c.id === formData.parentId)?.level || 0) + 1)]}
                </p>
              )}
            </div>

            {/* 카테고리명 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                카테고리명 <span className="text-red-500">*</span>
              </label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="카테고리명을 입력하세요"
                className="h-11 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
              />
            </div>

            {/* 설명 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                설명
              </label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="카테고리 설명 (선택)"
                className="h-11 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
              />
            </div>

            {/* 표시 순서 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                표시 순서
              </label>
              <Input
                type="number"
                value={formData.displayOrder}
                onChange={(e) =>
                  setFormData({ ...formData, displayOrder: parseInt(e.target.value) || 0 })
                }
                placeholder="0"
                className="h-11 dark:bg-slate-700 dark:border-slate-600 dark:text-white"
              />
            </div>

            {/* 활성화 상태 */}
            <div className="flex items-center gap-3 py-1">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 dark:bg-slate-700"
              />
              <label htmlFor="isActive" className="text-sm text-slate-700 dark:text-slate-300">
                활성화 상태로 설정
              </label>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowAddModal(false);
              setEditingCategory(null);
            }}
            className="flex-1 h-11 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            취소
          </Button>
          <Button
            onClick={handleSaveCategory}
            className="flex-1 h-11 bg-primary hover:bg-primary-dark text-white"
          >
            {editingCategory ? '수정하기' : '추가하기'}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
