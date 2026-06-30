# UI_LAYOUT_GUIDE.md - TEAMPLUS 레이아웃 표준 가이드

---

        [Guides] 업데이트 2026.04.05. 00:00:00

---

---

        [Guides] 하네스 정합성 동기화 2026.04.11. 23:30:00

---

**Status**: ✅ Active
**Version**: 1.5
**Last Updated**: 2026-05-14 (실측 SOT 동기화 — teamplus-web 229 pages · 353 컴포넌트 · 다크모드 전 컴포넌트 적용 실측 확인)
**Source of Truth**: `teamplus-app/lib/core/theme/` · `teamplus-web/src/components/layout/MobileContainer.tsx`

---

## 개요

이 문서는 TEAMPLUS 앱의 모든 UI 레이아웃에 적용되는 표준 규격을 정의합니다.
**모든 화면 작업 시 이 가이드를 필수 적용해야 합니다.**

---

## 1. Spacing System (8px 기반)

모든 간격은 8px 기본 단위를 사용합니다.

| 토큰         | 값   | 사용처                                |
| ------------ | ---- | ------------------------------------- |
| `spacingXS`  | 4px  | 아이콘-텍스트 간격, 밀집된 요소       |
| `spacingSM`  | 8px  | 버튼 내부 패딩, 카드 내 요소 간격     |
| `spacingMD`  | 16px | 컨테이너 패딩, 섹션 간격, 표준 마진   |
| `spacingLG`  | 24px | 큰 섹션 간격, 카드 그룹 간격          |
| `spacingXL`  | 32px | 화면 섹션 구분, 주요 블록 간격        |
| `spacing2XL` | 48px | 대형 섹션 분리, 페이지 상단/하단 여백 |

### Flutter 사용 예시

```dart
import 'package:teamplus_app/core/theme/app_theme.dart';

// 사용
Padding(padding: EdgeInsets.all(AppTheme.spacingMD))
SizedBox(height: AppTheme.spacingLG)
```

### 화면 기본 레이아웃

```
┌─────────────────────────────────┐
│ StatusBar                       │
├─────────────────────────────────┤
│ AppBar (56dp)                   │
├─────────────────────────────────┤
│                                 │
│   ← 16px →  Content  ← 16px →   │  (좌우 패딩)
│                                 │
│   ┌─────────────────────┐       │
│   │ Card  (padding 16)  │       │
│   └─────────────────────┘       │
│        ↕ 12px (카드 간격)        │
│   ┌─────────────────────┐       │
│   │ Card                │       │
│   └─────────────────────┘       │
│                                 │
├─────────────────────────────────┤
│ BottomNav (64dp)                │
└─────────────────────────────────┘
```

---

## 2. Typography Scale

| 스타일    | 크기 | 굵기     | Line Height | Letter Spacing | 용도          |
| --------- | ---- | -------- | ----------- | -------------- | ------------- |
| `H1`      | 32px | Bold     | 1.2         | -0.5px         | 메인 제목     |
| `H2`      | 24px | Bold     | 1.2         | -0.3px         | 섹션 제목     |
| `H3`      | 20px | SemiBold | 1.2         | -0.2px         | 서브섹션 제목 |
| `Body`    | 16px | Regular  | 1.5         | 0              | 본문 텍스트   |
| `Caption` | 14px | Regular  | 1.4         | 0              | 보조 텍스트   |
| `Label`   | 12px | Medium   | 1.4         | 0.1px          | 라벨, 배지    |

### Flutter 사용 예시

```dart
Text('메인 제목', style: AppTheme.headingH1)
Text('본문 내용', style: AppTheme.bodyText)
Text('보조 설명', style: AppTheme.captionText)
```

### 플랫폼별 폰트 패밀리

