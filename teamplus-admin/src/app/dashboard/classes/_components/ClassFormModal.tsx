'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';

// ==================== 타입 정의 ====================

type ClassType = 'training' | 'competition' | 'match' | 'makeup';
type AgeRestriction = 'none' | '8' | '10' | '12';

interface ClubItem {
  id: string;
  clubName: string;
}

interface ClassFormData {
  className: string;
  coach: string;
  startTime: string;
  endTime: string;
  capacity: string;
  level: string;
  classType: ClassType;
  ageRestriction: AgeRestriction;
  selectedClubId: string;
}

interface ClassFormModalProps {
  isOpen: boolean;
  isEditing: boolean;
  formData: ClassFormData;
  clubs: ClubItem[];
  isSaving: boolean;
  onFormChange: (data: ClassFormData) => void;
  onSubmit: () => void;
  onClose: () => void;
}

// ==================== 컴포넌트 ====================

export default function ClassFormModal({
  isOpen,
  isEditing,
  formData,
  clubs,
  isSaving,
  onFormChange,
  onSubmit,
  onClose,
}: ClassFormModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="full">
      <ModalHeader title={isEditing ? '수업 수정' : '수업 추가'} />
      <ModalBody scrollable maxHeight="70vh">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 클럽 선택 (새 수업만) */}
            {!isEditing && (
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  클럽 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.selectedClubId}
                  onChange={(e) => onFormChange({ ...formData, selectedClubId: e.target.value })}
                  className="w-full h-11 px-3 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
                >
                  <option value="">클럽을 선택해주세요</option>
                  {clubs.map((club) => (
                    <option key={club.id} value={club.id}>
                      {club.clubName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 수업명 */}
            <div className="col-span-1 sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                수업명 <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="예: 초급 정규 훈련"
                value={formData.className}
                onChange={(e) => onFormChange({ ...formData, className: e.target.value })}
                className="h-11 bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 dark:text-white focus:border-primary focus:ring-primary"
              />
            </div>

            {/* 수업 유형 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                수업 유형 <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.classType}
                onChange={(e) =>
                  onFormChange({
                    ...formData,
                    classType: e.target.value as ClassType,
                    ageRestriction:
                      e.target.value === 'training' || e.target.value === 'makeup'
                        ? 'none'
                        : formData.ageRestriction,
                  })
                }
                className="w-full h-11 px-3 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              >
                <option value="training">훈련</option>
                <option value="competition">대회</option>
                <option value="match">시합</option>
                <option value="makeup">보강</option>
              </select>
            </div>

            {/* 나이 제한 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                나이 제한
                {(formData.classType === 'competition' || formData.classType === 'match') && (
                  <span className="text-amber-600 dark:text-amber-400 text-xs ml-2">(권장)</span>
                )}
              </label>
              <select
                value={formData.ageRestriction}
                onChange={(e) =>
                  onFormChange({ ...formData, ageRestriction: e.target.value as AgeRestriction })
                }
                disabled={formData.classType === 'training' || formData.classType === 'makeup'}
                className={`w-full h-11 px-3 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none ${
                  formData.classType === 'training' || formData.classType === 'makeup'
                    ? 'opacity-50 cursor-not-allowed'
                    : ''
                }`}
              >
                <option value="none">제한 없음</option>
                <option value="8">U-8 (8세 이하)</option>
                <option value="10">U-10 (10세 이하)</option>
                <option value="12">U-12 (12세 이하)</option>
              </select>
            </div>

            {/* 담당 코치 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                담당 코치 <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="코치 이름"
                value={formData.coach}
                onChange={(e) => onFormChange({ ...formData, coach: e.target.value })}
                className="h-11 bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 dark:text-white focus:border-primary focus:ring-primary"
              />
            </div>

            {/* 레벨 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                레벨 <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.level}
                onChange={(e) => onFormChange({ ...formData, level: e.target.value })}
                className="w-full h-11 px-3 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none"
              >
                <option value="beginner">초급</option>
                <option value="intermediate">중급</option>
                <option value="advanced">고급</option>
              </select>
            </div>

            {/* 시작 시간 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                시작 시간 <span className="text-red-500">*</span>
              </label>
              <Input
                type="time"
                value={formData.startTime}
                onChange={(e) => onFormChange({ ...formData, startTime: e.target.value })}
                className="h-11 bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 dark:text-white focus:border-primary focus:ring-primary"
              />
            </div>

            {/* 종료 시간 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                종료 시간 <span className="text-red-500">*</span>
              </label>
              <Input
                type="time"
                value={formData.endTime}
                onChange={(e) => onFormChange({ ...formData, endTime: e.target.value })}
                className="h-11 bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 dark:text-white focus:border-primary focus:ring-primary"
              />
            </div>

            {/* 정원 */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                정원 <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                placeholder="15"
                value={formData.capacity}
                onChange={(e) => onFormChange({ ...formData, capacity: e.target.value })}
                className="h-11 bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 dark:text-white focus:border-primary focus:ring-primary"
              />
            </div>
        </div>
      </ModalBody>

      <ModalFooter className="border-t border-slate-200 dark:border-slate-700">
        <Button
          onClick={onClose}
          variant="outline"
          className="flex-1 h-11 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          disabled={isSaving}
        >
          취소
        </Button>
        <Button
          onClick={onSubmit}
          className="flex-1 h-11 bg-cyan-700 hover:bg-cyan-800 text-white"
          disabled={isSaving}
        >
          {isSaving ? '저장 중...' : isEditing ? '수정하기' : '추가하기'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
