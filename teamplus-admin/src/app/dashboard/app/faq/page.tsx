'use client';

/**
 * FAQ 관리 페이지 - TEAMPLUS
 *
 * === Design 7 Principles 적용 ===
 * 1. 화면 분석: 자주 묻는 질문 카테고리별 관리
 * 2. 휴먼 디자인: 아코디언 형태의 FAQ 리스트
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
import {
  HelpCircle, Plus, Edit2, Trash2, ChevronDown, ChevronUp,
  Search, GripVertical, EyeOff, Tag, AlertCircle
} from 'lucide-react';

interface FAQ {
  id: string;
  category: string;
  question: string;
  answer: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const categories = [
  { value: 'account', label: '계정/로그인', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-primary-light' },
  { value: 'class', label: '수업/클래스', color: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' },
  { value: 'payment', label: '결제/환불', color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' },
  { value: 'attendance', label: '출석/크레딧', color: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
  { value: 'app', label: '앱 사용', color: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
];


export default function FAQManagementPage() {
  const filterCategoryId = useId();
  const searchInputId = useId();
  const formCategoryId = useId();
  const formQuestionId = useId();
  const formAnswerId = useId();
  const formActiveId = useId();
  const [isLoading, setIsLoading] = useState(true);
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedIds, setExpandedIds] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editingFaq, setEditingFaq] = useState<FAQ | null>(null);
  const [faqToDelete, setFaqToDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    category: 'account',
    question: '',
    answer: '',
    isActive: true,
  });
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadFaqs = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await api.get<FAQ[]>('/app/faqs');
      setFaqs(data ?? []);
    } catch (error) {
      console.error('[FAQ] 로드 실패:', error);
      setFaqs([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFaqs();
  }, [loadFaqs]);

  const filteredFaqs = faqs.filter(faq => {
    const matchesSearch = faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          faq.answer.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || faq.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const toggleExpand = (id: string) => {
    setExpandedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const getCategoryInfo = (categoryValue: string) => {
    return categories.find(c => c.value === categoryValue) || { label: categoryValue, color: 'bg-slate-100 text-slate-600' };
  };

  const handleOpenAddModal = () => {
    setEditingFaq(null);
    setFormData({ category: 'account', question: '', answer: '', isActive: true });
    setShowModal(true);
  };

  const handleOpenEditModal = (faq: FAQ) => {
    setEditingFaq(faq);
    setFormData({
      category: faq.category,
      question: faq.question,
      answer: faq.answer,
      isActive: faq.isActive,
    });
    setShowModal(true);
  };

  const handleSaveFaq = async () => {
    if (!formData.question || !formData.answer) {
      setActionMsg({ type: 'error', text: MESSAGES.faq.requiredFields });
      setTimeout(() => setActionMsg(null), 3000);
      return;
    }

    try {
      if (editingFaq) {
        await api.put(`/app/faqs/${editingFaq.id}`, formData);
      } else {
        await api.post('/app/faqs', formData);
      }
      setShowModal(false);
      await loadFaqs();
    } catch (error) {
      console.error('[FAQ] 저장 실패:', error);
      setActionMsg({ type: 'error', text: MESSAGES.faq.saveError });
      setTimeout(() => setActionMsg(null), 3000);
    }
  };

  const handleDeleteFaq = (id: string) => {
    setFaqToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (faqToDelete) {
      try {
        await api.delete(`/app/faqs/${faqToDelete}`);
        setFaqToDelete(null);
        setShowDeleteConfirm(false);
        await loadFaqs();
      } catch (error) {
        console.error('[FAQ] 삭제 실패:', error);
        setActionMsg({ type: 'error', text: MESSAGES.faq.deleteError });
        setTimeout(() => setActionMsg(null), 3000);
      }
    }
  };

  if (isLoading) {
    return <LoadingSpinner message="FAQ 목록을 불러오는 중..." />;
  }

  const activeFaqs = faqs.filter(f => f.isActive);

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
        <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">FAQ 관리</h1>
        <p className="text-base text-slate-500 dark:text-slate-400 mt-2">자주 묻는 질문을 카테고리별로 관리합니다</p>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <HelpCircle className="w-5 h-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{faqs.length}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">전체 FAQ</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
              <Tag className="w-5 h-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{categories.length}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">카테고리</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center">
              <HelpCircle className="w-5 h-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{activeFaqs.length}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">활성 FAQ</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
              <HelpCircle className="w-5 h-5 text-purple-600 dark:text-purple-400" aria-hidden="true" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{faqs.length - activeFaqs.length}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">비활성 FAQ</p>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ 목록 */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">FAQ 목록</h2>
            <div className="flex flex-wrap gap-2">
              <label htmlFor={filterCategoryId} className="sr-only">FAQ 카테고리 필터</label>
              <select
                id={filterCategoryId}
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                aria-label="FAQ 카테고리 필터"
                className="h-10 px-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm dark:text-slate-200"
              >
                <option value="all">전체 카테고리</option>
                {categories.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
              <div className="relative">
                <label htmlFor={searchInputId} className="sr-only">FAQ 검색</label>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                <Input
                  id={searchInputId}
                  placeholder="질문 또는 답변 검색어를 입력하세요"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  aria-label="FAQ 검색"
                  className="pl-9 h-10 w-full sm:w-48 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                />
              </div>
              <Button type="button" onClick={handleOpenAddModal} className="h-12 px-5 text-base font-bold bg-primary hover:bg-primary-dark gap-2">
                <Plus className="w-4 h-4" aria-hidden="true" />
                FAQ 등록
              </Button>
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {filteredFaqs.map((faq) => {
            const isExpanded = expandedIds.includes(faq.id);
            const categoryInfo = getCategoryInfo(faq.category);

            return (
              <div key={faq.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors motion-reduce:transition-none">
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => toggleExpand(faq.id)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleExpand(faq.id);
                    }
                  }}
                >
                  <div className="flex items-start gap-4">
                    <button type="button" className="p-1 cursor-grab text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex-shrink-0" aria-label="FAQ 순서 변경">
                      <GripVertical className="w-5 h-5" aria-hidden="true" />
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${categoryInfo.color}`}>
                          {categoryInfo.label}
                        </span>
                        {!faq.isActive && (
                          <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded text-xs font-medium flex items-center gap-1">
                            <EyeOff className="w-3 h-3" aria-hidden="true" />
                            비활성
                          </span>
                        )}
                      </div>
                      <h3 className="font-medium text-slate-900 dark:text-white">Q. {faq.question}</h3>

                      {isExpanded && (
                        <div className="mt-3 p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
                          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                            <span className="font-semibold text-primary">A.</span> {faq.answer}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        aria-label="FAQ 수정하기"
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors motion-reduce:transition-none"
                        onClick={(e) => { e.stopPropagation(); handleOpenEditModal(faq); }}
                      >
                        <Edit2 className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        aria-label="FAQ 삭제하기"
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors motion-reduce:transition-none"
                        onClick={(e) => { e.stopPropagation(); handleDeleteFaq(faq.id); }}
                      >
                        <Trash2 className="w-4 h-4 text-red-500 dark:text-red-400" aria-hidden="true" />
                      </button>
                      <div className="p-2">
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5 text-slate-400" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-slate-400" aria-hidden="true" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredFaqs.length === 0 && (
          <div className="p-12 text-center">
            <HelpCircle className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" aria-hidden="true" />
            <p className="text-slate-500 dark:text-slate-400">등록된 FAQ가 없습니다</p>
          </div>
        )}
      </div>

      {/* FAQ 등록/수정 모달 */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} size="lg">
        <ModalHeader
          title={editingFaq ? 'FAQ 수정' : '새 FAQ 등록'}
          icon={HelpCircle}
        />
        <ModalBody>
          <div className="space-y-5">
            <div className="space-y-2">
              <label htmlFor={formCategoryId} className="block text-sm font-medium text-slate-700 dark:text-slate-300">카테고리</label>
              <select
                id={formCategoryId}
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                aria-label="FAQ 카테고리 선택"
                className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm dark:text-slate-200"
              >
                {categories.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label htmlFor={formQuestionId} className="block text-sm font-medium text-slate-700 dark:text-slate-300">질문 *</label>
              <Input
                id={formQuestionId}
                value={formData.question}
                onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                placeholder="자주 묻는 질문을 입력해주세요"
                aria-label="FAQ 질문"
                aria-required="true"
                className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor={formAnswerId} className="block text-sm font-medium text-slate-700 dark:text-slate-300">답변 *</label>
              <textarea
                id={formAnswerId}
                value={formData.answer}
                onChange={(e) => setFormData({ ...formData, answer: e.target.value })}
                placeholder="답변 내용을 입력해주세요"
                aria-label="FAQ 답변"
                aria-required="true"
                rows={5}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
            <label htmlFor={formActiveId} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700 rounded-lg cursor-pointer">
              <input
                id={formActiveId}
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                aria-label="FAQ 활성화 여부"
                className="w-4 h-4 text-primary rounded border-slate-300 dark:border-slate-500 focus:ring-primary"
              />
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">활성화</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">사용자에게 노출됩니다</p>
              </div>
            </label>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowModal(false)}
            className="flex-1 h-12 px-5 text-base font-bold border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={handleSaveFaq}
            className="flex-1 h-12 px-5 text-base font-bold bg-primary hover:bg-primary-dark text-white"
          >
            {editingFaq ? '수정하기' : '등록하기'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* 삭제 확인 모달 */}
      <Modal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} size="sm">
        <ModalHeader title="FAQ 삭제" icon={AlertCircle} />
        <ModalBody>
          <div className="text-center py-4">
            <div className="w-14 h-14 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-7 h-7 text-red-600 dark:text-red-400" aria-hidden="true" />
            </div>
            <p className="text-slate-700 dark:text-slate-300">이 FAQ를 삭제하시겠습니까?</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">삭제된 FAQ는 복구할 수 없습니다.</p>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setShowDeleteConfirm(false)}
            className="flex-1 h-12 px-5 text-base font-bold border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={confirmDelete}
            className="flex-1 h-12 px-5 text-base font-bold bg-red-600 hover:bg-red-700 text-white"
          >
            삭제하기
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
