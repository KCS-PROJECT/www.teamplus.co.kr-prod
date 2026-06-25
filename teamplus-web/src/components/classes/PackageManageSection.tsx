'use client';

/**
 * PackageManageSection (2026-05-22 신규)
 *
 * (coach)/classes-manage/edit/[id] 페이지에서 감독·코치·아카데미 원장·관리자가
 * 수업 패키지(ClassProduct)를 추가·수정·삭제(soft delete)·비활성화할 수 있는 카드 섹션.
 *
 * 비활성/종료일 초과 패키지는 grayscale + 배지 표시.
 *
 * 두 가지 동작 모드:
 *   - immediate(기본): 단건 API로 즉시 저장(수업상세 readonly 등 기존 호출처 호환).
 *   - deferred: API 호출 없이 부모가 준 DraftProduct[] 만 로컬 편집하고 onChange 로 전달.
 *     '수정하기' 클릭 시 부모가 bulk 엔드포인트로 일괄 반영한다.
 */

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { MESSAGES } from '@/lib/messages';
import {
  listClassProducts,
  deleteClassProduct,
  type ClassProductDto,
} from '@/services/class-product.service';
import { PackageEditSheet, type LocalProductDraft } from './PackageEditSheet';

/** deferred 모드 로컬 모델 — 신규(serverId 없음)·수정·삭제(_deleted) 마킹. */
export interface DraftProduct {
  /** 렌더/식별용 안정 키 (Math.random 금지 — 단조 증가 카운터). */
  localKey: string;
  /** 기존 패키지 id (없으면 신규). */
  serverId?: string;
  productName: string;
  price: number;
  feeType: string;
  sessionsPerMonth: number;
  sessionsPerWeek?: number;
  durationDays?: number;
  description?: string;
  /** 삭제 마킹 (기존 항목) — 목록에서 시각적으로 제거. */
  _deleted?: boolean;
}

let _draftKeySeq = 0;
function nextDraftKey(): string {
  _draftKeySeq += 1;
  return `draft-${_draftKeySeq}`;
}

/** 서버 패키지 → DraftProduct 변환 (deferred 초기값 로딩용). */
export function productToDraft(p: ClassProductDto): DraftProduct {
  return {
    localKey: nextDraftKey(),
    serverId: p.id,
    productName: p.productName,
    price: p.price,
    feeType: p.feeType ?? 'MONTHLY_FIXED',
    sessionsPerMonth: p.sessionsPerMonth ?? 1,
    sessionsPerWeek: p.sessionsPerWeek ?? undefined,
    durationDays: p.durationDays ?? undefined,
    description: p.description ?? undefined,
  };
}

interface PackageManageSectionProps {
  /** immediate 모드 필수. deferred 모드에서는 optional. */
  classId?: string;
  /** 코치/감독이 아닌 학부모/학생이 이 페이지에 진입한 경우 readonly */
  readonly?: boolean;
  /** 동작 모드 (기본 immediate — 기존 호출처 호환). */
  mode?: 'immediate' | 'deferred';
  /** deferred 전용 — 부모가 제어하는 draft 목록. */
  value?: DraftProduct[];
  /** deferred 전용 — draft 목록 변경 콜백. */
  onChange?: (next: DraftProduct[]) => void;
  /** deferred 전용 — 보류된 변경 존재 여부. true 면 '수정하기' 안내 배너 노출. */
  dirty?: boolean;
  /** 수업 정보의 주당 수업 횟수 (Class.classDays.length). 정기권 자동 계산용. */
  classSessionsPerWeek?: number;
  /** 수업 결제 방식 — 'POSTPAID'(후불)이면 패키지 추가를 차단(출석 기반 정산). */
  billingMode?: string;
  /** 렌더 형태 — 'card'(기본): 자체 카드+헤더 / 'embed': 카드·제목 없이 목록+추가버튼만(수강료 카드 내부 삽입용). */
  variant?: 'card' | 'embed';
  /** 1회권(PER_SESSION) 항목을 목록에서 제외 — 단가는 상위 '1회 수강료' 입력에서 관리(중복 방지).
   *  onChange 는 전체 draft 기준이라 숨겨진 PER_SESSION 도 보존된다. */
  excludePerSession?: boolean;
  /**
   * [ICETIMES] flat 테마. 기본 false = 기존 스타일 1:1 보존(타 화면 회귀 0).
   *   true 시 it-* 토큰(추가 버튼·행·안내 배너)으로 교체.
   */
  iceTheme?: boolean;
}

