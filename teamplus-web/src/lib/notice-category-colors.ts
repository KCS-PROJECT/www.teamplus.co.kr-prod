/**
 * Notice Category Colors SoT (Single Source of Truth)
 *
 * 공지/이벤트/오픈클래스 홍보 카테고리 라벨 pill 색상의 단일 정의.
 * `(notice)/list`, `(director)/director-notices`, `(admin)/notices-manage` 등
 * 모든 공지 도메인 화면이 이 파일을 참조해 동일한 라벨 색을 얻는다.
 *
 * 사용 예:
 *   import { NOTICE_CATEGORY_LABEL_CLASS, NOTICE_CATEGORY_LABEL } from '@/lib/notice-category-colors';
 *   <span className={NOTICE_CATEGORY_LABEL_CLASS[notice.category]}>
 *     {NOTICE_CATEGORY_LABEL[notice.category]}
 *   </span>
 */

export type NoticeCategoryVariant = 'notice' | 'event' | 'academy';

/**
 * 카테고리 라벨 pill 클래스 (가정 컨테이너: `text-[10px] font-bold px-1.5 py-0.5 rounded`)
 * — 색상만 정의, padding/radius/font 는 호출 측이 결정한다.
 */
export const NOTICE_CATEGORY_LABEL_CLASS: Record<NoticeCategoryVariant, string> = {
  notice:  'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700',
  event:   'text-primary bg-primary/10 dark:bg-primary/20 dark:text-blue-300',
  academy: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30',
};

/** 카테고리 한국어 표시 라벨 */
export const NOTICE_CATEGORY_LABEL: Record<NoticeCategoryVariant, string> = {
  notice:  '공지',
  event:   '이벤트',
  academy: '홍보',
};

/** "중요" 핀 라벨 (amber) — 상단 고정 공지 강조용 */
export const NOTICE_PINNED_LABEL_CLASS =
  'text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300';

/** 학년 필터 라벨 (blue) — 대상 출생연도 범위 표시용 */
export const NOTICE_GRADE_LABEL_CLASS =
  'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30';
