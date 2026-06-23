'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, RefreshCw, Plus } from 'lucide-react';

// ==================== 타입 정의 ====================

type ClassType = 'training' | 'competition' | 'match' | 'makeup';
type ClassStatus = 'active' | 'cancelled';

interface ClassFilterProps {
  searchTerm: string;
  onSearchChange: (value: string) => void;
  filterType: 'all' | ClassType;
  onFilterTypeChange: (value: 'all' | ClassType) => void;
  filterLevel: 'all' | string;
  onFilterLevelChange: (value: 'all' | string) => void;
  filterStatus: 'all' | ClassStatus;
  onFilterStatusChange: (value: 'all' | ClassStatus) => void;
  onRefresh: () => void;
  onAddClass: () => void;
  isSaving: boolean;
}

// ==================== 헬퍼 함수 ====================

function getLevelLabel(level: string) {
  switch (level) {
    case 'beginner': return '초급';
    case 'intermediate': return '중급';
    case 'advanced': return '고급';
    default: return level;
  }
}

function getClassTypeLabel(type: ClassType) {
  switch (type) {
    case 'training': return '훈련';
    case 'competition': return '대회';
    case 'match': return '시합';
    case 'makeup': return '보강';
  }
}

// ==================== 컴포넌트 ====================

export default function ClassFilter({
  searchTerm,
  onSearchChange,
  filterType,
  onFilterTypeChange,
  filterLevel,
  onFilterLevelChange,
  filterStatus,
  onFilterStatusChange,
  onRefresh,
  onAddClass,
  isSaving,
}: ClassFilterProps) {
  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1 relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="수업명, 강사로 검색..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10 h-11 bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
          />
        </div>
        <div className="flex gap-2">
          <Button
            onClick={onRefresh}
            variant="outline"
            className="h-11 gap-2 border-slate-200 dark:border-slate-600"
            disabled={isSaving}
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            onClick={onAddClass}
            className="gap-2 h-11 bg-cyan-700 hover:bg-cyan-800 text-white"
          >
            <Plus className="w-4 h-4" />
            <span>수업 추가</span>
          </Button>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-3">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
          {(['all', 'training', 'competition', 'match', 'makeup'] as const).map((type) => (
            <button
              key={type}
              onClick={() => onFilterTypeChange(type)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                filterType === type
                  ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {type === 'all' ? '전체' : getClassTypeLabel(type)}
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
          {(['all', 'beginner', 'intermediate', 'advanced'] as const).map((level) => (
            <button
              key={level}
              onClick={() => onFilterLevelChange(level)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                filterLevel === level
                  ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {level === 'all' ? '전체 레벨' : getLevelLabel(level)}
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 p-1 rounded-lg">
          {(['all', 'active', 'cancelled'] as const).map((status) => (
            <button
              key={status}
              onClick={() => onFilterStatusChange(status)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                filterStatus === status
                  ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {status === 'all' ? '전체 상태' : status === 'active' ? '활성' : '취소됨'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