function formatPrice(n: number): string {
  return n.toLocaleString('ko-KR');
}

export function PackageManageSection({
  classId,
  readonly = false,
  mode = 'immediate',
  value,
  onChange,
  dirty = false,
  classSessionsPerWeek,
  billingMode,
  variant = 'card',
  excludePerSession = false,
  iceTheme = false,
}: PackageManageSectionProps) {
  const { toast } = useToast();
  const isDeferred = mode === 'deferred';
  // 후불 수업은 "후불 수업료" 단일 상품으로 출석 기반 월말 정산하므로 패키지 추가를 막는다.
  //   (기존 상품 수정/삭제는 허용 — 추가만 차단.)
  const isPostpaid = billingMode === 'POSTPAID';
  const canAdd = !readonly && !isPostpaid;
  // embed — 수강료 카드 내부 삽입용. 자체 카드·제목 없이 추가버튼+목록만 렌더.
  const isEmbed = variant === 'embed';

  // immediate 전용 상태 (deferred 에서는 미사용).
  const [products, setProducts] = useState<ClassProductDto[]>([]);
  const [isLoading, setIsLoading] = useState(!isDeferred);

  const [editTarget, setEditTarget] = useState<ClassProductDto | DraftProduct | null>(
    null,
  );
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (isDeferred || !classId) return;
    setIsLoading(true);
    try {
      const list = await listClassProducts(classId);
      setProducts(list);
    } finally {
      setIsLoading(false);
    }
  }, [classId, isDeferred]);

  useEffect(() => {
    if (!isDeferred) void refresh();
  }, [refresh, isDeferred]);

  const handleAdd = () => {
    setEditTarget(null);
    setIsSheetOpen(true);
  };

  const handleEdit = (p: ClassProductDto | DraftProduct) => {
    setEditTarget(p);
    setIsSheetOpen(true);
  };

  // ── immediate: 즉시 DELETE API ──
  const handleDeleteImmediate = async (p: ClassProductDto) => {
    if (typeof window === 'undefined' || !classId) return;
    const ok = window.confirm(
      `${MESSAGES.classProduct.deleteConfirmTitle}\n\n${MESSAGES.classProduct.deleteConfirmBody}`,
    );
    if (!ok) return;
    const res = await deleteClassProduct(classId, p.id);
    if (!res) {
      toast.error(MESSAGES.error.general);
      return;
    }
    const toastMessage =
      res.deleted === 'soft'
        ? MESSAGES.classProduct.softDeletedToast
        : MESSAGES.classProduct.hardDeletedToast;
    toast.success(toastMessage);
    await refresh();
  };

  // ── deferred: 로컬 삭제 마킹(기존) / 목록 제거(신규) ──
  const handleDeleteDeferred = (d: DraftProduct) => {
    if (!onChange) return;
    const next = (value ?? [])
      .map((item) => {
        if (item.localKey !== d.localKey) return item;
        // 기존(serverId 있음) → 삭제 마킹. 신규 → 목록에서 제거(아래 filter).
        return item.serverId ? { ...item, _deleted: true } : null;
      })
      .filter((item): item is DraftProduct => item !== null);
    onChange(next);
  };

  // ── deferred: 시트 저장 → 로컬 배열 반영 ──
  const handleLocalSave = (draft: LocalProductDraft) => {
    if (!onChange) return;
    const list = value ?? [];
    if (draft.localKey) {
      // 기존 draft 수정.
      onChange(
        list.map((item) =>
          item.localKey === draft.localKey
            ? {
                ...item,
                productName: draft.productName,
                price: draft.price,
                feeType: draft.feeType,
                sessionsPerMonth: draft.sessionsPerMonth,
                sessionsPerWeek: draft.sessionsPerWeek,
                durationDays: draft.durationDays,
                description: draft.description,
              }
            : item,
        ),
      );
    } else {
      // 신규 추가.
      onChange([
        ...list,
        {
          localKey: nextDraftKey(),
          serverId: undefined,
          productName: draft.productName,
          price: draft.price,
          feeType: draft.feeType,
          sessionsPerMonth: draft.sessionsPerMonth,
          sessionsPerWeek: draft.sessionsPerWeek,
          durationDays: draft.durationDays,
          description: draft.description,
        },
      ]);
    }
  };

  // ── 렌더용 정규화 목록 (모드별) ──
  const sortFn = (
    aFee: string,
    aSessions: number,
    bFee: string,
    bSessions: number,
  ): number => {
    // 1회차 → N회차(sessionsPerMonth 오름차순) → 전체(MONTHLY_FIXED).
    const order = (fee: string, sessions: number) =>
      fee === 'MONTHLY_FIXED' ? 100000 : sessions ?? 0;
    return order(aFee, aSessions) - order(bFee, bSessions);
  };

  const visibleDrafts: DraftProduct[] = isDeferred
    ? [...(value ?? [])]
        .filter((d) => !d._deleted)
        .filter((d) => !excludePerSession || d.feeType !== 'PER_SESSION')
        .sort((a, b) =>
          sortFn(a.feeType, a.sessionsPerMonth, b.feeType, b.sessionsPerMonth),
        )
    : [];

  const visibleProducts: ClassProductDto[] = !isDeferred
    ? [...products]
        .filter((p) => !excludePerSession || p.feeType !== 'PER_SESSION')
        .sort((a, b) =>
          sortFn(
            a.feeType ?? '',
            a.sessionsPerMonth ?? 0,
            b.feeType ?? '',
            b.sessionsPerMonth ?? 0,
          ),
        )
    : [];

  const isEmpty = isDeferred
    ? visibleDrafts.length === 0
    : visibleProducts.length === 0;

  return (
    <section
      className={
        isEmbed
          ? 'space-y-3'
          : iceTheme
            ? 'bg-it-surface dark:bg-rink-800 rounded-w-md p-5 border-[1.5px] border-it-line-strong dark:border-rink-700'
            : 'bg-white dark:bg-rink-800 rounded-2xl p-5 shadow-sm border border-wline-2 dark:border-rink-700'
      }
      aria-label={MESSAGES.classProduct.sectionTitle}
    >
      {isEmbed ? (
        // embed — 제목/설명은 부모(수강료 카드 라벨)가 제공. 추가 버튼만 우측 정렬.
        canAdd && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleAdd}
              className={
                iceTheme
                  ? 'shrink-0 h-9 px-3 rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 text-white text-card-meta font-bold whitespace-nowrap transition-colors motion-reduce:transition-none active:brightness-95'
                  : 'shrink-0 h-9 px-3 rounded-w-lg bg-ice-500 text-white text-card-meta font-bold whitespace-nowrap'
              }
            >
              + {MESSAGES.classProduct.addPackage}
            </button>
          </div>
        )
      ) : (
        <header className="flex items-start justify-between mb-3 gap-3">
          <div className="min-w-0">
            <h2
              className={
                iceTheme
                  ? 'text-card-title font-bold text-it-ink-800 dark:text-white'
                  : 'text-card-title font-bold text-wtext-1 dark:text-white'
              }
            >
              {MESSAGES.classProduct.sectionTitle}
            </h2>
            <p
              className={
                iceTheme
                  ? 'text-card-meta text-it-ink-500 dark:text-rink-300 mt-0.5'
                  : 'text-card-meta text-wtext-3 dark:text-rink-300 mt-0.5'
              }
            >
              {MESSAGES.classProduct.sectionDescription}
            </p>
          </div>
          {canAdd && (
            <button
              type="button"
              onClick={handleAdd}
              className={
                iceTheme
                  ? 'shrink-0 h-9 px-3 rounded-w-md bg-it-blue-500 hover:bg-it-blue-600 text-white text-card-meta font-bold whitespace-nowrap transition-colors motion-reduce:transition-none active:brightness-95'
                  : 'shrink-0 h-9 px-3 rounded-w-lg bg-ice-500 text-white text-card-meta font-bold whitespace-nowrap'
              }
            >
              + {MESSAGES.classProduct.addPackage}
            </button>
          )}
        </header>
      )}

      {/* 후불 수업 — 패키지 추가 차단 안내. 출석 횟수 기반 1회 수업료 월말 정산. */}
      {isPostpaid && !readonly && (
        <div
          role="note"
          className={
            iceTheme
              ? 'mb-3 rounded-w-md bg-it-fill dark:bg-rink-700/50 border border-it-line dark:border-rink-700 px-3 py-2.5'
              : 'mb-3 rounded-w-lg bg-wbg dark:bg-rink-700/50 border border-wline-2 dark:border-rink-700 px-3 py-2.5'
          }
        >
          <p
            className={
              iceTheme
                ? 'text-card-meta font-bold text-it-ink-800 dark:text-rink-100'
                : 'text-card-meta font-bold text-wtext-1 dark:text-rink-100'
            }
          >
            {MESSAGES.classProduct.postpaidLockTitle}
          </p>
          <p
            className={
              iceTheme
                ? 'text-card-caption text-it-ink-500 dark:text-rink-300 mt-0.5'
                : 'text-card-caption text-wtext-3 dark:text-rink-300 mt-0.5'
            }
          >
            {MESSAGES.classProduct.postpaidLockHint}
          </p>
        </div>
      )}

      {/* [패키지 일괄 반영] 보류된 변경 안내 — '수정하기' 클릭 전까지 저장되지 않음.
          embed(등록 화면)에서는 폼 제출로 일괄 저장되므로 안내 생략. */}
      {!isEmbed && isDeferred && dirty && (
        <div
          role="status"
          aria-live="polite"
          className={
            iceTheme
              ? 'mb-3 rounded-w-md bg-it-blue-50 dark:bg-rink-700/50 border border-it-blue-100 dark:border-rink-700 px-3 py-2.5'
              : 'mb-3 rounded-w-lg bg-ice-50 dark:bg-rink-700/50 border border-ice-100 dark:border-rink-700 px-3 py-2.5'
          }
        >
          <p
            className={
              iceTheme
                ? 'text-card-meta font-semibold text-it-ink-800 dark:text-rink-100'
                : 'text-card-meta font-semibold text-wtext-2 dark:text-rink-100'
            }
          >
            {MESSAGES.classProduct.deferredDeleteHint}
          </p>
        </div>
      )}

      {!isDeferred && isLoading ? (
        <ul className="space-y-2" aria-busy="true">
          {[0, 1].map((i) => (
            <li
              key={i}
              className={
                iceTheme
                  ? 'h-16 rounded-w-md bg-it-fill dark:bg-rink-700 animate-pulse motion-reduce:animate-none'
                  : 'h-16 rounded-w-lg bg-wline-2 dark:bg-rink-700 animate-pulse'
              }
            />
          ))}
        </ul>
      ) : isEmpty ? (
        // embed(등록) — 추가 전이면 큰 빈 박스 없이 추가버튼만 노출.
        isEmbed ? null : (
          <div className="py-8 text-center">
            <p
              className={
                iceTheme
                  ? 'text-card-body font-semibold text-it-ink-800 dark:text-rink-200'
                  : 'text-card-body font-semibold text-wtext-2 dark:text-rink-200'
              }
            >
              {MESSAGES.classProduct.emptyTitle}
            </p>
            <p
              className={
                iceTheme
                  ? 'text-card-meta text-it-ink-500 dark:text-rink-300 mt-1'
                  : 'text-card-meta text-wtext-3 dark:text-rink-300 mt-1'
              }
            >
              {MESSAGES.classProduct.emptyDescription}
            </p>
          </div>
        )
      ) : (
        <ul className="space-y-2" role="list">
          {isDeferred
            ? visibleDrafts.map((d) => (
                <PackageRow
                  key={d.localKey}
                  name={d.productName}
                  price={d.price}
                  // deferred 로컬 항목은 비활성/구매가능 계산이 없으므로 항상 활성 표시.
                  disabled={false}
                  badge={null}
                  readonly={readonly}
                  canDelete={!isPostpaid}
                  iceTheme={iceTheme}
                  onEdit={() => handleEdit(d)}
                  onDelete={() => handleDeleteDeferred(d)}
                />
              ))
            : visibleProducts.map((p) => {
                const disabled = !p.isPurchasable;
                const badge =
                  p.isActive === false
                    ? MESSAGES.classProduct.badgeInactive
                    : null;
                return (
                  <PackageRow
                    key={p.id}
                    name={p.productName}
                    price={p.price}
                    disabled={disabled}
                    badge={badge}
                    readonly={readonly}
                    canDelete={!isPostpaid}
                    iceTheme={iceTheme}
                    onEdit={() => handleEdit(p)}
                    onDelete={() => handleDeleteImmediate(p)}
                  />
                );
              })}
        </ul>
      )}

      {!readonly && (
        <PackageEditSheet
          isOpen={isSheetOpen}
          onClose={() => setIsSheetOpen(false)}
          classId={classId ?? ''}
          mode={mode}
          initial={
            isDeferred
              ? null
              : (editTarget as ClassProductDto | null)
          }
          initialDraft={isDeferred ? (editTarget as DraftProduct | null) : null}
          classSessionsPerWeek={classSessionsPerWeek}
          onSaved={() => {
            void refresh();
          }}
          onLocalSave={handleLocalSave}
        />
      )}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────
