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
 *
 * === 시행일 기반 버전 관리 ===
 * 게시 여부는 활성/비활성 토글이 아니라 **시행일(publishedAt)** 이 결정한다.
 *   시행 예정 : 시행일이 아직 오지 않음 (미리 등록해 둔 버전)
 *   현행      : 시행일이 지난 것 중 가장 최신
 *   과거      : 그 뒤에 더 최신 버전이 시행되어 밀려남
 *   취소      : isActive=false 인 레거시 행. 신규로는 생기지 않는다 —
 *               시행 예정 건은 게시된 적이 없어 완전 삭제하고, 게시된 적 있는 버전은 보존하기 때문.
 * 이미 시행된 버전은 수정할 수 없다 — 내용 변경은 새 버전 등록으로 처리한다.
 * 상세: claudedocs/terms-versioning-redesign-2026-08-10.md
 */

import { useState, useEffect, useCallback, useId, useMemo } from 'react';
import { MESSAGES } from '@/lib/messages';
import { api } from '@/services/api-client';
import { isoToDateInput, isoToKstDateLabel, isoToKstDateTimeLabel, kstInputToUtcIso } from '@/lib/kst-date';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/ui/modal';
import { ActionToast, ConfirmModal, type ActionToastValue } from '@/components/common';
import { FileText, Plus, Edit2, Eye, Copy, Trash2, Clock, ChevronDown } from 'lucide-react';

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

/** 시행일 기준으로 파생되는 버전 상태 */
type TermStatus = 'upcoming' | 'current' | 'past' | 'revoked';

interface DecoratedTerm extends TermItem {
  status: TermStatus;
  /**
   * 삭제 가능 여부 — 시행 시각 미도래(= 게시된 적 없음)일 때만 true.
   * 백엔드 deleteTerms 가드와 동일 규칙이라 눌렀는데 409 나는 상황이 없다.
   */
  canDelete: boolean;
}

/**
 * 약관 type 정규화 (2026-07-30)
 *
 * 어드민이 저장하던 축약형(`service`/`privacy`/`child`)과 앱·웹 조회측이 사용하는
 * 표준형(`terms_of_service`/`privacy_policy`/`child_privacy`)이 달라, 어드민에서
 * 등록한 본문이 사용자 화면의 표준 type 슬롯에 매칭되지 않는 문제가 있었다.
 * → 신규 등록은 아래 표준형으로만 저장하고, 이미 저장된 레거시 축약형 레코드는
 *   `normalizeTermType()` 로 표준형에 매핑해 동일하게 표시한다.
 *
 * 위치정보(`location`)는 서비스가 위치정보를 수집하지 않으므로 선택지에서 제외했다.
 */
const LEGACY_TYPE_ALIASES: Record<string, string> = {
  service: 'terms_of_service',
  privacy: 'privacy_policy',
  child: 'child_privacy',
};
const normalizeTermType = (type: string) => LEGACY_TYPE_ALIASES[type] ?? type;

const termTypeOptions = [
  { value: 'terms_of_service', label: '서비스 이용약관', color: 'text-primary' },
  { value: 'privacy_policy', label: '개인정보 처리방침', color: 'text-emerald-600 dark:text-emerald-400' },
  { value: 'marketing', label: '마케팅 정보 수신 동의', color: 'text-purple-600 dark:text-purple-400' },
  { value: 'child_privacy', label: '자녀(만 14세 미만) 개인정보 처리방침', color: 'text-red-600 dark:text-red-400' },
  { value: 'refund', label: '환불 규정', color: 'text-sky-600 dark:text-sky-400' },
  { value: 'community_guideline', label: '커뮤니티 운영 규칙', color: 'text-teal-600 dark:text-teal-400' },
];

/** 배지 라벨은 모두 2글자로 맞춘다 — 고정 폭 없이도 배지 폭이 균일해진다. */
const STATUS_META: Record<TermStatus, { label: string; className: string }> = {
  upcoming: {
    label: '예정',
    className: 'bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400',
  },
  current: {
    label: '현행',
    className: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  },
  past: {
    label: '과거',
    className: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
  },
  revoked: {
    label: '취소',
    className: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  },
};