| 플랫폼        | 주요 폰트 (영문/숫자)                 | 한글 폰트   | 적용 범위                    |
| ------------- | ------------------------------------- | ----------- | ---------------------------- |
| Flutter App   | .SF Pro Text (iOS) / Roboto (Android) | 시스템 기본 | teamplus-app                 |
| Web (Next.js) | Manrope                               | Pretendard  | teamplus-web, teamplus-admin |

```css
/* Web 폰트 스택 */
font-family:
  "Manrope",
  "Pretendard",
  -apple-system,
  BlinkMacSystemFont,
  sans-serif;
```

### 한글 최적화 가이드라인

- **Line Height**: 한글 가독성을 위해 1.4~1.5 유지
- **Letter Spacing**: 한글은 0 또는 약간의 음수(-0.2px) 권장
- **Font Family**: 플랫폼별 폰트 적용 (위 표 참조)

---

## 3. Touch Target Standards (WCAG 준수)

### 표준 사이즈

| 구분         | 최소 크기   | WCAG 등급 | 적용 대상                  |
| ------------ | ----------- | --------- | -------------------------- |
| **Standard** | 48 x 48 dp  | AA        | 일반 버튼, 탭, 아이콘 버튼 |
| **Child UI** | 72 x 72 dp  | AAA       | 4-7세 아이용 인터페이스    |
| **Input**    | 44dp (높이) | AA        | 텍스트 필드                |

### 터치 타겟 간격

- **최소 간격**: 8dp (터치 타겟 사이)
- **권장 간격**: 12-16dp (오작동 방지)

### Flutter Constants

```dart
// app_theme.dart에서 정의됨
static const double buttonHeight = 48.0;      // 표준 버튼
static const double inputHeight = 44.0;       // 입력 필드
static const double childButtonHeight = 72.0; // 아이 UI
static const double touchTargetMin = 48.0;    // 최소 터치 영역
```

---

## 4. Container Standards

### 카드 (Card)

```
┌──────────────────────────────┐
│ ← 16px padding all around →  │
│                              │
│  Content here                │
│                              │
└──────────────────────────────┘
     ↕ margin-bottom: 12px
```

| 속성            | 값                                      |
| --------------- | --------------------------------------- |
| `padding`       | 16px                                    |
| `margin-bottom` | 12px                                    |
| `border-radius` | 8px                                     |
| `border`        | 1px solid #E5E7EB                       |
| `background`    | #FFFFFF                                 |
| `shadow`        | shadow-sm (웹) / none (앱, flat design) |

### Flutter Card 사용

```dart
Card(
  margin: EdgeInsets.only(bottom: 12),
  shape: RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(8),
    side: BorderSide(color: AppColors.cardBorder),
  ),
  child: Padding(
    padding: EdgeInsets.all(16),
    child: ...
  ),
)
```

### Border Radius 표준

| 토큰           | 값   | 용도                      |
| -------------- | ---- | ------------------------- |
| `radiusSmall`  | 6px  | 입력 필드, 작은 버튼      |
| `radiusMedium` | 8px  | 카드, 버튼, 일반 컨테이너 |
| `radiusLarge`  | 12px | 모달, 다이얼로그, 큰 카드 |
| `radiusXLarge` | 16px | 바텀시트, 전체화면 모달   |

---

## 5. Grid System

### 반응형 Breakpoints

| 디바이스    | 범위       | 컬럼 | 여백 |
| ----------- | ---------- | ---- | ---- |
| **Mobile**  | 0-767px    | 1    | 16px |
| **Tablet**  | 768-1023px | 2    | 24px |
| **Desktop** | 1024px+    | 3+   | 32px |

### Mobile 레이아웃 (기본)

```
←16px→ ┌────────────────────┐ ←16px→
       │ Full Width Card    │
       └────────────────────┘
```

### Tablet 레이아웃

```
←24px→ ┌─────────┐ 16px ┌─────────┐ ←24px→
       │ Card 1  │      │ Card 2  │
       └─────────┘      └─────────┘
```

