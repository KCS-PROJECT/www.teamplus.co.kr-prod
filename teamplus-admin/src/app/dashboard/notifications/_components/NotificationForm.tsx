'use client';

import { Button } from '@/components/ui/button';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { Send, CheckCircle, FileText } from 'lucide-react';
import RecipientSelector from './RecipientSelector';

// ==================== 타입 정의 ====================

type AlimtalkTemplate = 'payment_success' | 'membership_approved' | 'class_cancelled' | 'class_reminder' | 'credit_expiring' | 'custom';
type TargetType = 'all' | 'club' | 'class' | 'individual';

interface AlimtalkTemplateInfo {
  id: string;
  code: AlimtalkTemplate;
  name: string;
  description: string;
  variables: string[];
  example: string;
}

interface Member {
  id: string;
  name: string;
  phone: string;
  club: string;
  class: string;
}

interface NotificationFormProps {
  isOpen: boolean;
  selectedTemplate: string;
  targetType: TargetType;
  customMessage: string;
  searchMember: string;
  selectedMembers: string[];
  isSending: boolean;
  templates: AlimtalkTemplateInfo[];
  members: Member[];
  onTemplateChange: (code: string) => void;
  onTargetTypeChange: (type: TargetType) => void;
  onCustomMessageChange: (value: string) => void;
  onSearchMemberChange: (value: string) => void;
  onToggleMember: (memberId: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

// ==================== 컴포넌트 ====================

export default function NotificationForm({
  isOpen,
  selectedTemplate,
  targetType,
  customMessage,
  searchMember,
  selectedMembers,
  isSending,
  templates,
  members,
  onTemplateChange,
  onTargetTypeChange,
  onCustomMessageChange,
  onSearchMemberChange,
  onToggleMember,
  onSubmit,
  onClose,
}: NotificationFormProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
    >
      <ModalHeader
        title="알림톡 발송"
        description="카카오 알림톡을 회원에게 발송합니다."
      />
      <ModalBody scrollable maxHeight="60vh">
        <div className="space-y-6">
          {/* Template Selection */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              템플릿 선택 <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => onTemplateChange(template.code)}
                  className={`p-4 text-left border rounded-lg transition-colors ${
                    selectedTemplate === template.code
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                      : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {template.name}
                    </h4>
                    {selectedTemplate === template.code && (
                      <CheckCircle className="w-4 h-4 text-amber-500" />
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{template.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Template Preview */}
          {selectedTemplate && selectedTemplate !== 'custom' && (
            <div className="p-4 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-200 dark:border-slate-600">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">템플릿 미리보기</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {templates.find((t) => t.code === selectedTemplate)?.example}
              </p>
            </div>
          )}

          {/* Custom Message */}
          {selectedTemplate === 'custom' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                커스텀 메시지 <span className="text-red-500">*</span>
              </label>
              <textarea
                placeholder="발송할 메시지를 입력하세요..."
                value={customMessage}
                onChange={(e) => onCustomMessageChange(e.target.value)}
                className="w-full h-32 px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 focus:outline-none resize-none"
              />
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                ※ 커스텀 메시지는 카카오 비즈니스 사전 승인이 필요합니다.
              </p>
            </div>
          )}

          {/* Target Selection */}
          <RecipientSelector
            targetType={targetType}
            searchMember={searchMember}
            selectedMembers={selectedMembers}
            members={members}
            onTargetTypeChange={onTargetTypeChange}
            onSearchMemberChange={onSearchMemberChange}
            onToggleMember={onToggleMember}
          />
        </div>
      </ModalBody>
      <ModalFooter>
        <Button
          onClick={onClose}
          variant="outline"
          className="flex-1 h-11 border-slate-200 dark:border-slate-600"
          disabled={isSending}
        >
          취소
        </Button>
        <Button
          onClick={onSubmit}
          className="flex-1 h-11 bg-amber-500 hover:bg-amber-600 text-white gap-2"
          disabled={isSending}
        >
          {isSending ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              발송 중...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" />
              알림톡 발송
            </>
          )}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