/** 펼침 시 기본 노출 건수 (예정 + 현행 + 과거 3건). 초과분은 "더 보기"로 노출한다. */
const VISIBLE_VERSION_LIMIT = 5;

const getTypeIcon = (type: string) => {
  switch (normalizeTermType(type)) {
    case 'terms_of_service':
      return <FileText className="w-5 h-5 text-primary" />;
    case 'privacy_policy':
      return <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />;
    case 'marketing':
      return <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />;
    case 'child_privacy':
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
  switch (normalizeTermType(type)) {
    case 'terms_of_service': return 'bg-primary/10';
    case 'privacy_policy': return 'bg-emerald-100 dark:bg-emerald-900/30';
    case 'marketing': return 'bg-purple-100 dark:bg-purple-900/30';
    case 'child_privacy': return 'bg-red-100 dark:bg-red-900/30';
    case 'refund': return 'bg-sky-100 dark:bg-sky-900/30';
    case 'community_guideline': return 'bg-teal-100 dark:bg-teal-900/30';
    default: return 'bg-slate-100 dark:bg-slate-700';
  }
};

const typeLabel = (type: string) =>
  termTypeOptions.find((o) => o.value === normalizeTermType(type))?.label ?? type;

/** 서버 에러 메시지를 우선 노출하고, 없으면 기본 문구로 대체한다. */
const serverMessage = (error: unknown, fallback: string): string => {
  const message = (error as { response?: { data?: { message?: unknown } } })
    ?.response?.data?.message;
  if (typeof message === 'string' && message.trim()) return message;
  if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
  return fallback;
};

/**
 * 시행일 기준으로 type 별 버전 상태를 계산한다.
 * 반환 순서는 termTypeOptions 순서를 따르며, 각 type 안에서는
 * 예정(임박 순) → 현행 → 과거(최신 순) → 취소(최신 순) 로 정렬한다.
 */
function groupByType(items: TermItem[]): Array<{ type: string; rows: DecoratedTerm[] }> {
  const now = Date.now();
  const buckets = new Map<string, TermItem[]>();

  items.forEach((item) => {
    const key = normalizeTermType(item.type);
    const list = buckets.get(key);
    if (list) list.push(item);
    else buckets.set(key, [item]);
  });

  const publishedMs = (item: TermItem) =>
    item.publishedAt ? new Date(item.publishedAt).getTime() : Number.NaN;

  const sections = [...buckets.entries()].map(([type, list]) => {
    // 시행일 내림차순 → 동률이면 최근 등록분 우선 (백엔드 현행 판정과 동일 규칙)
    const sorted = [...list].sort((a, b) => {
      const diff = (publishedMs(b) || 0) - (publishedMs(a) || 0);
      if (diff !== 0) return diff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const current = sorted.find(
      (item) => item.isActive && !Number.isNaN(publishedMs(item)) && publishedMs(item) <= now,
    );

    const decorated: DecoratedTerm[] = sorted.map((item) => {
      let status: TermStatus;
      if (!item.isActive) status = 'revoked';
      else if (!Number.isNaN(publishedMs(item)) && publishedMs(item) > now) status = 'upcoming';
      else if (current && item.id === current.id) status = 'current';
      else status = 'past';
      const canDelete = !Number.isNaN(publishedMs(item)) && publishedMs(item) > now;
      return { ...item, status, canDelete };
    });

    const order: Record<TermStatus, number> = { upcoming: 0, current: 1, past: 2, revoked: 3 };
    decorated.sort((a, b) => {
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      // 시행 예정은 임박한 것부터, 나머지는 최신 시행분부터
      return a.status === 'upcoming'
        ? (publishedMs(a) || 0) - (publishedMs(b) || 0)
        : (publishedMs(b) || 0) - (publishedMs(a) || 0);
    });

    return { type, rows: decorated };
  });

  const typeOrder = termTypeOptions.map((o) => o.value);
  sections.sort((a, b) => {
    const ai = typeOrder.indexOf(a.type);
    const bi = typeOrder.indexOf(b.type);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  return sections;
}

export default function TermsManagementPage() {
  const formTypeId = useId();
  const formTitleId = useId();
  const formVersionId = useId();
  const formPublishedAtId = useId();
  const formContentId = useId();

  const [isLoading, setIsLoading] = useState(true);
  const [terms, setTerms] = useState<TermItem[]>([]);
  const [selectedTerm, setSelectedTerm] = useState<TermItem | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TermItem | null>(null);
  // 버전 이력은 한 번에 한 종류만 펼친다 — 전부 펼쳐두면 목록이 계속 길어진다.
  const [expandedType, setExpandedType] = useState<string | null>(null);
  // 펼침 안에서도 기본은 최근 5건만 — 접었다 펴면 다시 5건으로 돌아간다.
  const [showAllVersions, setShowAllVersions] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // 등록·수정은 같은 모달을 모드만 바꿔 쓴다 (필드 구성이 동일하고, 인라인 편집 영역은
  //   목록 아래에 열려 어느 행을 누른 건지 시야에서 사라지는 문제가 있었다).
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [formTargetId, setFormTargetId] = useState<string | null>(null);
  // 시행일이 오늘·과거일 때의 저장 전 확인 (아래 isImmediatePublish 주석 참조).
  const [showImmediateConfirm, setShowImmediateConfirm] = useState(false);
  const [form, setForm] = useState({
    type: 'terms_of_service' as string,
    title: '',
    version: '',
    publishedAt: '',
    content: '',
  });
  const [actionMsg, setActionMsg] = useState<ActionToastValue>(null);

  const notify = useCallback((type: 'success' | 'error', text: string) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), 3000);
  }, []);

  // 어드민은 취소분까지 포함한 전체 이력을 본다 (사용자 화면은 현행만 노출).
  const loadTerms = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<TermItem[]>('/app/terms/history');
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

  const sections = useMemo(() => groupByType(terms), [terms]);

  /** 선택한 유형의 현행 버전 (등록 모달 안내용) */
  const currentOfType = useCallback(
    (type: string) =>
      sections
        .find((s) => s.type === normalizeTermType(type))
        ?.rows.find((r) => r.status === 'current') ?? null,
    [sections],
  );

  /** 시행 예정 버전 수정 — 기존 값을 채워 같은 모달을 edit 모드로 연다. */
  const handleEdit = (term: TermItem) => {
    setForm({
      type: normalizeTermType(term.type),
      title: term.title ?? '',
      version: term.version ?? '',
      publishedAt: isoToDateInput(term.publishedAt),
      content: term.content ?? '',
    });
    setFormTargetId(term.id);
    setFormMode('edit');
  };

  /**
   * 새 버전 등록 모달 열기.
   *   from 이 있으면 제목·본문을 복제해 새 버전 등록을 돕는다(버전·시행일은 비워 둔다).
   *   type 만 있으면 해당 유형이 선택된 빈 폼을 연다.
   */
  const openAddModal = (opts?: { type?: string; from?: TermItem }) => {
    const from = opts?.from;
    setForm({
      type: opts?.type ?? (from ? normalizeTermType(from.type) : 'terms_of_service'),
      title: from?.title ?? '',
      version: '',
      publishedAt: '',
      content: from?.content ?? '',
    });
    setFormTargetId(null);
    setFormMode('create');
  };

  const closeForm = () => {
    setFormMode(null);
    setFormTargetId(null);
    setShowImmediateConfirm(false);
  };

  /**
   * 시행일이 오늘이거나 과거인가.
   *
   * 시행일 00:00(KST)이 이미 지난 시각이면 저장하는 순간 현행 약관이 교체되고,
   * 백엔드가 그 행을 잠근다 — `updateTerms` 는 본문·버전·시행일 수정을 409 로 막고
   * `deleteTerms` 는 시행 예정 건만 허용한다. 화면에는 철회 수단도 없어서
   * 날짜를 잘못 넣으면 되돌릴 방법이 없다. 그래서 저장 전에 한 번 더 확인받는다.
   *
   * 과거 시행일 자체는 막지 않는다 — 기존 약관을 뒤늦게 옮겨 담거나 누락분을
   * 보정할 때 실제로 필요하다(현행 v2.0.0 6종도 소급 등록분이다).
   */
  const kstToday = isoToDateInput(new Date().toISOString());
  const isImmediatePublish = !!form.publishedAt && form.publishedAt <= kstToday;

  const handleSubmitForm = () => {
    if (!form.title.trim() || !form.content.trim()) {
      notify('error', MESSAGES.terms.requiredFields);
      return;
    }
    if (!form.version.trim()) {
      notify('error', MESSAGES.terms.versionRequired);
      return;
    }
    if (!form.publishedAt) {
      notify('error', MESSAGES.terms.publishedAtRequired);
      return;
    }
    if (isImmediatePublish) {
      setShowImmediateConfirm(true);
      return;
    }
    void submitForm();
  };

  const submitForm = async () => {
    const payload = {
      type: form.type,
      title: form.title.trim(),
      content: form.content,
      version: form.version.trim(),
      publishedAt: kstInputToUtcIso(form.publishedAt),
    };

    setIsSaving(true);
    try {
      if (formMode === 'edit' && formTargetId) {
        const updated = await api.put<TermItem>(`/app/terms/${formTargetId}`, payload);
        setTerms((prev) =>
          prev.map((t) => (t.id === formTargetId ? { ...t, ...updated } : t)),
        );
        notify('success', MESSAGES.save.success);
      } else {
        const created = await api.post<TermItem>('/app/terms', {
          ...payload,
          isActive: true,
        });
        setTerms((prev) => [...prev, created]);
        notify('success', MESSAGES.terms.createSuccess);
      }
      closeForm();
    } catch (error) {
      notify(
        'error',
        serverMessage(
          error,
          formMode === 'edit' ? MESSAGES.save.error : MESSAGES.terms.createError,
        ),
      );
    } finally {
      setIsSaving(false);
      // 확인 모달은 저장이 끝난 뒤 닫는다 — 먼저 닫으면 진행 상태가 보이지 않고,
      // 실패했을 때도 확인 모달이 남아 있으면 에러 토스트가 가려진다.
      setShowImmediateConfirm(false);
    }
  };

  /** 시행 예정 버전 삭제 — 게시된 적 없는 건이라 완전 삭제한다(백엔드가 대상을 재검증). */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsSaving(true);
    try {
      await api.delete(`/app/terms/${deleteTarget.id}`);
      setTerms((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      setDeleteTarget(null);
      notify('success', MESSAGES.terms.deleteSuccess);
    } catch (error) {
      notify('error', serverMessage(error, MESSAGES.terms.deleteError));
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreview = (term: TermItem) => {
    setSelectedTerm(term);
    setShowPreviewModal(true);
  };

  if (isLoading) {
    return <LoadingSpinner message="약관 정보를 불러오는 중..." />;
  }

  const formCurrent = currentOfType(form.type);

  /**
   * 시행일이 오늘·과거여도 **현행이 되지 못하는** 경우 — 현행보다 시행일이 앞설 때다.
   * 이때는 저장하는 즉시 '과거' 버전으로만 기록되고 사용자 화면에는 노출되지 않는데,
   * 수정·삭제는 이미 잠긴 뒤라 회수도 안 된다. 과거 이력을 뒤늦게 채워 넣는 정상
   * 작업이기도 해서 막지는 않고, 어느 쪽인지만 정확히 알린다.
   *
   * 비교는 날짜 문자열이 아니라 instant 로 한다 — 기존 행의 시행 시각이 KST 00:00 이
   * 아닐 수 있어(시드·레거시) 같은 날짜라도 앞뒤가 갈린다. 시각이 완전히 같으면
   * createdAt 이 늦은 새 건이 현행을 가져가므로 `<` 일 때만 해당한다.
   */
  const formPublishedMs = new Date(kstInputToUtcIso(form.publishedAt) ?? '').getTime();
  const currentPublishedMs = formCurrent?.publishedAt
    ? new Date(formCurrent.publishedAt).getTime()
    : Number.NaN;
  const staysPast =
    isImmediatePublish &&
    !Number.isNaN(formPublishedMs) &&
    !Number.isNaN(currentPublishedMs) &&
    formPublishedMs < currentPublishedMs;

  /** 경고·확인 문구에서 반복되는 현행 표기 (예: "v2.0.0(2026.07.30 시행)") */
  const currentLabel = formCurrent
    ? `v${formCurrent.version}(${isoToKstDateLabel(formCurrent.publishedAt)} 시행)`
    : '';

  /**
   * 같은 유형에 시행 시각이 **완전히 같은** 기존 버전.
   *
   * 시행일이 동률이면 현행 판정은 등록 시각(createdAt)이 가른다 — 버전 번호는 쓰이지
   * 않아서 v2.1.0 뒤에 v2.0.0 을 같은 날짜로 올리면 v2.0.0 이 현행이 된다. 저장하고
   * 나면 되돌릴 수 없으므로 미리 알린다. 시행일이 미래여도 같은 문제라 즉시 시행
   * 여부와 무관하게 검사한다.
   */
  const sameInstantTerm = Number.isNaN(formPublishedMs)
    ? null
    : (terms.find(
        (t) =>
          t.id !== formTargetId &&
          normalizeTermType(t.type) === normalizeTermType(form.type) &&
          !!t.publishedAt &&
          new Date(t.publishedAt).getTime() === formPublishedMs,
      ) ?? null);

  return (
    <div className="space-y-6">
      {/* 모달이 열린 상태에서 발생하는 등록·수정·삭제 실패도 보이도록 포털 토스트로 표시한다. */}
      <ActionToast value={actionMsg} onClose={() => setActionMsg(null)} />

      {/* 페이지 헤더 */}
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">약관 및 정책 관리</h1>
        <p className="text-base text-slate-500 dark:text-slate-400 mt-2">
          서비스 약관 및 정책 문서를 관리합니다. 게시 여부는 시행일로 결정되며, 시행일이 지나면 자동으로 현행이 교체됩니다.
        </p>
      </div>

      {/* 약관 목록 */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">약관 목록</h2>
            <Button type="button" onClick={() => openAddModal()} className="h-12 px-5 text-base font-bold bg-primary hover:bg-primary-dark gap-2">
              <Plus className="w-4 h-4" aria-hidden="true" />
              새 약관 등록
            </Button>
          </div>
        </div>

        {sections.length === 0 ? (
          <div className="p-10 text-center text-slate-500 dark:text-slate-400">
            등록된 약관이 없습니다.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {sections.map((section) => {
              const current = section.rows.find((r) => r.status === 'current') ?? null;
              const upcoming = section.rows.find((r) => r.status === 'upcoming') ?? null;
              const isExpanded = expandedType === section.type;
              // 버전이 하나뿐이면 펼쳐도 같은 정보라 이력 토글을 막는다.
              const canExpand = section.rows.length > 1;
              // 정렬이 예정 → 현행 → 과거 → 취소 순이라 앞에서 자르면 최근 것부터 남는다.
              const visibleRows = showAllVersions
                ? section.rows
                : section.rows.slice(0, VISIBLE_VERSION_LIMIT);
              const hiddenCount = section.rows.length - visibleRows.length;

              return (
                <section key={section.type}>
                  {/* 접힌 행 — 유형당 1행. 현행/예정 요약만 보여준다. */}
                  <div className="p-6 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className={`w-12 h-12 ${getTypeBgColor(section.type)} rounded-xl flex items-center justify-center flex-shrink-0`}>
                      {getTypeIcon(section.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 dark:text-white">{typeLabel(section.type)}</h3>
                      <div className="mt-1 space-y-0.5">
                        {current ? (
                          <p className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
                            v{current.version} · {isoToKstDateLabel(current.publishedAt)} 시행
                          </p>
                        ) : (
                          <p className="text-sm text-amber-600 dark:text-amber-400">
                            현재 시행 중인 버전이 없습니다
                          </p>
                        )}
                        {upcoming && (
                          <p className="text-sm text-sky-600 dark:text-sky-400 tabular-nums flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
                            {isoToKstDateLabel(upcoming.publishedAt)}부터 v{upcoming.version} 시행 예정
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {current && (
                        <button
                          type="button"
                          onClick={() => handlePreview(current)}
                          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors motion-reduce:transition-none"
                          title="미리보기"
                          aria-label="미리보기"
                        >
                          <Eye className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openAddModal({ type: section.type, from: current ?? undefined })}
                        className="min-h-[44px] px-3 inline-flex items-center justify-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors motion-reduce:transition-none text-sm font-medium text-slate-600 dark:text-slate-300"
                        title="현행 내용을 복제해 새 버전 등록"
                      >
                        <Copy className="w-4 h-4" aria-hidden="true" />
                        새 버전
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setExpandedType(isExpanded ? null : section.type);
                          setShowAllVersions(false);
                        }}
                        disabled={!canExpand}
                        aria-expanded={isExpanded}
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg transition-colors motion-reduce:transition-none hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        title={canExpand ? '버전 이력 보기' : '이전 버전이 없습니다'}
                        aria-label={canExpand ? '버전 이력 보기' : '이전 버전이 없습니다'}
                      >
                        <ChevronDown
                          className={`w-5 h-5 text-slate-500 dark:text-slate-400 transition-transform motion-reduce:transition-none ${isExpanded ? 'rotate-180' : ''}`}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </div>

                  {/* 펼침 — 해당 유형의 전체 버전 이력. 높이를 제한해 페이지가 길어지지 않게 한다. */}
                  {isExpanded && (
                    <div className="px-6 pb-6">
                      <ul className="max-h-80 overflow-y-auto space-y-2 pr-1">
                        {visibleRows.map((term) => {
                          const meta = STATUS_META[term.status];
                          return (
                            <li
                              key={term.id}
                              className="flex flex-col sm:flex-row sm:items-center gap-3 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30"
                            >
                              {/* 라벨이 모두 2글자라 고정 폭을 주지 않아도 배지 폭이 균일하다. */}
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${meta.className}`}>
                                {meta.label}
                              </span>

                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular-nums">
                                  <span className="font-semibold text-slate-900 dark:text-white sm:min-w-[7rem]">
                                    v{term.version}
                                  </span>
                                  <span className="text-slate-500 dark:text-slate-400">
                                    {isoToKstDateLabel(term.publishedAt)} 시행
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 flex-shrink-0">
                                {term.status === 'upcoming' && (
                                  <button
                                    type="button"
                                    onClick={() => handleEdit(term)}
                                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors motion-reduce:transition-none"
                                    title="수정하기"
                                    aria-label="수정하기"
                                  >
                                    <Edit2 className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                                  </button>
                                )}
                                {term.canDelete && (
                                  <button
                                    type="button"
                                    onClick={() => setDeleteTarget(term)}
                                    className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors motion-reduce:transition-none"
                                    title="예약 삭제"
                                    aria-label="예약 삭제"
                                  >
                                    <Trash2 className="w-4 h-4 text-red-500" aria-hidden="true" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handlePreview(term)}
                                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors motion-reduce:transition-none"
                                  title="미리보기"
                                  aria-label="미리보기"
                                >
                                  <Eye className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>

                      {hiddenCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setShowAllVersions(true)}
                          className="mt-2 w-full min-h-[44px] inline-flex items-center justify-center rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors motion-reduce:transition-none"
                        >
                          이전 버전 {hiddenCount}건 더 보기
                        </button>
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* 등록·수정 통합 모달 — 필드 구성이 같아 모드만 바꿔 재사용한다. */}
      {/* size="full"(max-w-4xl) 은 약관 편집에 다소 넓어 max-w-3xl 로 좁힌다. */}
      <Modal isOpen={formMode !== null} onClose={closeForm} size="full" className="max-w-3xl">
        <ModalHeader
          title={formMode === 'edit' ? '시행 예정 버전 수정' : '약관 버전 등록'}
          icon={FileText}
        />
        <ModalBody scrollable maxHeight="70vh">
          <div className="space-y-5">
            {/* 약관 유형 — 수정 시에는 잠근다(유형을 바꾸면 다른 약관 문서가 된다). */}
            <div className="space-y-2">
              <label htmlFor={formTypeId} className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                약관 유형
              </label>
              <select
                id={formTypeId}
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                disabled={formMode === 'edit'}
                aria-label="약관 유형"
                className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm dark:text-white disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {termTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {formMode === 'edit' && (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  유형은 변경할 수 없습니다. 다른 유형이라면 새로 등록해주세요.
                </p>
              )}
            </div>

            {/* 제목 */}
            <div className="space-y-2">
              <label htmlFor={formTitleId} className="block text-sm font-medium text-slate-700 dark:text-slate-300">약관 제목</label>
              <Input
                id={formTitleId}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="약관 제목을 입력해주세요"
                aria-label="약관 제목"
                aria-required="true"
                className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
              />
            </div>

            {/* 버전 · 시행일 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor={formVersionId} className="block text-sm font-medium text-slate-700 dark:text-slate-300">버전 번호</label>
                <Input
                  id={formVersionId}
                  value={form.version}
                  onChange={(e) => setForm({ ...form, version: e.target.value })}
                  placeholder="예: 2.1.0"
                  aria-label="버전 번호"
                  aria-required="true"
                  className="h-11 bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 dark:text-white"
                />
                {/* 입력 영역에서는 `v` 를 쓰지 않는다 — 저장값은 접두사 없는 숫자이고
                    화면 표시에서만 `v` 를 붙이기 때문에, 여기에 `v2.0.0` 을 노출하면
                    입력에도 `v` 가 필요한 것으로 읽힌다. */}
                <p className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                  {formCurrent ? `현재 버전 ${formCurrent.version} · ` : ''}v 없이 숫자만 입력
                </p>
              </div>
              <div className="space-y-2">
                <label htmlFor={formPublishedAtId} className="block text-sm font-medium text-slate-700 dark:text-slate-300">시행일</label>
                <input
                  id={formPublishedAtId}
                  type="date"
                  value={form.publishedAt}
                  onChange={(e) => setForm({ ...form, publishedAt: e.target.value })}
                  aria-label="시행일"
                  aria-required="true"
                  className="w-full h-11 px-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm dark:text-white"
                />
                <p className="text-xs text-slate-400 dark:text-slate-500">해당 날짜 00:00(한국시간)부터 시행됩니다.</p>
              </div>
            </div>

            {/* 내용 */}
            <div className="space-y-2">
              <label htmlFor={formContentId} className="block text-sm font-medium text-slate-700 dark:text-slate-300">약관 내용</label>
              <textarea
                id={formContentId}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="약관 본문 내용을 입력해주세요"
                aria-label="약관 내용"
                aria-required="true"
                rows={16}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-mono dark:text-white resize-y focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            {/* 즉시 시행 경고 — 등록·수정 공통. 수정 모드에서도 시행 예정 건의 시행일을
                지난 날짜로 바꾸면 그대로 잠기므로 안내를 create 로 한정하지 않는다. */}
            {isImmediatePublish && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                {staysPast ? (
                  <>
                    현행 {currentLabel}보다 시행일이 앞섭니다. 저장해도 현행이 되지 않고
                    과거 버전으로만 기록되며, 사용자 화면에는 노출되지 않습니다.
                  </>
                ) : (
                  <>
                    {form.publishedAt === kstToday
                      ? '시행일이 오늘입니다. 00:00(한국시간)이 이미 지나 저장 즉시 현행 약관으로 교체됩니다.'
                      : '지난 날짜입니다. 저장 즉시 현행 약관으로 교체됩니다.'}
                  </>
                )}
                {' '}이미 시행된 약관은 이후 수정·삭제할 수 없습니다.
              </div>
            )}

            {/* 동일 시행 시각 안내 — 버전 번호가 아니라 등록 순서가 현행을 가르므로 미리 알린다. */}
            {sameInstantTerm && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
                같은 시행일에 v{sameInstantTerm.version}이(가) 이미 있습니다
                ({isoToKstDateTimeLabel(sameInstantTerm.createdAt)} 등록).
                시행일이 같으면 버전 번호와 무관하게 <strong className="font-semibold">나중에 등록한 쪽</strong>이 현행이 되므로,
                저장하면 이 버전이 v{sameInstantTerm.version}을(를) 대신합니다.
              </div>
            )}

            {/* 시행 안내 — 등록 시에만 (수정은 이미 예약된 건이라 안내가 중복된다) */}
            {formMode === 'create' && form.publishedAt && !isImmediatePublish && form.version.trim() && (
              <div className="p-3 rounded-lg bg-sky-50 dark:bg-sky-900/20 text-sm text-sky-800 dark:text-sky-300">
                {form.publishedAt.replace(/-/g, '.')} 00:00부터 v{form.version.trim()}이(가) 시행되며,
                {formCurrent ? ` 현재 v${formCurrent.version}은(는) 과거 버전이 됩니다.` : ' 해당 시점부터 현행 약관이 됩니다.'}
              </div>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={closeForm}
            className="flex-1 h-12 px-5 text-base font-bold border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={handleSubmitForm}
            disabled={isSaving}
            className="flex-1 h-12 px-5 text-base font-bold bg-primary hover:bg-primary-dark text-white"
          >
            {isSaving
              ? formMode === 'edit' ? '저장 중...' : '등록 중...'
              : formMode === 'edit' ? '저장하기' : '등록하기'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* 즉시 시행 확인 — 저장하면 되돌릴 수 없으므로 공통 ConfirmModal 로 한 번 더 받는다. */}
      <ConfirmModal
        isOpen={showImmediateConfirm}
        onClose={() => setShowImmediateConfirm(false)}
        onConfirm={submitForm}
        variant="warning"
        title={
          staysPast
            ? '과거 버전으로만 기록됩니다'
            : form.publishedAt === kstToday
              ? '오늘 시행으로 등록할까요?'
              : '지난 날짜로 시행할까요?'
        }
        description={
          staysPast
            ? `${typeLabel(form.type)} 현행은 ${currentLabel}입니다.\n시행일 ${form.publishedAt.replace(/-/g, '.')}이(가) 더 앞서므로 v${form.version.trim()}은(는) 현행이 되지 않고 과거 버전으로만 기록됩니다. 사용자 화면에는 노출되지 않으며, 이후 수정도 삭제도 할 수 없습니다.`
            : `${form.publishedAt.replace(/-/g, '.')} 00:00(한국시간)은 이미 지난 시각입니다.\n저장하는 즉시 ${typeLabel(form.type)} 현행이 v${form.version.trim()}으로 교체되며, 이후에는 수정도 삭제도 할 수 없습니다.`
        }
        confirmText={formMode === 'edit' ? '저장하기' : '등록하기'}
        isLoading={isSaving}
      />

      {/* 시행 예약 삭제 확인 모달 */}
      <Modal isOpen={deleteTarget !== null} onClose={() => setDeleteTarget(null)} size="sm">
        <ModalHeader title="시행 예약 삭제" icon={Trash2} />
        <ModalBody>
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
            {MESSAGES.terms.deleteConfirm}
          </p>
          {deleteTarget && (
            <p className="mt-3 text-sm font-medium text-slate-900 dark:text-white tabular-nums">
              {typeLabel(deleteTarget.type)} v{deleteTarget.version} · {isoToKstDateLabel(deleteTarget.publishedAt)} 시행
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setDeleteTarget(null)}
            className="flex-1 h-12 px-5 text-base font-bold border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={handleDelete}
            disabled={isSaving}
            className="flex-1 h-12 px-5 text-base font-bold bg-red-600 hover:bg-red-700 text-white"
          >
            {isSaving ? '삭제 중...' : '삭제하기'}
          </Button>
        </ModalFooter>
      </Modal>

      {/* 약관 미리보기 모달 */}
      <Modal isOpen={showPreviewModal} onClose={() => setShowPreviewModal(false)} size="full" className="max-w-3xl">
        <ModalHeader title={`${selectedTerm?.title || ''} 미리보기`} icon={Eye} />
        <ModalBody scrollable maxHeight="70vh">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-700 rounded-lg">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-10 h-10 shrink-0 ${getTypeBgColor(selectedTerm?.type || 'terms_of_service')} rounded-lg flex items-center justify-center`}>
                  {getTypeIcon(selectedTerm?.type || 'terms_of_service')}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-white truncate">{selectedTerm?.title}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
                    v{selectedTerm?.version} · {isoToKstDateLabel(selectedTerm?.publishedAt)} 시행
                  </p>
                </div>
              </div>

              {/* 등록 시각 — 시행일이 같은 버전이 여럿일 때 어느 쪽이 현행인지 가르는 값이다.
                  목록은 상태·시행일 순이라 이 근거가 드러나지 않으므로 여기에서만 밝힌다.
                  식별값(좌)과 성격이 다르므로 축을 나눠 우측 메타로 둔다. */}
              <div className="sm:text-right shrink-0">
                <p className="text-xs text-slate-400 dark:text-slate-500">등록</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
                  {isoToKstDateTimeLabel(selectedTerm?.createdAt)}
                </p>
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
        </ModalFooter>
      </Modal>
    </div>
  );
}