### Safe Area 처리

```dart
SafeArea(
  child: Scaffold(
    body: Padding(
      padding: EdgeInsets.symmetric(horizontal: 16),
      child: ...
    ),
  ),
)
```

---

## 6. Color Reference

> **Source of Truth**: `teamplus-app/lib/core/theme/colors.dart`

### Primary Colors

| 이름           | HEX       | 용도                    |
| -------------- | --------- | ----------------------- |
| `primary`      | `#1E3FAE` | 주요 버튼, 강조, 브랜드 |
| `primaryLight` | `#DBEAFE` | 배경, 비활성 상태       |
| `accent`       | `#0891B2` | CTA, 링크, 포커스       |

### Semantic Colors

| 이름      | HEX       | 용도               |
| --------- | --------- | ------------------ |
| `success` | `#16A34A` | 승인, 체크인, 완료 |
| `warning` | `#EAB308` | 경고, 크레딧, 주의 |
| `error`   | `#DC2626` | 오류, 취소, 거부   |
| `info`    | `#0284C7` | 정보, 안내         |

### Neutral Colors

| 이름         | HEX       | 용도                |
| ------------ | --------- | ------------------- |
| `darkText`   | `#1F2937` | 주요 텍스트         |
| `lightText`  | `#6B7280` | 보조 텍스트         |
| `hintText`   | `#9CA3AF` | 플레이스홀더        |
| `dividers`   | `#E5E7EB` | 구분선, 테두리      |
| `background` | `#F9FAFB` | 배경색              |
| `white`      | `#FFFFFF` | 카드, 입력필드 배경 |

### 달력 상태 색상

| 상태 | HEX       | 설명       |
| ---- | --------- | ---------- |
| 예약 | `#60A5FA` | Light Blue |
| 완료 | `#22C55E` | Green      |
| 출석 | `#3B82F6` | Blue       |
| 결석 | `#F97316` | Orange     |
| 취소 | `#9CA3AF` | Gray       |

---

## 7. Component Quick Reference

### 버튼 (Buttons)

| 타입      | 높이 | 배경        | 텍스트               |
| --------- | ---- | ----------- | -------------------- |
| Primary   | 48dp | `#1E3FAE`   | White, 16px Bold     |
| Secondary | 48dp | Transparent | `#1E3FAE`, 16px Bold |
| Danger    | 48dp | `#DC2626`   | White, 16px Bold     |
| Child     | 72dp | `#1E3FAE`   | White, 18px Bold     |

### 입력 필드 (Inputs)

| 속성          | 값                             |
| ------------- | ------------------------------ |
| 높이          | 44dp                           |
| 패딩          | 16px horizontal, 12px vertical |
| 테두리        | 1px `#D1D5DB`                  |
| 포커스 테두리 | 2px `#0891B2`                  |
| 에러 테두리   | 2px `#DC2626`                  |
| Border Radius | 6px                            |

### 하단 네비게이션

| 속성      | 값        |
| --------- | --------- |
| 높이      | 64dp      |
| 배경      | `#FFFFFF` |
| 선택됨    | `#1E3FAE` |
| 미선택    | `#6B7280` |
| 라벨 크기 | 12px      |

---

## 8. Design 7 Principles Checklist

화면 작업 시 아래 체크리스트를 확인하세요:

