'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Modal, ModalHeader, ModalBody, ModalFooter, ConfirmModal } from '@/components/ui/modal';
import { api } from '@/services/api-client';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Database,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Tag,
  ToggleLeft,
  ToggleRight,
  ArrowLeft,
} from 'lucide-react';

// ============================================
// 타입 정의
// ============================================

interface CodeGroup {
  id: string;
  groupCode: string;
  groupName: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  _count?: { codes: number };
}

interface CommonCode {
  id: string;
  groupId: string;
  parentId: string | null;
  level: number;
  code: string;
  name: string;
  description: string | null;
  value1: string | null;
  value2: string | null;
  value3: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  children?: CommonCode[];
}

// ============================================
// 메인 컴포넌트
// ============================================

export default function CommonCodesPage() {
  // 뷰 상태: 'groups' = 그룹 목록, 'codes' = 특정 그룹의 코드 목록
  const [view, setView] = useState<'groups' | 'codes'>('groups');
  const [selectedGroup, setSelectedGroup] = useState<CodeGroup | null>(null);

  // 그룹 상태
  const [groups, setGroups] = useState<CodeGroup[]>([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [isGroupLoading, setIsGroupLoading] = useState(true);

  // 코드 상태
  const [codes, setCodes] = useState<CommonCode[]>([]);
  const [codeSearch, setCodeSearch] = useState('');
  const [isCodeLoading, setIsCodeLoading] = useState(false);
  const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());

  // 모달 상태
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CodeGroup | null>(null);
  const [editingCode, setEditingCode] = useState<CommonCode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'group' | 'code'; id: string; name: string } | null>(null);
  const [parentCodeForNew, setParentCodeForNew] = useState<CommonCode | null>(null);

  // 폼 상태 — 그룹
  const [groupForm, setGroupForm] = useState({
    groupCode: '',
    groupName: '',
    description: '',
    isActive: true,
    sortOrder: 0,
  });

  // 폼 상태 — 코드
  const [codeForm, setCodeForm] = useState({
    code: '',
    name: '',
    description: '',
    value1: '',
    value2: '',
    value3: '',
    isActive: true,
    sortOrder: 0,
  });

  const [isSaving, setIsSaving] = useState(false);

  // ============================================
  // 그룹 API
  // ============================================

  const loadGroups = useCallback(async () => {
    setIsGroupLoading(true);
    try {
      const res = await api.get<CodeGroup[]>('/common-code-groups');
      setGroups(Array.isArray(res) ? res : []);
    } catch (error) {
      console.error('[공통코드] 그룹 로드 실패:', error);
      setGroups([]);
    } finally {
      setIsGroupLoading(false);
    }
  }, []);

  const saveGroup = async () => {
    if (!groupForm.groupCode.trim() || !groupForm.groupName.trim()) return;
    setIsSaving(true);
    try {
      if (editingGroup) {
        await api.put(`/common-code-groups/${editingGroup.id}`, groupForm);
      } else {
        await api.post('/common-code-groups', groupForm);
      }
      setIsGroupModalOpen(false);
      loadGroups();
    } catch (error) {
      console.error('[공통코드] 그룹 저장 실패:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  // ============================================
  // 코드 API
  // ============================================

  const loadCodes = useCallback(async (groupId: string) => {
    setIsCodeLoading(true);
    try {
      const res = await api.get<CommonCode[]>(`/common-codes?groupId=${groupId}`);
      setCodes(Array.isArray(res) ? res : []);
    } catch (error) {
      console.error('[공통코드] 코드 로드 실패:', error);
      setCodes([]);
    } finally {
      setIsCodeLoading(false);
    }
  }, []);

  const saveCode = async () => {
    if (!codeForm.code.trim() || !codeForm.name.trim() || !selectedGroup) return;
    setIsSaving(true);
    try {
      const payload = {
        ...codeForm,
        groupId: selectedGroup.id,
        parentId: parentCodeForNew?.id ?? editingCode?.parentId ?? null,
        level: parentCodeForNew ? parentCodeForNew.level + 1 : editingCode ? editingCode.level : 1,
      };
      if (editingCode) {
        await api.put(`/common-codes/${editingCode.id}`, payload);
      } else {
        await api.post('/common-codes', payload);
      }
      setIsCodeModalOpen(false);
      loadCodes(selectedGroup.id);
    } catch (error) {
      console.error('[공통코드] 코드 저장 실패:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  // ============================================
  // 삭제
  // ============================================

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'group') {
        await api.delete(`/common-code-groups/${deleteTarget.id}`);
        loadGroups();
      } else {
        await api.delete(`/common-codes/${deleteTarget.id}`);
        if (selectedGroup) loadCodes(selectedGroup.id);
      }
    } catch (error) {
      console.error('[공통코드] 삭제 실패:', error);
      alert('삭제에 실패했습니다.');
    }
    setIsDeleteModalOpen(false);
    setDeleteTarget(null);
  };

  // ============================================
  // 핸들러
  // ============================================

  const openGroupModal = (group?: CodeGroup) => {
    if (group) {
      setEditingGroup(group);
      setGroupForm({
        groupCode: group.groupCode,
        groupName: group.groupName,
        description: group.description ?? '',
        isActive: group.isActive,
        sortOrder: group.sortOrder,
      });
    } else {
      setEditingGroup(null);
      setGroupForm({ groupCode: '', groupName: '', description: '', isActive: true, sortOrder: 0 });
    }
    setIsGroupModalOpen(true);
  };

  const openCodeModal = (code?: CommonCode, parent?: CommonCode) => {
    if (code) {
      setEditingCode(code);
      setParentCodeForNew(null);
      setCodeForm({
        code: code.code,
        name: code.name,
        description: code.description ?? '',
        value1: code.value1 ?? '',
        value2: code.value2 ?? '',
        value3: code.value3 ?? '',
        isActive: code.isActive,
        sortOrder: code.sortOrder,
      });
    } else {
      setEditingCode(null);
      setParentCodeForNew(parent ?? null);
      setCodeForm({ code: '', name: '', description: '', value1: '', value2: '', value3: '', isActive: true, sortOrder: 0 });
    }
    setIsCodeModalOpen(true);
  };

  const selectGroup = (group: CodeGroup) => {
    setSelectedGroup(group);
    setView('codes');
    setExpandedCodes(new Set());
    loadCodes(group.id);
  };

  const toggleExpand = (codeId: string) => {
    setExpandedCodes(prev => {
      const next = new Set(prev);
      if (next.has(codeId)) next.delete(codeId);
      else next.add(codeId);
      return next;
    });
  };

  // ============================================
  // 초기 로드
  // ============================================

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  // ============================================
  // 코드 트리 빌드
  // ============================================

  const buildTree = (items: CommonCode[]): CommonCode[] => {
    const map = new Map<string, CommonCode>();
    const roots: CommonCode[] = [];

    items.forEach(item => map.set(item.id, { ...item, children: [] }));
    items.forEach(item => {
      const node = map.get(item.id)!;
      if (item.parentId && map.has(item.parentId)) {
        map.get(item.parentId)!.children!.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots.sort((a, b) => a.sortOrder - b.sortOrder);
  };

  const filteredGroups = groups.filter(g =>
    !groupSearch || g.groupCode.toLowerCase().includes(groupSearch.toLowerCase()) || g.groupName.includes(groupSearch)
  );

  const filteredCodes = codeSearch
    ? codes.filter(c => c.code.toLowerCase().includes(codeSearch.toLowerCase()) || c.name.includes(codeSearch))
    : codes;

  const codeTree = buildTree(filteredCodes);

  const levelLabels: Record<number, string> = { 1: '대분류', 2: '중분류', 3: '소분류', 4: '세부' };
  const levelColors: Record<number, string> = {
    1: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    2: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    3: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    4: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  };

  // ============================================
  // 코드 트리 렌더
  // ============================================

  const renderCodeRow = (code: CommonCode, depth: number = 0) => {
    const hasChildren = code.children && code.children.length > 0;
    const isExpanded = expandedCodes.has(code.id);

    return (
      <div key={code.id}>
        <div
          className={`flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
            depth > 0 ? 'bg-slate-50/50 dark:bg-slate-800/20' : ''
          }`}
          style={{ paddingLeft: `${16 + depth * 24}px` }}
        >
          {/* 확장/축소 */}
          <button
            type="button"
            onClick={() => hasChildren && toggleExpand(code.id)}
            className={`min-h-[32px] min-w-[32px] h-8 w-8 flex items-center justify-center rounded-lg motion-reduce:transition-none transition-colors ${hasChildren ? 'hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer' : 'cursor-default'}`}
            aria-expanded={hasChildren ? isExpanded : undefined}
            aria-label={hasChildren ? (isExpanded ? '접기' : '펼치기') : undefined}
            disabled={!hasChildren}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" aria-hidden="true" /> : <ChevronRight className="w-4 h-4 text-slate-500" aria-hidden="true" />
            ) : (
              <span className="w-4" aria-hidden="true" />
            )}
          </button>

          {/* 레벨 뱃지 */}
          <Badge className={`text-xs px-2 py-0.5 ${levelColors[code.level] ?? levelColors[4]}`}>
            {levelLabels[code.level] ?? `L${code.level}`}
          </Badge>

          {/* 코드/이름 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-medium text-slate-900 dark:text-white">{code.code}</span>
              <span className="text-sm text-slate-600 dark:text-slate-400">{code.name}</span>
            </div>
            {(code.value1 || code.value2 || code.value3) && (
              <div className="flex gap-3 mt-0.5">
                {code.value1 && <span className="text-xs text-slate-400">V1: {code.value1}</span>}
                {code.value2 && <span className="text-xs text-slate-400">V2: {code.value2}</span>}
                {code.value3 && <span className="text-xs text-slate-400">V3: {code.value3}</span>}
              </div>
            )}
          </div>

          {/* 활성 상태 */}
          {code.isActive ? (
            <ToggleRight className="w-5 h-5 text-green-500" />
          ) : (
            <ToggleLeft className="w-5 h-5 text-slate-300" />
          )}

          {/* 순서 */}
          <span className="text-xs text-slate-400 w-8 text-right">{code.sortOrder}</span>

          {/* 액션 */}
          <div className="flex items-center gap-0.5">
            {code.level < 4 && (
              <button
                type="button"
                onClick={() => openCodeModal(undefined, code)}
                className="min-h-[44px] min-w-[44px] h-10 w-10 inline-flex items-center justify-center rounded-lg text-primary hover:text-primary-dark hover:bg-blue-50 dark:hover:bg-blue-900/20 motion-reduce:transition-none transition-colors"
                aria-label="하위 코드 추가"
                title="하위 코드 추가"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => openCodeModal(code)}
              className="min-h-[44px] min-w-[44px] h-10 w-10 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:text-slate-200 motion-reduce:transition-none transition-colors"
              aria-label={`${code.name} 수정`}
              title="수정"
            >
              <Edit2 className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => { setDeleteTarget({ type: 'code', id: code.id, name: `${code.code} (${code.name})` }); setIsDeleteModalOpen(true); }}
              className="min-h-[44px] min-w-[44px] h-10 w-10 inline-flex items-center justify-center rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 motion-reduce:transition-none transition-colors"
              aria-label={`${code.name} 삭제`}
              title="삭제"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* 하위 코드 */}
        {hasChildren && isExpanded && (
          code.children!.sort((a, b) => a.sortOrder - b.sortOrder).map(child => renderCodeRow(child, depth + 1))
        )}
      </div>
    );
  };

  // ============================================
  // 렌더링
  // ============================================

  return (
    <div className="space-y-6">
      <PageHeader
        title="공통코드 관리"
        description="시스템 공통코드를 그룹별로 관리합니다. 대/중/소/세부 4단계 계층 구조를 지원합니다."
      />

      {/* ========== 그룹 목록 뷰 ========== */}
      {view === 'groups' && (
        <Card className="overflow-hidden border border-slate-200 dark:border-slate-700">
          {/* 헤더 */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
                <Database className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">코드 그룹</h2>
              <Badge variant="secondary" className="text-xs tabular-nums">{filteredGroups.length}건</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:flex-initial">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                <Input
                  placeholder="그룹 코드/이름 검색"
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                  className="pl-9 h-10 w-full sm:w-60"
                  aria-label="그룹 검색"
                />
              </div>
              <Button
                type="button"
                onClick={() => openGroupModal()}
                className="h-10 px-4 text-sm font-semibold bg-primary hover:bg-primary-dark text-white motion-reduce:transition-none shrink-0"
              >
                <Plus className="w-4 h-4 mr-1" aria-hidden="true" /> 그룹 추가
              </Button>
            </div>
          </div>

          {/* 테이블 */}
          {isGroupLoading ? (
            <div className="flex justify-center py-16"><LoadingSpinner /></div>
          ) : filteredGroups.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Database className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>등록된 코드 그룹이 없습니다.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {/* 테이블 헤더 */}
              <div className="grid grid-cols-[1fr_1.5fr_2fr_80px_80px_80px_100px] gap-3 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-500 uppercase tracking-wider">
                <span>그룹 코드</span>
                <span>그룹명</span>
                <span>설명</span>
                <span className="text-center">코드 수</span>
                <span className="text-center">상태</span>
                <span className="text-center">순서</span>
                <span className="text-center">관리</span>
              </div>
              {filteredGroups
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((group) => (
                <div
                  key={group.id}
                  role="button"
                  tabIndex={0}
                  className="grid grid-cols-[1fr_1.5fr_2fr_80px_80px_80px_100px] gap-3 px-4 py-3 items-center hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer motion-reduce:transition-none transition-colors"
                  onClick={() => selectGroup(group)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectGroup(group); } }}
                >
                  <span className="font-mono text-sm font-semibold text-primary dark:text-blue-400 truncate">{group.groupCode}</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{group.groupName}</span>
                  <span className="text-sm text-slate-500 dark:text-slate-400 truncate">{group.description || '-'}</span>
                  <span className="text-center">
                    <Badge variant="secondary" className="text-xs tabular-nums">{group._count?.codes ?? 0}</Badge>
                  </span>
                  <span className="text-center">
                    {group.isActive ? (
                      <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 text-xs">활성</Badge>
                    ) : (
                      <Badge className="bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400 text-xs">비활성</Badge>
                    )}
                  </span>
                  <span className="text-center text-sm text-slate-400 tabular-nums">{group.sortOrder}</span>
                  <div className="flex items-center justify-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => openGroupModal(group)}
                      className="min-h-[44px] min-w-[44px] h-10 w-10 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:text-slate-200 motion-reduce:transition-none transition-colors"
                      aria-label={`${group.groupName} 수정`}
                    >
                      <Edit2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setDeleteTarget({ type: 'group', id: group.id, name: group.groupName }); setIsDeleteModalOpen(true); }}
                      className="min-h-[44px] min-w-[44px] h-10 w-10 inline-flex items-center justify-center rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 motion-reduce:transition-none transition-colors"
                      aria-label={`${group.groupName} 삭제`}
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ========== 코드 목록 뷰 ========== */}
      {view === 'codes' && selectedGroup && (
        <Card className="overflow-hidden border border-slate-200 dark:border-slate-700">
          {/* 헤더 */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => { setView('groups'); setSelectedGroup(null); }}
                className="min-h-[44px] min-w-[44px] h-10 w-10 inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 dark:hover:text-slate-200 motion-reduce:transition-none transition-colors shrink-0"
                aria-label="그룹 목록으로 돌아가기"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" />
              </button>
              <div className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <FolderOpen className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-baseline gap-2 flex-wrap">
                  <span className="truncate">{selectedGroup.groupName}</span>
                  <span className="font-mono text-xs font-medium text-slate-400">({selectedGroup.groupCode})</span>
                </h2>
                {selectedGroup.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{selectedGroup.description}</p>
                )}
              </div>
              <Badge variant="secondary" className="text-xs tabular-nums shrink-0">{filteredCodes.length}건</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 lg:flex-initial">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
                <Input
                  placeholder="코드/이름 검색"
                  value={codeSearch}
                  onChange={(e) => setCodeSearch(e.target.value)}
                  className="pl-9 h-10 w-full lg:w-52"
                  aria-label="코드 검색"
                />
              </div>
              <Button
                type="button"
                onClick={() => openCodeModal()}
                className="h-10 px-4 text-sm font-semibold bg-primary hover:bg-primary-dark text-white motion-reduce:transition-none shrink-0"
              >
                <Plus className="w-4 h-4 mr-1" aria-hidden="true" /> 대분류 추가
              </Button>
            </div>
          </div>

          {/* 코드 트리 */}
          {isCodeLoading ? (
            <div className="flex justify-center py-16"><LoadingSpinner /></div>
          ) : codeTree.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <Tag className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>등록된 코드가 없습니다.</p>
              <Button onClick={() => openCodeModal()} variant="outline" className="mt-3">
                <Plus className="w-4 h-4 mr-1" /> 첫 번째 코드 추가
              </Button>
            </div>
          ) : (
            <div>
              {/* 컬럼 헤더 */}
              <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-500 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700">
                <span className="w-5" />
                <span className="w-16">레벨</span>
                <span className="flex-1">코드 / 이름</span>
                <span className="w-5">활성</span>
                <span className="w-8 text-right">순서</span>
                <span className="w-24 text-center">관리</span>
              </div>
              {codeTree.map(code => renderCodeRow(code))}
            </div>
          )}
        </Card>
      )}

      {/* ========== 그룹 모달 ========== */}
      <Modal isOpen={isGroupModalOpen} onClose={() => setIsGroupModalOpen(false)}>
        <ModalHeader title={editingGroup ? '코드 그룹 수정' : '코드 그룹 추가'} />
        <ModalBody>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                그룹 코드 <span className="text-red-500">*</span>
              </label>
              <Input
                value={groupForm.groupCode}
                onChange={(e) => setGroupForm(prev => ({ ...prev, groupCode: e.target.value.toUpperCase() }))}
                placeholder="예: TRAINING_TYPE"
                disabled={!!editingGroup}
                className="font-mono"
              />
              <p className="text-xs text-slate-400 mt-1">영문 대문자, 언더스코어(_) 사용. 생성 후 변경 불가</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                그룹명 <span className="text-red-500">*</span>
              </label>
              <Input
                value={groupForm.groupName}
                onChange={(e) => setGroupForm(prev => ({ ...prev, groupName: e.target.value }))}
                placeholder="예: 훈련유형"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">설명</label>
              <Input
                value={groupForm.description}
                onChange={(e) => setGroupForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="그룹에 대한 설명"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">정렬 순서</label>
                <Input
                  type="number"
                  value={groupForm.sortOrder}
                  onChange={(e) => setGroupForm(prev => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={groupForm.isActive}
                    onChange={(e) => setGroupForm(prev => ({ ...prev, isActive: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">활성화</span>
                </label>
              </div>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setIsGroupModalOpen(false)}>취소</Button>
          <Button onClick={saveGroup} disabled={isSaving || !groupForm.groupCode.trim() || !groupForm.groupName.trim()} className="bg-primary hover:bg-primary-dark text-white">
            {isSaving ? '저장 중...' : editingGroup ? '수정하기' : '등록하기'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ========== 코드 모달 ========== */}
      <Modal isOpen={isCodeModalOpen} onClose={() => setIsCodeModalOpen(false)}>
        <ModalHeader
          title={editingCode ? '코드 수정' : parentCodeForNew ? `하위 코드 추가 (상위: ${parentCodeForNew.name})` : '대분류 코드 추가'}
        />
        <ModalBody>
          <div className="space-y-4">
            {parentCodeForNew && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm">
                <span className="text-blue-700 dark:text-blue-300">
                  상위 코드: <strong>{parentCodeForNew.code}</strong> ({parentCodeForNew.name})
                  → <Badge className={`text-xs ml-1 ${levelColors[(parentCodeForNew.level + 1)] ?? levelColors[4]}`}>
                    {levelLabels[(parentCodeForNew.level + 1)] ?? `L${parentCodeForNew.level + 1}`}
                  </Badge> 추가
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  코드 <span className="text-red-500">*</span>
                </label>
                <Input
                  value={codeForm.code}
                  onChange={(e) => setCodeForm(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                  placeholder="예: LESSON"
                  className="font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  코드명 <span className="text-red-500">*</span>
                </label>
                <Input
                  value={codeForm.name}
                  onChange={(e) => setCodeForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="예: 레슨"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">설명</label>
              <Input
                value={codeForm.description}
                onChange={(e) => setCodeForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="코드 설명"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">부가값1</label>
                <Input
                  value={codeForm.value1}
                  onChange={(e) => setCodeForm(prev => ({ ...prev, value1: e.target.value }))}
                  placeholder="색상, 아이콘 등"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">부가값2</label>
                <Input
                  value={codeForm.value2}
                  onChange={(e) => setCodeForm(prev => ({ ...prev, value2: e.target.value }))}
                  placeholder="단가, 단위 등"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">부가값3</label>
                <Input
                  value={codeForm.value3}
                  onChange={(e) => setCodeForm(prev => ({ ...prev, value3: e.target.value }))}
                  placeholder="기타"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">정렬 순서</label>
                <Input
                  type="number"
                  value={codeForm.sortOrder}
                  onChange={(e) => setCodeForm(prev => ({ ...prev, sortOrder: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={codeForm.isActive}
                    onChange={(e) => setCodeForm(prev => ({ ...prev, isActive: e.target.checked }))}
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700 dark:text-slate-300">활성화</span>
                </label>
              </div>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" onClick={() => setIsCodeModalOpen(false)}>취소</Button>
          <Button onClick={saveCode} disabled={isSaving || !codeForm.code.trim() || !codeForm.name.trim()} className="bg-primary hover:bg-primary-dark text-white">
            {isSaving ? '저장 중...' : editingCode ? '수정하기' : '등록하기'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ========== 삭제 확인 모달 ========== */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setDeleteTarget(null); }}
        onConfirm={handleDelete}
        title="삭제 확인"
        description={`"${deleteTarget?.name}"을(를) 삭제하시겠습니까?${deleteTarget?.type === 'group' ? ' 그룹 내 모든 코드가 함께 삭제됩니다.' : ''}`}
        confirmText="삭제하기"
        variant="danger"
      />
    </div>
  );
}
