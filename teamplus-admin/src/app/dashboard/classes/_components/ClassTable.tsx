'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal, ModalHeader, ModalBody, ModalFooter, ConfirmModal } from '@/components/ui/modal';
import {
  Edit2, Trash2, Users, Clock,
  XCircle, RefreshCw, AlertTriangle, Trophy, Swords, GraduationCap, BookOpen, CalendarDays
} from 'lucide-react';

// ==================== 타입 정의 ====================

type ClassType = 'training' | 'competition' | 'match' | 'makeup';
type AgeRestriction = 'none' | '8' | '10' | '12';
type ClassStatus = 'active' | 'cancelled';

interface ClassSchedule {
  id: string;
  clubId: string;
  className: string;
  coach: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  capacity: number;
  enrolled: number;
  level: string;
  classType: ClassType;
  ageRestriction: AgeRestriction;
  status: ClassStatus;
  cancelReason?: string;
}

interface ClassTableProps {
  filteredClasses: ClassSchedule[];
  totalCount: number;
  isSaving: boolean;
  cancellingClass: ClassSchedule | null;
  cancelReason: string;
  deletingClassId: string | null;
  onEditClass: (cls: ClassSchedule) => void;
  onCancelClass: (cls: ClassSchedule) => void;
  onReactivateClass: (cls: ClassSchedule) => void;
  onDeleteRequest: (id: string) => void;
  onDeleteConfirm: (id: string) => void;
  onDeleteCancel: () => void;
  onCancelConfirm: () => void;
  onCancelModalClose: () => void;
  onCancelReasonChange: (value: string) => void;
}

// ==================== 헬퍼 함수 ====================