- [ ] **1. 화면 분석**: 기존 화면/디자인 시안 분석 완료
- [ ] **2. 휴먼 디자인**: 솔리드 색상, 일관된 간격, 전문적 레이아웃
- [ ] **3. AI 스타일 금지**: 그라디언트, 블러, 컬러 쉐도우 미사용. 그림자 규칙 아래 참조
- [ ] **4. Spacing 적용**: 8px 기반 간격 시스템 준수
- [ ] **5. Touch Target**: 48dp (AA) / 72dp (AAA) 최소 크기 확인
- [ ] **6. Typography**: 정의된 스케일 사용 (12/14/16/20/24/32)
- [ ] **7. Tone & Manner**: 존댓말, 한글 UI 텍스트 표준 적용 → [WEB_DESIGN_SYSTEM.md #10~11](../Design/WEB_DESIGN_SYSTEM.md) 참조

---

## 8-A. 필수 규칙 (2026-04-05 추가)

### 컬러 — bg-primary CSS 변수 필수 사용

```tsx
// ❌ 금지 — 하드코딩
className = "bg-blue-600 hover:bg-blue-700";

// ✅ 필수 — CSS 변수 사용
className = "bg-primary hover:bg-primary-dark";
```

| 용도              | 클래스                  | HEX (참고용)        |
| ----------------- | ----------------------- | ------------------- |
| Primary 배경      | `bg-primary`            | #1E3FAE             |
| Primary hover     | `hover:bg-primary-dark` | #152B7A             |
| Primary 텍스트    | `text-primary`          | #1E3FAE             |
| Primary 테두리    | `border-primary`        | #1E3FAE             |
| Primary 연한 배경 | `bg-primary/10`         | rgba(30,63,174,0.1) |

> `bg-blue-600`, `bg-blue-700` 하드코딩은 **즉시 bg-primary로 교체**하세요.
> globals.css에 `--primary: 226 71% 40%` CSS 변수로 정의되어 있습니다.

### 그림자 — shadow-md 기본, shadow-lg/xl은 모달/드롭다운만

```tsx
// ❌ 금지 — 일반 카드/버튼에 shadow-lg 이상 사용
className = "shadow-lg"; // 카드에 사용 금지
className = "shadow-xl"; // 버튼에 사용 금지
className = "shadow-2xl"; // 전면 금지

// ✅ 규칙
className = "shadow-sm"; // 버튼, 카드 (기본)
className = "shadow-md"; // 모달 오버레이, 드로어 (최대 허용)
className = "shadow-lg"; // 모달 다이얼로그, 드롭다운 팝오버 (예외 허용)
```

| 컴포넌트                  | 허용 shadow   |
| ------------------------- | ------------- |
| 버튼, 카드, 입력          | `shadow-sm`   |
| 모달 오버레이, 드로어     | `shadow-md`   |
| 모달 다이얼로그, 드롭다운 | `shadow-lg`   |
| 2xl 이상                  | **전면 금지** |

### 알림 — alert() 금지, toast + MESSAGES 필수

```tsx
// ❌ 절대 금지
window.alert("저장되었습니다.");
alert("오류가 발생했습니다.");

// ✅ 필수
import { toast } from "@/components/ui/use-toast";
import { MESSAGES } from "@/lib/messages";

toast({ title: MESSAGES.save.success }); // 성공
toast({ title: MESSAGES.error.general, variant: "destructive" }); // 오류
```

> `alert()`, `confirm()`, `prompt()`는 브라우저 네이티브 다이얼로그를 차단하므로 **WebView 환경에서 특히 위험**합니다. shadcn/ui `toast` + `MESSAGES` 상수를 반드시 사용하세요.

### 본문 하단 여백 — `MobileContainer` 자동 처리, 페이지 중복 금지

`MobileContainer`는 `[&>main]:pb-30`(7.5rem=120px)으로 **직계 자식 `<main>`에 하단 여백을 항상 자동 부여**합니다(`hasBottomNav` 값과 무관). BottomNav에 본문이 가리지 않게 하는 공통 처리입니다.

```tsx
// ❌ 중복 — main(자동 120px) + 내부 요소(120px) = 240px 이중 여백
<MobileContainer>
  <main>
    <section className="... pb-30">...</section>   {/* 중복! */}
  </main>
</MobileContainer>

// ✅ 페이지는 하단 pb 를 주지 않는다 (MobileContainer 가 자동 처리)
<MobileContainer>
  <main>
    <section className="...">...</section>
  </main>
</MobileContainer>
```

> **규칙**: 페이지 `<main>` **내부 요소**(section/div/ul 등)에 `pb-30`을 **중복으로 주지 마세요.** `<main>`이 직계 자식이면 `MobileContainer`가 이미 처리합니다. (예외 — `<main>` 없이 `<div>` 루트인 페이지나 `fixed`/`sticky` 액션바 회피용은 자체 `pb` 필요.) **2026-06-30 점검 시 62개 중 6개 페이지에서 이 중복이 발견·정리됨.**

---

## 9. AppBar 공통 컴포넌트

**파일**: `teamplus-web/src/components/layout/AppBar.tsx`

모든 웹 페이지에서 통일된 상단 헤더를 제공하는 공통 컴포넌트입니다.

### 기본 구조

```
┌─────────────────────────────────────┐
│  ← (뒤로가기)    타이틀    ☰ (메뉴) │
└─────────────────────────────────────┘
```

### 기능

| 기능        | 설명                            | Props                             |
| ----------- | ------------------------------- | --------------------------------- |
| 뒤로가기    | 이전 페이지로 이동 (왼쪽)       | `showBack?: boolean` (기본: true) |
| 타이틀      | 가운데 정렬 페이지 제목         | `title: string`                   |
| 햄버거 메뉴 | GlobalMenu 드로어 열기 (오른쪽) | `showMenu?: boolean` (기본: true) |
| 커스텀 액션 | 오른쪽 영역에 커스텀 버튼 추가  | `rightAction?: ReactNode`         |

### 사용 예시

```tsx
// 기본 사용
<AppBar title="정산 관리" />

// 뒤로가기 없이 (대시보드 등)
<AppBar title="홈" showBack={false} />

// 오른쪽에 커스텀 액션 추가
<AppBar title="공지 관리" rightAction={<button>...</button>} />

// 햄버거 메뉴 숨기기
<AppBar title="설정" showMenu={false} />
```

### 스타일 규격

| 속성        | 값                          |
| ----------- | --------------------------- |
| 높이        | 56px                        |
| 배경        | `#FFFFFF` (dark: `#1E2130`) |
| 하단 테두리 | 1px `#E5E7EB`               |
| 타이틀      | 16px SemiBold, 가운데 정렬  |
| 아이콘      | 24px, `#1F2937`             |

---

## 10. 참조 파일

| 파일            | 경로                                              | 설명            |
| --------------- | ------------------------------------------------- | --------------- |
| colors.dart     | `teamplus-app/lib/core/theme/colors.dart`         | 색상 정의       |
| app_theme.dart  | `teamplus-app/lib/core/theme/app_theme.dart`      | 테마 설정       |
| app_button.dart | `teamplus-app/lib/shared/widgets/app_button.dart` | 버튼 위젯       |
| app_card.dart   | `teamplus-app/lib/shared/widgets/app_card.dart`   | 카드 위젯       |
| app_input.dart  | `teamplus-app/lib/shared/widgets/app_input.dart`  | 입력 위젯       |
| AppBar.tsx      | `teamplus-web/src/components/layout/AppBar.tsx`   | 공통 앱바 (Web) |

---

**Document Version**: 1.4
**Applies To**: TEAMPLUS Flutter App, Web App
**Compliance**: WCAG 2.1 AA (아동 UI는 AAA)


---

**SOT v9.4 동기화 확인 (2026-05-23)** — 본 가이드는 현재 실측 환경에서 유효: Backend **72 module·81 controller·102 service·152 model·19 enum·773 routes** / Web **245 pages·71 hooks·352 컴포넌트·MESSAGES 200 keys** / Admin **86 pages** / App **211 dart·29 features·16 Bridge handlers** / **Home 13 pages 신규 인지**. 디자인 위반 0 유지(헤더 backdrop-blur 예외 1건).
