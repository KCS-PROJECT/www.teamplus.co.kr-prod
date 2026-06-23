---
name: Parent 화면 디자인 언어 일관성 규칙
description: /classes 재작업 시 검증된 학부모 공통 디자인 시스템 — awards 카드 + children Summary 패턴을 모든 parent 뷰에 적용
type: feedback
---

학부모 대시보드 하위 모든 뷰는 **동일한 2가지 기본 패턴**으로 일관성을 유지한다. 개별 화면의 창의성(좌측 stripe, editorial 4단 등)보다 시스템 일관성이 우선이다.

**Why:** 2026-04-19 /classes 재작업에서 "좌측 3px stripe + 에디토리얼 4단" 스타일이 다른 학부모 화면(/children, /awards, /credits, /rsvp)에 없어서 이질적이라는 피드백을 받음. 다른 학부모 화면을 훑어봤을 때 "같은 디자인 시스템이네"라는 인상을 주어야 한다는 명확한 요구사항 받음.

**How to apply:**
- **Summary/Header 카드**: `/children/page.tsx` 50~111의 "My Family" 패턴
  - 좌측: eyebrow (`text-[11px] font-bold text-primary tracking-widest uppercase`) + hero number (`text-4xl font-black tabular-nums leading-none`) + 서브텍스트 (`text-sm text-slate-500`)
  - 우측: `shrink-0 h-14 w-14 rounded-2xl bg-primary/10 text-primary ring-4 ring-primary/5` 아이콘 컨테이너
  - 하단: Progress bar — `h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden` + `bg-primary`
- **리스트 카드**: `/awards/page.tsx` AwardListCard 패턴
  - 래퍼: `bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm hover:border-primary/30 dark:hover:border-primary/40 hover:shadow-md transition-all`
  - 상단: 타입 배지 (rounded-full + `bg-*-100 text-*-700 dark:bg-*-900/20 dark:text-*-400`) + `chevron_right` 우측 정렬
  - 제목: `text-base font-bold text-slate-900 dark:text-white leading-tight`
  - 메타: `text-xs text-slate-400 dark:text-slate-500` (Icon size={13-14} + 라벨)
- **Empty State**: primary tonal (`bg-primary/10 text-primary ring-4 ring-primary/5`) — 단 Search 결과 없음은 slate tonal (primary 반복 회피)
- **Skeleton**: `rounded-xl` (rounded-2xl 지양) + 실제 카드 높이 반영 (~180px)

**금지 패턴** (학부모 화면에서 절대 사용 금지):
- 좌측 컬러 stripe (`absolute left-0 w-[3px]`) — 카드 일관성 깨짐
- 에디토리얼 4단 (상단 dot label + 제목 + 메타 + footer) — 학부모는 "배지 + chevron" 2단 헤더 사용
- 푸터 영역 별도 배경 (`bg-slate-50/60 border-t`) — awards처럼 border-t만으로 분리
- 3xl 라디우스 — 2xl 최대, 카드는 xl