// Row
// ──────────────────────────────────────────────────────────────────

function PackageRow({
  name,
  price,
  disabled,
  badge,
  readonly,
  canDelete = true,
  iceTheme = false,
  onEdit,
  onDelete,
}: {
  name: string;
  price: number;
  disabled: boolean;
  badge: string | null;
  readonly: boolean;
  /** 삭제 버튼 노출 여부 — 후불 수업은 false(1회 수업료 상품 삭제 불가). */
  canDelete?: boolean;
  /** [ICETIMES] flat 테마 — it-* 토큰 적용. */
  iceTheme?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const rowClass = iceTheme
    ? disabled
      ? 'rounded-w-md border-[1.5px] p-3 border-it-line bg-it-fill/60 dark:bg-rink-700/40 grayscale'
      : 'rounded-w-md border-[1.5px] p-3 border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800'
    : disabled
      ? 'rounded-w-lg border p-3 border-wline-2 bg-wline-2/40 dark:bg-rink-700/40 grayscale'
      : 'rounded-w-lg border p-3 border-wline dark:border-rink-700 bg-white dark:bg-rink-800';
  return (
    <li className={rowClass}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p
              className={
                iceTheme
                  ? 'text-card-body font-bold text-it-ink-800 dark:text-rink-100 truncate'
                  : 'text-card-body font-bold text-wtext-1 dark:text-rink-100 truncate'
              }
            >
              {name}
            </p>
            {badge && (
              <span
                className={
                  iceTheme
                    ? 'shrink-0 inline-flex items-center h-5 px-2 rounded-pill text-card-caption font-bold bg-it-fill text-it-ink-500 dark:bg-rink-700 dark:text-rink-200'
                    : 'shrink-0 inline-flex items-center h-5 px-2 rounded-pill text-card-caption font-bold bg-wline-2 text-wtext-2 dark:bg-rink-700 dark:text-rink-200'
                }
                aria-label={badge}
              >
                {badge}
              </span>
            )}
          </div>
          <p
            className={
              iceTheme
                ? 'text-card-meta text-it-ink-600 dark:text-rink-200 mt-1 tabular-nums'
                : 'text-card-meta text-wtext-2 dark:text-rink-200 mt-1 tabular-nums'
            }
          >
            {formatPrice(price)}원
          </p>
        </div>
        {!readonly && (
          <div className="shrink-0 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={onEdit}
              className={
                iceTheme
                  ? 'h-8 px-3 rounded-w-md border-[1.5px] border-it-line-strong dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-card-meta font-semibold text-it-ink-800 dark:text-rink-100 transition-colors motion-reduce:transition-none active:brightness-95'
                  : 'h-8 px-3 rounded-w-lg border border-wline-2 dark:border-rink-700 bg-white dark:bg-rink-800 text-card-meta font-semibold text-wtext-1 dark:text-rink-100'
              }
            >
              {MESSAGES.classProduct.editPackage}
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={onDelete}
                className={
                  iceTheme
                    ? 'h-8 px-3 rounded-w-md border-[1.5px] border-it-red-100 dark:border-rink-700 bg-it-surface dark:bg-rink-800 text-card-meta font-semibold text-it-red-500 dark:text-it-red-300 transition-colors motion-reduce:transition-none active:brightness-95'
                    : 'h-8 px-3 rounded-w-lg border border-error-500/30 bg-white dark:bg-rink-800 text-card-meta font-semibold text-error-600 dark:text-error-400'
                }
              >
                {MESSAGES.classProduct.deletePackage}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export default PackageManageSection;
