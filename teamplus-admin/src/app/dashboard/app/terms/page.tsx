'use client';

/**
 * 약관 관리 페이지 - TEAMPLUS
 *
 * === Design 7 Principles 적용 ===
 * 1. 화면 분석: 서비스 약관, 개인정보처리방침 관리
 * 2. 휴먼 디자인: 문서 편집 기능
 * 3. AI 스타일 금지: gradient, blur 미사용
 * 4. 페르소나 융합: frontend + architect
 * 5. Tone & Manner: 존댓말, 액션 동사
 */

import { useState, useEffect, useCallback, useId } from 'react';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { FileText, Plus, Edit2, Eye, Clock, CheckCircle2, Save } from 'lucide-react';

interface TermItem {
  id: string;
  type: string;
  title: string;
  content: string;
  version: string;
  isActive: boolean;
  publishedAt: string | null;
  updatedAt: string;
  createdAt: string;
}

export default function TermsManagementPage() {
  const editVersionId = useId();
  const editContentId = useId();
  const termTypeGroupId = useId();
  const newTermTitleId = useId();
  const newTermContentId = useId();
  const [isLoading, setIsLoading] = useState(true);
  const [terms, setTerms] = useState<TermItem[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<TermItem | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editorContent, setEditorContent] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newTerm, setNewTerm] = useState({
    type: 'service' as string,
    title: '',
    content: '',
  });
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadTerms = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<TermItem[]>('/app/terms');
      setTerms(res ?? []);
    } catch {
      setTerms([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTerms();
  }, [loadTerms]);

  const handleEdit = (term: typeof terms[0]) => {
    setSelectedTerm(term);
    setEditorContent(term.content || '');
    setShowEditor(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedTerm) return;
    setIsSaving(true);
    try {
      const updated = await api.put<TermItem>(`/app/terms/${selectedTerm.id}`, {
        content: editorContent,
      });
      setTerms(prev => prev.map(t => t.id === selectedTerm.id ? { ...t, ...updated } : t));
      setShowEditor(false);
    } catch {
      setActionMsg({ type: 'error', text: MESSAGES.save.error });
      setTimeout(() => setActionMsg(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'service':
        return <FileText className="w-5 h-5 text-primary" />;
      case 'privacy':
        return <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />;
      case 'location':
        return <FileText className="w-5 h-5 text-amber-600 dark:text-amber-400" />;
      case 'marketing':
        return <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />;
      case 'child':
        return <FileText className="w-5 h-5 text-red-600 dark:text-red-400" />;
      case 'refund':
        return <FileText className="w-5 h-5 text-sky-600 dark:text-sky-400" />;
      case 'community_guideline':
        return <FileText className="w-5 h-5 text-teal-600 dark:text-teal-400" />;
      default:
        return <FileText className="w-5 h-5 text-slate-600 dark:text-slate-400" />;
    }
  };

  const getTypeBgColor = (type: string) => {
    switch (type) {
      case 'service': return 'bg-primary/10';
      case 'privacy': return 'bg-emerald-100 dark:bg-emerald-900/30';
      case 'location': return 'bg-amber-100 dark:bg-amber-900/30';
      case 'marketing': return 'bg-purple-100 dark:bg-purple-900/30';
      case 'child': return 'bg-red-100 dark:bg-red-900/30';
      case 'refund': return 'bg-sky-100 dark:bg-sky-900/30';
      case 'community_guideline': return 'bg-teal-100 dark:bg-teal-900/30';
      default: return 'bg-slate-100 dark:bg-slate-700';
    }
  };

  const termTypeOptions = [
    { value: 'service', label: '서비스 이용약관', color: 'text-primary' },
    { value: 'privacy', label: '개인정보 처리방침', color: 'text-emerald-600 dark:text-emerald-400' },
    { value: 'location', label: '위치정보 이용약관', color: 'text-amber-600 dark:text-amber-400' },
    { value: 'marketing', label: '마케팅 정보 수신 동의', color: 'text-purple-600 dark:text-purple-400' },
    { value: 'child', label: '아동 개인정보 수집 동의', color: 'text-red-600 dark:text-red-400' },
    { value: 'refund', label: '환불 규정', color: 'text-sky-600 dark:text-sky-400' },
    { value: 'community_guideline', label: '커뮤니티 운영 규칙', color: 'text-teal-600 dark:text-teal-400' },
  ];

  const handleAddTerm = async () => {
    if (!newTerm.title || !newTerm.content) {
      setActionMsg({ type: 'error', text: MESSAGES.terms.requiredFields });
      setTimeout(() => setActionMsg(null), 3000);
      return;
    }
    try {
      const created = await api.post<TermItem>('/app/terms', {
        type: newTerm.type,
        title: newTerm.title,
        content: newTerm.content,
        version: '1.0',
        isActive: true,
      });
      setTerms(prev => [...prev, created]);
    } catch {
      setActionMsg({ type: 'error', text: MESSAGES.terms.createError });
      setTimeout(() => setActionMsg(null), 3000);
    }
    setNewTerm({ type: 'service', title: '', content: '' });
    setShowAddModal(false);
  };

  const handlePreview = (term: typeof terms[0]) => {
    setSelectedTerm(term);
    setShowPreviewModal(true);
  };

  if (isLoading) {
    return <LoadingSpinner message="약관 정보를 불러오는 중..." />;
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
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">약관 관리</h1>
        <p className="text-base text-slate-500 dark:text-slate-400 mt-2">서비스 약관 및 정책 문서를 관리합니다</p>
      </div>
        {/* 약관 목록 */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">약관 목록</h2>
              <Button type="button" onClick={() => setShowAddModal(true)} className="h-12 px-5 text-base font-bold bg-primary hover:bg-primary-dark gap-2">
                <Plus className="w-4 h-4" aria-hidden="true" />
                새 약관 등록
              </Button>
            </div>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {terms.map((term) => (
              <div key={term.id} className="p-6 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors motion-reduce:transition-none">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className={`w-12 h-12 ${getTypeBgColor(term.type)} rounded-xl flex items-center justify-center flex-shrink-0`}>
                    {getTypeIcon(term.type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900 dark:text-white">{term.title}</h3>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-slate-500 dark:text-slate-400">
                      <span className="tabular-nums">버전 {term.version}</span>
                      <span className="flex items-center gap-1 tabular-nums">
                        <Clock className="w-4 h-4" aria-hidden="true" />
                        {term.updatedAt.split('T')[0]} 수정
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full text-xs font-medium">
                      <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                      적용 중
                    </span>
                    <button
                      type="button"
                      onClick={() => handleEdit(term)}
                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors motion-reduce:transition-none"
                      title="수정하기"
                      aria-label="수정하기"
                    >
                      <Edit2 className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePreview(term)}
                      className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors motion-reduce:transition-none"
                      title="미리보기"
                      aria-label="미리보기"
                    >
                      <Eye className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 편집 영역 */}
        {showEditor && selectedTerm && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{selectedTerm.title} 편집</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">현재 버전: {selectedTerm.version}</p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowEditor(false)} className="h-12 px-5 text-base font-bold dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">
                    취소
                  </Button>
                  <Button type="button" onClick={handleSaveEdit} disabled={isSaving} className="h-12 px-5 text-base font-bold bg-primary hover:bg-primary-dark gap-2">
                    <Save className="w-4 h-4" aria-hidden="true" />
                    {isSaving ? '저장 중...' : '저장'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <label htmlFor={editVersionId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">새 버전 번호</label>
                <input
                  id={editVersionId}
                  type="text"
                  defaultValue={selectedTerm.version}
                  placeholder="예: 1.0.1"
                  aria-label="새 버전 번호"
                  className="w-32 px-3 py-2 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm dark:text-white"
                />
              </div>
              <div>
                <label htmlFor={editContentId} className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">약관 내용</label>
                <textarea
                  id={editContentId}
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  placeholder="약관 본문을 입력해주세요"
                  aria-label="약관 내용 편집"
                  rows={15}
                  className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-mono dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )}

      {/* 새 약관 등록 모달 */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} size="lg">
        <ModalHeader title="새 약관 등록" icon={FileText} />
        <ModalBody>
          <div className="space-y-5">
            {/* 약관 유형 */}
            <div className="space-y-2" role="radiogroup" aria-labelledby={termTypeGroupId}>
              <label id={termTypeGroupId} className="block text-sm font-medium text-slate-700 dark:text-slate-300">약관 유형</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {termTypeOptions.map((option) => {
                  const radioId = `${termTypeGroupId}-${option.value}`;
                  return (
                    <label
                      key={option.value}
                      htmlFor={radioId}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        newTerm.type === option.value
                          ? 'border-primary bg-primary/5 dark:bg-primary/10'
                          : 'border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                      }`}
                    >
                      <input
                        id={radioId}
                        type="radio"
                        name="termType"
                        value={option.value}
                        checked={newTerm.type === option.value}
                        onChange={(e) => setNewTerm({ ...newTerm, type: e.target.value })}
                        aria-label={`약관 유형 ${option.label}`}
                        className="w-4 h-4 text-primary"
                      />
                      <span className={`text-sm font-medium ${option.color}`}>{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* 제목 */}
            <div className="space-y-2">
              <label htmlFor={newTermTitleId} className="block text-sm font-medium text-slate-700 dark:text-slate-300">약관 제목</label>
              <Input
                id={newTermTitleId}
                value={newTerm.title}
                onChange={(e) => setNewTerm({ ...newTerm, title: e.target.value })}
                placeholder="약관 제목을 입력해주세요"
                aria-label="약관 제목"
                aria-required="true"
                className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
              />
            </div>

            {/* 내용 */}
            <div className="space-y-2">
              <label htmlFor={newTermContentId} className="block text-sm font-medium text-slate-700 dark:text-slate-300">약관 내용</label>
              <textarea
                id={newTermContentId}
                value={newTerm.content}
                onChange={(e) => setNewTerm({ ...newTerm, content: e.target.value })}
                placeholder="약관 본문 내용을 입력해주세요"
                aria-label="약관 내용"
                aria-required="true"
                rows={10}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-mono dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowAddModal(false)}
            className="flex-1 h-12 px-5 text-base font-bold border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={handleAddTerm}
            className="flex-1 h-12 px-5 text-base font-bold bg-primary hover:bg-primary-dark text-white"
          >
            등록하기
          </Button>
        </ModalFooter>
      </Modal>

      {/* 약관 미리보기 모달 */}
      <Modal isOpen={showPreviewModal} onClose={() => setShowPreviewModal(false)} size="xl">
        <ModalHeader title={`${selectedTerm?.title || ''} 미리보기`} icon={Eye} />
        <ModalBody scrollable maxHeight="70vh">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 ${getTypeBgColor(selectedTerm?.type || 'service')} rounded-lg flex items-center justify-center`}>
                  {getTypeIcon(selectedTerm?.type || 'service')}
                </div>
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{selectedTerm?.title}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">버전 {selectedTerm?.version} · {selectedTerm?.updatedAt?.split('T')[0]}</p>
                </div>
              </div>
            </div>
            <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg">
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                {selectedTerm?.content || '(내용 없음)'}
              </p>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowPreviewModal(false)}
            className="h-12 px-5 text-base font-bold border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            닫기
          </Button>
          <Button
            type="button"
            onClick={() => {
              setShowPreviewModal(false);
              if (selectedTerm) handleEdit(selectedTerm);
            }}
            className="h-12 px-5 text-base font-bold bg-primary hover:bg-primary-dark text-white gap-2"
          >
            <Edit2 className="w-4 h-4" aria-hidden="true" />
            수정하기
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