function getLevelColor(level: string) {
  switch (level) {
    case 'beginner': return 'bg-primary/5 text-blue-700 border-blue-200';
    case 'intermediate': return 'bg-cyan-50 text-cyan-700 border-cyan-200';
    case 'advanced': return 'bg-amber-50 text-amber-700 border-amber-200';
    default: return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}

function getLevelLabel(level: string) {
  switch (level) {
    case 'beginner': return '초급';
    case 'intermediate': return '중급';
    case 'advanced': return '고급';
    default: return level;
  }
}

function getClassTypeIcon(type: ClassType) {
  switch (type) {
    case 'training': return <GraduationCap className="w-4 h-4" />;
    case 'competition': return <Trophy className="w-4 h-4" />;
    case 'match': return <Swords className="w-4 h-4" />;
    case 'makeup': return <BookOpen className="w-4 h-4" />;
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

function getClassTypeColor(type: ClassType) {
  switch (type) {
    case 'training': return 'bg-primary/10 text-blue-700';
    case 'competition': return 'bg-amber-100 text-amber-700';
    case 'match': return 'bg-red-100 text-red-700';
    case 'makeup': return 'bg-green-100 text-green-700';
  }
}

function getAgeRestrictionLabel(age: AgeRestriction) {
  if (age === 'none') return null;
  return `U-${age}`;
}

function getCapacityColor(enrolled: number, capacity: number) {
  const pct = capacity > 0 ? (enrolled / capacity) * 100 : 0;
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-amber-500';
  return 'bg-cyan-500';
}

// ==================== 컴포넌트 ====================

export default function ClassTable({
  filteredClasses,
  totalCount,
  isSaving,
  cancellingClass,
  cancelReason,
  deletingClassId,
  onEditClass,
  onCancelClass,
  onReactivateClass,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
  onCancelConfirm,
  onCancelModalClose,
  onCancelReasonChange,
}: ClassTableProps) {
  return (
    <>
      {/* 수업 목록 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredClasses.map((cls) => (
          <Card
            key={cls.id}
            className={`bg-white dark:bg-slate-800 border overflow-hidden transition-shadow ${
              cls.status === 'cancelled'
                ? 'border-red-200 dark:border-red-800 opacity-75'
                : 'border-slate-200 dark:border-slate-700 hover:shadow-md'
            }`}
          >
            <div
              className={`px-4 py-2 flex items-center justify-between ${
                cls.status === 'cancelled'
                  ? 'bg-red-50 dark:bg-red-900/20'
                  : cls.classType === 'training'
                  ? 'bg-primary/5 dark:bg-primary/10'
                  : cls.classType === 'competition'
                  ? 'bg-amber-50 dark:bg-amber-900/20'
                  : cls.classType === 'match'
                  ? 'bg-red-50 dark:bg-red-900/20'
                  : 'bg-green-50 dark:bg-green-900/20'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${getClassTypeColor(cls.classType)}`}
                >
                  {getClassTypeIcon(cls.classType)}
                  {getClassTypeLabel(cls.classType)}
                </span>
                {cls.ageRestriction !== 'none' && (
                  <Badge
                    variant="outline"
                    className="bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-xs"
                  >
                    {getAgeRestrictionLabel(cls.ageRestriction)}
                  </Badge>
                )}
              </div>
              {cls.status === 'cancelled' && (
                <Badge
                  variant="outline"
                  className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-300 dark:border-red-700 text-xs"
                >
                  취소됨
                </Badge>
              )}
            </div>

            <div className="p-5">
              <div className="mb-4">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3
                    className={`text-lg font-bold ${
                      cls.status === 'cancelled'
                        ? 'text-slate-500 dark:text-slate-400 line-through'
                        : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {cls.className}
                  </h3>
                  <Badge variant="outline" className={`${getLevelColor(cls.level)} border shrink-0`}>
                    {getLevelLabel(cls.level)}
                  </Badge>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">{cls.coach} 코치</p>
              </div>

              {cls.status === 'cancelled' && cls.cancelReason && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-800">
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">취소 사유</p>
                  <p className="text-sm text-red-700 dark:text-red-300">{cls.cancelReason}</p>
                </div>
              )}

              <div className="space-y-2.5 mb-4">
                <div className="flex items-center gap-2.5 text-sm">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-600 dark:text-slate-400">
                    {cls.startTime && cls.endTime ? `${cls.startTime} - ${cls.endTime}` : '-'}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 text-sm">
                  <Users className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-600 dark:text-slate-400">
                    {cls.enrolled}/{cls.capacity}명
                  </span>
                </div>
              </div>

              {cls.status === 'active' && cls.capacity > 0 && (
                <div className="mb-4">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-slate-500 dark:text-slate-400">등록 현황</span>
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      {Math.round((cls.enrolled / cls.capacity) * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${getCapacityColor(cls.enrolled, cls.capacity)}`}
                      style={{ width: `${Math.min((cls.enrolled / cls.capacity) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-3">
                {cls.status === 'active' ? (
                  <>
                    <Button
                      onClick={() => onEditClass(cls)}
                      variant="outline"
                      className="flex-1 h-10 gap-2 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-primary/5 hover:border-primary/30 hover:text-blue-700"
                      disabled={isSaving}
                    >
                      <Edit2 className="w-4 h-4" />
                      수정
                    </Button>
                    <Button
                      onClick={() => onCancelClass(cls)}
                      variant="outline"
                      className="flex-1 h-10 gap-2 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-700"
                      disabled={isSaving}
                    >
                      <XCircle className="w-4 h-4" />
                      취소
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={() => onReactivateClass(cls)}
                      variant="outline"
                      className="flex-1 h-10 gap-2 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-green-50 hover:border-green-200 hover:text-green-700"
                      disabled={isSaving}
                    >
                      <RefreshCw className="w-4 h-4" />
                      재활성화
                    </Button>
                    <Button
                      onClick={() => onDeleteRequest(cls.id)}
                      variant="outline"
                      className="flex-1 h-10 gap-2 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-red-50 hover:border-red-200 hover:text-red-600"
                      disabled={isSaving}
                    >
                      <Trash2 className="w-4 h-4" />
                      삭제
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredClasses.length === 0 && (
        <Card className="p-12 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
          <CalendarDays className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 dark:text-slate-400">
            {totalCount === 0 ? '등록된 수업이 없습니다.' : '검색 결과가 없습니다.'}
          </p>
        </Card>
      )}

      {/* 수업 취소 모달 */}
      <Modal
        isOpen={!!cancellingClass}
        onClose={onCancelModalClose}
        size="md"
      >
        <ModalHeader
          title="수업을 취소하시겠습니까?"
          description={cancellingClass ? `"${cancellingClass.className}"` : ''}
          icon={AlertTriangle}
          iconBgColor="bg-amber-100 dark:bg-amber-900/30"
          iconColor="text-amber-600 dark:text-amber-400"
          centered
        />
        <ModalBody>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3 mb-4">
            <p className="text-sm text-amber-800 dark:text-amber-300">
              <strong>중요:</strong> 취소 시 등록된 {cancellingClass?.enrolled || 0}명의 회원에게
              수업 크레딧이 자동으로 복구됩니다.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              취소 사유 <span className="text-red-500">*</span>
            </label>
            <textarea
              placeholder="취소 사유를 입력해주세요..."
              value={cancelReason}
              onChange={(e) => onCancelReasonChange(e.target.value)}
              className="w-full h-24 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none resize-none"
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            onClick={onCancelModalClose}
            variant="outline"
            className="flex-1 h-11 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
            disabled={isSaving}
          >
            돌아가기
          </Button>
          <Button
            onClick={onCancelConfirm}
            className="flex-1 h-11 bg-amber-600 hover:bg-amber-700 text-white"
            disabled={isSaving}
          >
            {isSaving ? '처리 중...' : '수업 취소하기'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* 삭제 확인 모달 */}
      <ConfirmModal
        isOpen={!!deletingClassId}
        onClose={onDeleteCancel}
        onConfirm={() => deletingClassId && onDeleteConfirm(deletingClassId)}
        title="수업을 삭제하시겠습니까?"
        description="이 작업은 되돌릴 수 없습니다."
        variant="danger"
        confirmText="삭제하기"
        cancelText="취소"
      />
    </>
  );
}
