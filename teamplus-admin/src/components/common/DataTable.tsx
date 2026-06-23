'use client';

/**
 * DataTable - 정렬/필터/페이지네이션 통합 테이블
 * AI 스타일 금지: gradient, blur 미사용
 */

import { ReactNode, useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// ============================================
// 타입 정의
// ============================================

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  /** 페이지네이션 */
  pagination?: {
    page: number;
    pageSize: number;
    totalItems: number;
    onPageChange: (page: number) => void;
    onPageSizeChange?: (size: number) => void;
  };
  /** 정렬 상태 */
  sort?: {
    key: string;
    order: 'asc' | 'desc';
    onChange: (key: string, order: 'asc' | 'desc') => void;
  };
  /** 로딩 상태 */
  isLoading?: boolean;
  /** 행 클릭 */
  onRowClick?: (row: T) => void;
  /** 빈 상태 메시지 */
  emptyMessage?: string;
  /** 추가 클래스 */
  className?: string;
  /** 행 key 추출 */
  rowKey?: (row: T) => string;
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

// ============================================
// DataTable 컴포넌트
// ============================================

export function DataTable<T extends object>({
  data,
  columns,
  pagination,
  sort,
  isLoading = false,
  onRowClick,
  emptyMessage = '데이터가 없습니다.',
  className,
  rowKey,
}: DataTableProps<T>) {
  const [internalPage, _setInternalPage] = useState(1);

  const currentPage = pagination?.page ?? internalPage;
  const totalPages = pagination
    ? Math.ceil(pagination.totalItems / pagination.pageSize)
    : 1;

  const handleSort = (key: string) => {
    if (!sort) return;
    const newOrder = sort.key === key && sort.order === 'asc' ? 'desc' : 'asc';
    sort.onChange(key, newOrder);
  };

  const SortIcon = ({ colKey }: { colKey: string }) => {
    if (!sort || sort.key !== colKey) {
      return <ChevronsUpDown className="w-3.5 h-3.5 text-slate-400" />;
    }
    return sort.order === 'asc' ? (
      <ChevronUp className="w-3.5 h-3.5 text-primary" />
    ) : (
      <ChevronDown className="w-3.5 h-3.5 text-primary" />
    );
  };

  return (
    <div className={cn('w-full', className)}>
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-sm">
          {/* 헤더 */}
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    'px-4 py-3 font-semibold text-slate-600 dark:text-slate-300',
                    col.align === 'center' && 'text-center',
                    col.align === 'right' && 'text-right',
                    !col.align && 'text-left',
                    col.sortable && 'cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors',
                    col.className
                  )}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <div className={cn(
                    'flex items-center gap-1',
                    col.align === 'center' && 'justify-center',
                    col.align === 'right' && 'justify-end',
                  )}>
                    {col.header}
                    {col.sortable && <SortIcon colKey={col.key} />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          {/* 바디 */}
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-slate-100 dark:border-slate-700/50">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-16 text-center text-slate-400 dark:text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => {
                const key = rowKey ? rowKey(row) : String(rowIndex);
                return (
                  <tr
                    key={key}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      'border-b border-slate-100 dark:border-slate-700/50 bg-white dark:bg-slate-800',
                      'transition-colors',
                      onRowClick && 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50',
                      rowIndex === data.length - 1 && 'border-b-0'
                    )}
                  >
                    {columns.map((col) => {
                      const value = (row as Record<string, unknown>)[col.key];
                      return (
                        <td
                          key={col.key}
                          className={cn(
                            'px-4 py-3 text-slate-700 dark:text-slate-300',
                            col.align === 'center' && 'text-center',
                            col.align === 'right' && 'text-right',
                            col.className
                          )}
                        >
                          {col.render
                            ? col.render(row)
                            : value != null
                            ? String(value)
                            : '-'}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 px-1">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            전체 <span className="font-semibold text-slate-700 dark:text-slate-300">{pagination.totalItems.toLocaleString()}</span>건
          </p>

          <div className="flex items-center gap-2">
            {pagination.onPageSizeChange && (
              <select
                value={pagination.pageSize}
                onChange={(e) => pagination.onPageSizeChange!(Number(e.target.value))}
                className="h-8 px-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size}개씩</option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => pagination.onPageChange(currentPage - 1)}
                disabled={currentPage <= 1}
                className="h-8 w-8 p-0 border-slate-200 dark:border-slate-600"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>

              <span className="text-sm text-slate-600 dark:text-slate-400 px-2">
                {currentPage} / {totalPages}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => pagination.onPageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="h-8 w-8 p-0 border-slate-200 dark:border-slate-600"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DataTable;
