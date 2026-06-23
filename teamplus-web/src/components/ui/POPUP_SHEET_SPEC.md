# P. 팝업 · 바텀시트 디자인 정렬 SPEC

> 레퍼런스: `/Users/joogik/develop/app_screen_00/_ _ _offline_.html` (Section P, P1~P4 + Design Tokens v2)
> 목표: 4개 모달 패턴(P1 컨펌 다이얼로그 / P2 풀스크린 컨펌 / P3 바텀시트 셀렉터 / P4 바텀시트 동의)을 TEAMPLUS Wallet v2 토큰으로 정렬.

## 1. 디자인 토큰 매핑 (레퍼런스 → TEAMPLUS)

| 레퍼런스 token | 값 | TEAMPLUS 매핑 | 비고 |
|---|---|---|---|
| `--r-2xl` | 28px | `rounded-[28px]` (dialog) / `rounded-t-w-2xl` (sheet) | 시트·다이얼로그 공용 |
| `--c-rink-900` | #141826 | `bg-rink-900/45` (sheet overlay) / `bg-rink-900/55` (dialog overlay) | 솔리드 dim |
| `--sh-4` | 0 16px 40px rgba(20,24,38,0.12) | `shadow-sh-rink` | 시트·다이얼로그 |
| `--c-ice-500` | #2f5fff | `bg-ice-500 hover:bg-ice-600 active:bg-ice-700` | primary CTA |
| `--c-text-1/2/3/4` | text scale | `text-wtext-1/2/3/4` | 텍스트 위계 |
| `--c-surface` | #ffffff | `bg-wsurface` (light) / `dark:bg-rink-800` | 시트 표면 |
| `--c-line / line-2` | #e5e9f2 / #eef1f7 | `bg-wline` `bg-wline-2` `border-wline-2` | 핸들·구분선 |
| `--ease` | cubic-bezier(0.2,0.8,0.2,1) | `animate-sheet-up` / `animate-overlay-in` (정의됨) | 모션 |
| 핸들 바 | 40 × 4 rounded-pill | `h-1 w-10 rounded-full bg-wline` | 시트 상단 |
| 버튼 높이 | 52px | `h-[52px]` | confirm/CTA 통일 |

## 2. 컴포넌트별 적용 매트릭스

| 컴포넌트 | 패턴 | 현재 상태 | 변경 항목 |
|---|---|---|---|
| `Modal/Modal.tsx` | P1 base | bg-black/70, rounded-2xl, slate, shadow-md | overlay → `bg-rink-900/55`, radius → `rounded-[28px]`, surface → `bg-wsurface dark:bg-rink-800`, shadow → `shadow-sh-rink`, header divider → `border-wline-2`, close hover → `bg-wbg` |
| `Modal/ConfirmDialog.tsx` | P1 | rounded-[28px] ✅ but bg-slate-950/70, `#1E3FAE` 하드코딩 | overlay → `bg-rink-900/55`, primary → `bg-ice-500`, surface/text → wsurface/wtext, ring → `ring-wline-2` |
| `Modal/AlertDialog.tsx` | P1 alert | bg-black/50, rounded-2xl(16px), slate | radius → `rounded-[28px]`, overlay → `bg-rink-900/55`, surface → `bg-wsurface`, shadow → `shadow-sh-rink`, text → wtext |
| `Modal/FullModal.tsx` | P2 풀스크린 | header bg-white border-slate-200 | bg → `bg-wbg dark:bg-rink-900`, header → `bg-wsurface border-wline-2`, close hover → `bg-wbg` |
| `EventPopup.tsx` | P1 variant | rounded-3xl(24px), `#1E40AF`, gray, blue-50 | radius → `rounded-[28px]`, primary → `bg-ice-500 hover:bg-ice-600`, icon bg → `bg-ice-100`, text → `text-wtext-1/text-wtext-3`, footer → `bg-wbg border-wline-2`, button height 56→52 |
| `BottomSheet.tsx` | P3 base | rounded-t-2xl(16px), bg-black/40, slate, shadow-md | radius → `rounded-t-w-2xl`, overlay → `bg-rink-900/45`, handle → `bg-wline`, surface → `bg-wsurface dark:bg-rink-800`, shadow → `shadow-sh-rink`, header text → `text-w-title text-wtext-1`, close hover → `bg-wbg`, footer divider → `border-wline-2` |
| `ConfirmSheet.tsx` | P3 confirm | rounded-t-2xl(16px), slate, button rounded-xl | radius → `rounded-t-w-2xl`, overlay → `bg-rink-900/45`, surface → `bg-wsurface dark:bg-rink-800`, handle → `bg-wline`, button radius → `rounded-w-md`, primary → `bg-ice-500 hover:bg-ice-600`, danger 유지, cancel → `bg-wbg text-wtext-2 hover:bg-wline-2` |
| `BottomSheetSelector.tsx` | P3 list | ✅ 이미 Wallet v2 정렬 | 변경 없음 |
| `BottomSheetConfirm.tsx` | P4 terms | ✅ 이미 Wallet v2 정렬 | 변경 없음 |

## 3. 무조건 불합격 트리거 (이번 작업 한정)

- ❌ `bg-gradient-to-*` 사용 (헤더 스크롤 외)
- ❌ `backdrop-blur-*` 사용
- ❌ `shadow-*-500/30` 컬러 그림자
- ❌ `#1E40AF` `#1E3FAE` 등 하드코딩 컬러 (토큰 사용 강제)
- ❌ 핸들 바 / radius / overlay opacity 일관성 위반
- ❌ MESSAGES 미사용 한글 하드코딩 (단, ARIA 라벨/타이틀 props 는 호출자 책임)
- ❌ Tone & Manner 위반 (등록하기/수정하기/삭제하기/저장하기/확인/취소)

## 4. 검증 (Phase 4 evaluator 기준)

1. C1 디자인 위반: 변경 컴포넌트 grep으로 gradient/blur/color-shadow 0건 확인
2. 토큰 일관성: 7개 컴포넌트가 동일한 radius/overlay/shadow/handle 토큰 사용
3. 다크모드: 모든 컴포넌트 `dark:` variant 정상 동작
4. 접근성: role="dialog"/"alertdialog" + aria-modal + aria-labelledby/describedby 유지
5. 모션: prefers-reduced-motion 대응 (`motion-reduce:animate-none`) 유지
6. 빌드: TypeScript 컴파일 무오류, ESLint 무경고

## 5. 변경 범위 (불가침)

- ❌ 컴포넌트 props 시그니처 변경 금지 (호출자 안전)
- ❌ 비즈니스 로직(스크롤 잠금, ESC 핸들러, 포털) 변경 금지
- ✅ 클래스/스타일·색상 토큰만 정렬
