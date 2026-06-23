/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    // lib: 동적으로 Tailwind 클래스 문자열을 반환하는 헬퍼 (calendar-colors 등)
    './src/lib/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // TEAMPLUS Design System - Primary Brand Colors
        primary: {
          DEFAULT: 'hsl(var(--ice-primary))',
          light: 'hsl(var(--ice-primary-light))',
          dark: 'hsl(var(--ice-primary-dark))',
          50: 'color-mix(in srgb, hsl(var(--ice-primary)) 8%, white)',
          100: 'color-mix(in srgb, hsl(var(--ice-primary)) 15%, white)',
          200: 'color-mix(in srgb, hsl(var(--ice-primary)) 25%, white)',
          300: 'color-mix(in srgb, hsl(var(--ice-primary)) 40%, white)',
          400: 'color-mix(in srgb, hsl(var(--ice-primary)) 60%, white)',
          500: 'hsl(var(--ice-primary))',
          600: 'color-mix(in srgb, hsl(var(--ice-primary)) 90%, black)',
          700: 'hsl(var(--ice-primary-dark))',
          800: 'color-mix(in srgb, hsl(var(--ice-primary)) 75%, black)',
          900: 'color-mix(in srgb, hsl(var(--ice-primary)) 60%, black)',
          950: 'color-mix(in srgb, hsl(var(--ice-primary)) 45%, black)',
        },
        // Background & Surface Colors
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        border: 'var(--color-border)',
        // Text Colors
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted': 'var(--color-text-muted)',
        // Semantic Colors
        success: {
          DEFAULT: 'hsl(var(--ice-success))',
          50: 'color-mix(in srgb, hsl(var(--ice-success)) 8%, white)',
          100: 'color-mix(in srgb, hsl(var(--ice-success)) 15%, white)',
          500: 'hsl(var(--ice-success))',
          600: 'color-mix(in srgb, hsl(var(--ice-success)) 90%, black)',
          700: 'color-mix(in srgb, hsl(var(--ice-success)) 80%, black)',
        },
        warning: {
          DEFAULT: 'hsl(var(--ice-warning))',
          50: 'color-mix(in srgb, hsl(var(--ice-warning)) 8%, white)',
          100: 'color-mix(in srgb, hsl(var(--ice-warning)) 15%, white)',
          500: 'hsl(var(--ice-warning))',
          600: 'color-mix(in srgb, hsl(var(--ice-warning)) 90%, black)',
          700: 'color-mix(in srgb, hsl(var(--ice-warning)) 80%, black)',
        },
        error: {
          DEFAULT: 'hsl(var(--ice-error))',
          50: 'color-mix(in srgb, hsl(var(--ice-error)) 8%, white)',
          100: 'color-mix(in srgb, hsl(var(--ice-error)) 15%, white)',
          500: 'hsl(var(--ice-error))',
          600: 'color-mix(in srgb, hsl(var(--ice-error)) 90%, black)',
          700: 'color-mix(in srgb, hsl(var(--ice-error)) 80%, black)',
        },
        // Chat Bubble Colors
        bubble: {
          in: '#f3f4f6',
          'in-dark': '#2d3342',
        },
        // Neutral Colors (Frost - kept for backward compatibility)
        frost: {
          50: 'hsl(var(--ice-slate-50))',
          100: 'hsl(var(--ice-slate-100))',
          200: 'hsl(var(--ice-slate-200))',
          300: 'hsl(var(--ice-slate-300))',
          400: 'hsl(var(--ice-slate-400))',
          500: 'hsl(var(--ice-slate-500))',
          600: 'hsl(var(--ice-slate-600))',
          700: 'hsl(var(--ice-slate-700))',
          800: 'hsl(var(--ice-slate-800))',
          900: 'hsl(var(--ice-slate-900))',
          950: 'hsl(222 47% 4%)',
        },
        // ─── TEAMPLUS Wallet v2 Tokens (신한pLay 풍 핀테크) ───────────────
        // Brand Primary - Ice Blue
        ice: {
          50:  '#eef4ff',
          100: '#dbe6ff',
          200: '#b8ccff',
          300: '#85a8ff',
          400: '#5a82ff',
          500: '#2f5fff', // PRIMARY
          600: '#1f47e6',
          700: '#1837b8',
          800: '#142c8f',
          900: '#0e1f66',
        },
        // Brand Secondary - Rink Navy (다크 카드, hero 표면)
        rink: {
          50:  '#eef0f5',
          100: '#d6dae5',
          300: '#8b95ad',
          500: '#4a5572',
          700: '#2a3247',
          800: '#1f2536',
          900: '#141826',
        },
        puck: '#0a0d14',
        // Accents - 활기, 에너지
        // 600/700: 라이트 배경 위 텍스트·버튼 대비 확보용 (WCAG AA) — 2026-05-30
        flame: { 100: '#ffe2da', 500: '#ff5a36', 600: '#cc3d1a', 700: '#a32f14' },
        mint:  { 100: '#cdf6eb', 500: '#00d4a8', 600: '#00a884', 700: '#00795f' },
        sun:   { 100: '#fff3cf', 500: '#ffc940' },
        // Wallet text & surface (semantic)
        wtext: {
          1: '#0a0d14',
          2: '#2a3247',
          3: '#6b7588',
          4: '#9aa4ba',
        },
        wbg:      '#f6f8fc',
        wsurface: '#ffffff',
        wline:    '#e5e9f2',
        'wline-2': '#eef1f7',
        // ─── 외부 서비스 브랜드 색 (소셜 로그인 / 결제 PG) ────────────
        // 외부 서비스의 공식 브랜드 색은 임의 hex 가 아닌 토큰으로 관리.
        // RULE-8 (DESIGN.md §2) 임의 hex 금지의 합법적 예외.
        brand: {
          kakao:         '#FEE500', // 카카오 로고 배경
          'kakao-hover': '#FDD800', // 카카오 hover dim
          'kakao-pay':   '#FAE100', // 카카오페이 (살짝 톤 다름)
          'kakao-text':  '#371D1E', // 카카오 라벨 텍스트
          'kakao-text-2':'#191919', // 카카오 보조 텍스트(쇼핑몰 결제)
          'kakao-text-3':'#181600', // 카카오 다크 텍스트(ShareSheet)
          naver:         '#03C75A',
          'naver-hover': '#02B350',
          samsung:       '#1428A0',
          line:          '#06C755',
          facebook:      '#1877F2',
        },
        // ─── QR 카메라 UI 전용 색 (Native Camera Scanner) ──────────────
        // 카메라 풀스크린/스캐닝 UI 는 검정 배경 + 그린 강조가 표준 (Android Camera2 가이드).
        // 디자인 토큰 ice-500 으로 대체할 수 없는 카테고리 → 별도 토큰화.
        qr: {
          bg:   '#0a0a0a', // 카메라 풀스크린 배경
          scan: '#3DDC84', // 코너 마커 / 스캔 라인 (Android Green)
        },
      },
      fontFamily: {
        // v18 (2026-05-22) — iOS WKWebView Pretendard OTF 로드 실패 시에도 한글 글리프
        //   보장을 위해 'Apple SD Gothic Neo' (iOS 9+ 기본 한글), 'Malgun Gothic' (Windows),
        //   'Noto Sans CJK KR' (Linux/Android) 를 fallback 체인에 명시.
        //   기존 '-apple-system' 은 한글 글리프를 제공하지 않아 tofu(?) 박스 회귀 발생.
        sans: [
          'Pretendard',
          '"Apple SD Gothic Neo"',
          'AppleSDGothicNeo-Regular',
          '"Malgun Gothic"',
          '"Noto Sans CJK KR"',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'sans-serif',
        ],
        // 숫자/금액 강조용. 외부 Inter CDN 고정 URL 404 방지를 위해 Pretendard 우선 사용.
        num: [
          'Pretendard',
          '"Apple SD Gothic Neo"',
          'AppleSDGothicNeo-Regular',
          '-apple-system',
          'BlinkMacSystemFont',
          'sans-serif',
        ],
      },
      fontSize: {
        // ─── 보통 한국 모바일 앱 (토스/카카오뱅크/카카오톡) 기준 정렬 (2026-05-11) ──
        //   기존 토큰이 같은 한국 앱 대비 약 1px 작아 보이는 문제를 보정.
        //   body 15→16 (Material body-large/iOS body 정렬), small 13→14, lh 동조 상향.
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        // ─── TEAMPLUS Wallet v2 Type Scale (모바일 최적) ─────────────────
        'w-caption':    ['12px', { lineHeight: '17px' }],
        'w-small':      ['14px', { lineHeight: '20px' }],
        'w-body':       ['16px', { lineHeight: '24px' }],
        'w-body-lg':    ['17px', { lineHeight: '26px' }],
        'w-title':      ['18px', { lineHeight: '26px' }],
        'w-h3':         ['22px', { lineHeight: '30px' }],
        'w-h2':         ['28px', { lineHeight: '36px' }],
        'w-h1':         ['34px', { lineHeight: '42px' }],
        'w-display':    ['44px', { lineHeight: '52px' }],
        'w-display-lg': ['64px', { lineHeight: '70px' }],

        // ─── Fluid 토큰 (해상도 적응 · 2026-04-30 추가 / 2026-05-11 상향) ─
        // clamp(min, viewport-relative, max) — 320px ~ 768px 범위에서 자동 스케일.
        // iPhone SE(320), Android(360-412), iPad mini(744-768) 한 토큰으로 일관 대응.
        // body min 14→15 / max 16→17 등 보통 앱 기준 정렬.
        'w-caption-fluid':    ['clamp(12px, 2.7vw, 13px)', { lineHeight: '1.45' }],
        'w-small-fluid':      ['clamp(13px, 3vw, 15px)',   { lineHeight: '1.45' }],
        'w-body-fluid':       ['clamp(15px, 3.4vw, 17px)', { lineHeight: '1.55' }],
        'w-body-lg-fluid':    ['clamp(16px, 3.6vw, 18px)', { lineHeight: '1.55' }],
        'w-title-fluid':      ['clamp(17px, 3.9vw, 20px)', { lineHeight: '1.4' }],
        'w-h3-fluid':         ['clamp(19px, 4.6vw, 24px)', { lineHeight: '1.3' }],
        'w-h2-fluid':         ['clamp(23px, 5.6vw, 30px)', { lineHeight: '1.25' }],
        'w-h1-fluid':         ['clamp(27px, 6.8vw, 38px)', { lineHeight: '1.2' }],
        'w-display-fluid':    ['clamp(34px, 9vw, 48px)',  { lineHeight: '1.1' }],
        'w-display-lg-fluid': ['clamp(48px, 13vw, 68px)', { lineHeight: '1.05' }],
      },
      boxShadow: {
        // TEAMPLUS Design System Shadows
        'card': '0 1px 3px rgba(0, 0, 0, 0.08)',
        'card-hover': '0 4px 12px rgba(0, 0, 0, 0.1)',
        'nav': '0 -1px 0 rgba(0, 0, 0, 0.05)',
        // Standard shadows
        'sm': '0 1px 2px rgba(0, 0, 0, 0.05)',
        'DEFAULT': '0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)',
        'md': '0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.06)',
        'lg': '0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05)',
        'xl': '0 20px 25px rgba(0, 0, 0, 0.1), 0 10px 10px rgba(0, 0, 0, 0.04)',
        // ─── TEAMPLUS Wallet v2 Shadows ─────────────────────────────────
        'sh-1': '0 1px 2px rgba(20, 24, 38, 0.04), 0 1px 3px rgba(20, 24, 38, 0.06)',
        'sh-2': '0 2px 6px rgba(20, 24, 38, 0.06), 0 4px 12px rgba(20, 24, 38, 0.05)',
        'sh-3': '0 8px 24px rgba(20, 24, 38, 0.08), 0 2px 6px rgba(20, 24, 38, 0.05)',
        'sh-4': '0 16px 40px rgba(20, 24, 38, 0.12), 0 4px 12px rgba(20, 24, 38, 0.06)',
        'sh-blue': '0 8px 24px rgba(47, 95, 255, 0.28)',
        'sh-rink': '0 8px 24px rgba(20, 24, 38, 0.32)',
      },
      animation: {
        'spin': 'spin 1s linear infinite',
        'spin-slow': 'spin 1.5s linear infinite',
        // v17 Anti-Flicker (SPEC §2.3, 2026-05-16) — useEffect setIsAnimated(true)
        //   setTimeout 토글을 CSS-only mount-time fade-in 으로 대체하기 위한 표준.
        //   사인 곡선 (cubic-bezier(0.45, 0, 0.55, 1)) + 200ms — 깜빡임 제거 + 즉답성.
        'fade-in': 'fade-in 200ms cubic-bezier(0.45, 0, 0.55, 1) both',
        'slide-up': 'slideUp 0.3s ease-out both',
        'slide-down': 'slideDown 0.3s ease-out both',
        'page-enter': 'pageEnter 0.25s ease-out both',
        'bounce': 'bounce 1s infinite',
        // TEAMPLUS Spinner Animations
        'bounce-dot': 'bounceDot 0.6s ease-in-out infinite',
        'navigation-progress': 'navigationProgress 1.5s ease-in-out infinite',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
        // TEAMPLUS BottomSheet Animations — 화면 바깥에서 자연스럽게 올라오는 시트
        'sheet-up': 'sheetUp 0.35s cubic-bezier(0.33, 1, 0.68, 1) both',
        'sheet-down': 'sheetDown 0.3s cubic-bezier(0.32, 0, 0.67, 0) both',
        'overlay-in': 'overlayIn 0.25s ease-out both',
        'overlay-out': 'overlayOut 0.2s ease-in both',
        // Modal/Popup body card 진입 — fade + scale (Material smooth-curve)
        // dim 은 overlay-in (opacity only), body 는 scale 0.94 → 1 + fade 로
        // 가벼운 zoom-in 인상 (iOS Sheet 패턴과 자연스럽게 호환)
        'modal-card-in': 'modalCardIn 0.28s cubic-bezier(0.22, 1, 0.36, 1) both',
        'modal-card-out': 'modalCardOut 0.2s cubic-bezier(0.4, 0, 1, 1) both',
        // BottomNav FAB 아이콘 교체 — iOS SF Symbols `.replace` 효과 재현
        // 교차 페이드: 옛 아이콘이 커지며 사라지고, 새 아이콘은 작게 시작해 정위치로
        // iOS/AOS 양쪽에서 자연스러운 ease-out-quint 커브로 통일
        'fab-icon-enter': 'fabIconEnter 300ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'fab-icon-exit':  'fabIconExit  200ms cubic-bezier(0.4, 0, 1, 1)    both',
        // FAB 자체 착륙감 — 슬라이드 종료 시 미세한 overshoot settle (damped spring)
        // 압축 dip 제거 → 순수 overshoot 형태로 AOS에서도 부드럽게 착지
        'fab-land': 'fabLand 420ms cubic-bezier(0.22, 1, 0.36, 1) both',
        // 아동 대시보드: 🏒 가 퍽을 쳐서 ⛸️ 로 갔다 돌아오는 왕복
        'puck-travel': 'puckTravel 2.8s cubic-bezier(0.45, 0, 0.55, 1) infinite',
        // ─── Phase 2 LoadingPuck (L1) — 점 인디케이터 / 퍽 떠오름 ─────
        // SoT 예외: SPEC §2.1 명시. LoadingPuck.tsx 단일 컴포넌트 한정.
        'loading-dot-pulse': 'loadingDotPulse 1.4s ease-in-out infinite',
        // v16 (2026-05-16 T9) — 모든 LoadingPuck 반복 keyframe easing 을
        //   `cubic-bezier(0.45, 0, 0.55, 1)` (사인 곡선 ease-in-out) 으로 통일.
        //   퍽 떠오름·그림자·호 길이가 같은 가감속 리듬을 공유해 시각적 동기화 강화.
        //   fill-mode `both` 명시 — 시작/종료 상태 유지로 첫/마지막 frame jitter 방지.
        //   회전(SMIL animateTransform — LoadingPuck.tsx 내부)은 일정 속도 보장을 위해
        //   별도로 `linear` (SVG SMIL 기본값) 유지.
        'puck-bob': 'puckBob 2.2s cubic-bezier(0.45, 0, 0.55, 1) infinite both',
        // 퍽 그림자 — 퍽 떠오름과 동기화하여 작아지고 옅어짐 (깊이감 강화)
        // 2026-05-16 v16: easing 통일 (사인 곡선)
        'puck-shadow': 'puckShadow 2.2s cubic-bezier(0.45, 0, 0.55, 1) infinite both',
        // 회전 호 길이 동적 변화 (Material indeterminate 패턴)
        // 2026-05-16 v16: easing 통일 (사인 곡선)
        'puck-arc': 'puckArc 2.8s cubic-bezier(0.45, 0, 0.55, 1) infinite both',
        // Phase 2 LoadingRing (L2) — 흰색 링 회전 (선택 keyframe)
        // 회전은 일정 속도 보장을 위해 linear 유지.
        // 2026-05-16 v16 T9: 2.4s → 1.4s (60fps 환경 시각적 부드러움 최적 1.2~1.5s 범위)
        'loading-ring-rotate': 'loadingRingRotate 1.4s linear infinite both',
        // ─── Phase 3 풀스크린 로딩 (2026-05-14 v10) — fade-in/out + 외곽 호흡 ─────
        // v17 anti-flicker (2026-05-16) — loading-overlay-in/out 애니메이션 정의 제거.
        // PageTransitionLoader 가 v17 부터 className 으로 미사용 (LoadingContext 인라인 transition 만 사용).
        // SoT: SPEC_ANTI_FLICKER.md §2.1
        // halo-pulse — 외곽 호흡 (반복) 도 사인 곡선 통일.
        'loading-halo-pulse': 'loadingHaloPulse 2.8s cubic-bezier(0.45, 0, 0.55, 1) infinite both',
      },
      keyframes: {
        // v17 Anti-Flicker (SPEC §2.3, 2026-05-16) — kebab-case 'fade-in' 으로 통일.
        //   Tailwind animation 'fade-in' (200ms cubic-bezier(0.45, 0, 0.55, 1) both) 의
        //   keyframe 정의. 기존 camelCase fadeIn 은 이 keyframe 으로 통합.
        //   ※ globals.css 의 @keyframes fadeIn 은 별도 CSS 정의로 ClassForm 의
        //     `animate-[fadeIn_200ms_ease-out]` arbitrary syntax 가 그대로 동작.
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-100%)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pageEnter: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        bounce: {
          '0%, 100%': { transform: 'translateY(-10%)' },
          '50%': { transform: 'translateY(0)' },
        },
        // TEAMPLUS Spinner Keyframes
        bounceDot: {
          '0%, 100%': { transform: 'translateY(0)', opacity: '0.5' },
          '50%': { transform: 'translateY(-50%)', opacity: '1' },
        },
        navigationProgress: {
          '0%': { width: '0%', marginLeft: '0%' },
          '50%': { width: '40%', marginLeft: '30%' },
          '100%': { width: '0%', marginLeft: '100%' },
        },
        pulseSubtle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        // TEAMPLUS BottomSheet Keyframes
        sheetUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        sheetDown: {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(100%)' },
        },
        overlayIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        overlayOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        // Modal/Popup body card 진입 — opacity 0 + scale 0.94 → 1
        // translate-y 0 으로 카드 위치 고정 (Sheet 패턴과 분리)
        modalCardIn: {
          '0%':   { opacity: '0', transform: 'scale(0.94)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        modalCardOut: {
          '0%':   { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.94)' },
        },
        // SF Symbols `.replace(.upUp)` — 새 아이콘이 작게 등장해 스케일 업
        // 초기 scale 0.7(이전 0.55 대비 덜 극적) + 살짝만 오버슈트(1.04)
        fabIconEnter: {
          '0%':   { opacity: '0', transform: 'scale(0.7)' },
          '55%':  { opacity: '1', transform: 'scale(1.04)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        // SF Symbols `.replace(.downUp)` — 옛 아이콘이 커지며 페이드 아웃
        fabIconExit: {
          '0%':   { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(1.22)' },
        },
        // FAB 착륙 — 순수 overshoot settle (압축 dip 제거)
        // 1.0 → 1.03 → 1.0 damped spring. 눌림(0.96) 없이 "부드럽게 도착" 체감
        // iOS UIView.animate(spring) / AOS SpringInterpolator 양쪽 매칭
        fabLand: {
          '0%':   { transform: 'scale(0.96)' },
          '50%':  { transform: 'scale(1.03)' },
          '100%': { transform: 'scale(1)' },
        },
        // 아동 대시보드 퍽 왕복 — 🏒 타격 → ⛸️ 바운스 → 복귀
        // 8%: 🏒 가 퍽을 치는 순간 squish(가로압축)
        // 42%: ⛸️ 방향으로 180px 좌측 이동 완료
        // 48%: ⛸️ 에 맞고 bounce(세로압축)
        // 92%: 🏒 자리로 복귀
        // (scale() 가 transform 전체를 오버라이드하므로 각 키프레임에 translateX 명시)
        puckTravel: {
          '0%':   { transform: 'translateX(0) scaleX(1) scaleY(1)' },
          '8%':   { transform: 'translateX(-10px) scaleX(0.85) scaleY(1.12)' },
          '42%':  { transform: 'translateX(-180px) scaleX(1) scaleY(1)' },
          '48%':  { transform: 'translateX(-180px) scaleX(1.18) scaleY(0.88)' },
          '55%':  { transform: 'translateX(-180px) scaleX(1) scaleY(1)' },
          '92%':  { transform: 'translateX(0) scaleX(1) scaleY(1)' },
          '100%': { transform: 'translateX(0) scaleX(1) scaleY(1)' },
        },
        // ─── Phase 2 LoadingPuck (L1) Keyframes ───────────────────────
        // 점 인디케이터: 0.3 → 1 → 0.3 (40% 시점에 최대)
        loadingDotPulse: {
          '0%, 80%, 100%': { opacity: '0.3', transform: 'scale(0.85)' },
          '40%':           { opacity: '1',   transform: 'scale(1)' },
        },
        // 퍽 떠오름 (2026-05-08 v2): -10px → -8px 미세 조정 + sine-wave easing 적용
        //   (left:50% 위치 보정 위해 translateX(-50%) 포함 — 키프레임이 baseline transform 를 덮어쓰기 때문)
        //   3-step 으로 변경 (25%/50%/75% 보간점 추가) → 정점 머무름 완전 제거 + 부드러운 호 곡선
        puckBob: {
          '0%, 100%': { transform: 'translateX(-50%) translateY(0)' },
          '50%':      { transform: 'translateX(-50%) translateY(-8px)' },
        },
        // 퍽 그림자 — 퍽이 떠오를 때 작아지고 옅어져 깊이감 강화 (v2: 0.55 → 0.65 자연스러움)
        puckShadow: {
          '0%, 100%': { transform: 'translateX(-50%) scaleX(1)',    opacity: '0.85' },
          '50%':      { transform: 'translateX(-50%) scaleX(0.65)', opacity: '0.45' },
        },
        // 2026-05-09 v5: 회전 호 길이/오프셋 동기 변동 (Material indeterminate 패턴)
        // r=40 원 둘레 = 2π × 40 ≈ 251.33
        // 0%   짧은 호(20)  ─ 시작
        // 50%  긴 호(120)   ─ 정점, 살짝 dashoffset 진행
        // 100% 짧은 호로 복귀 + dashoffset 끝까지 진행 → 호의 trailing edge 가 회전감 강화
        // animate-spin(1s linear) 과 다른 cycle(1.4s) 조합으로 위상이 어긋나며 풍부한 모션 생성
        puckArc: {
          '0%':   { strokeDasharray: '20 251', strokeDashoffset: '0' },
          '50%':  { strokeDasharray: '120 251', strokeDashoffset: '-30' },
          '100%': { strokeDasharray: '20 251', strokeDashoffset: '-220' },
        },
        // ─── Phase 2 LoadingRing (L2) Keyframes (선택) ───────────────
        // SVG 회전 — animate-spin 보다 느린 속도 필요 시 사용
        loadingRingRotate: {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        // ─── Phase 3 풀스크린 로딩 Keyframes (2026-05-14 v10) ────────────────────
        // GPU 친화: transform/opacity 만 사용 (top/left/width/height 변동 금지)
        // v17 Anti-Flicker (SPEC §3, 2026-05-16) — wrapper fade-in 자체는 LoadingContext
        //   PageTransitionLoader 에서 제거되었음.
        //   v17 anti-flicker (2026-05-16) — loadingOverlayIn/Out keyframe 도 제거.
        //   SoT: SPEC_ANTI_FLICKER.md §2.1
        loadingHaloPulse: {
          '0%, 100%': { transform: 'scale(0.96)', opacity: '0.30' },
          '50%':      { transform: 'scale(1.06)', opacity: '0.55' },
        },
      },
      // iOS 네이티브 느낌의 transition 커브 (Drawer/Sheet/Modal 공용)
      //  - ios         : iOS 7+ Sheet present — spring-out 형태 (drawer 열림)
      //  - ios-out     : Material/ios dismiss 표준 ease-out (drawer 닫힘)
      //  - ios-in-out  : 양방향 대칭 ease (페이지 전환용)
      transitionTimingFunction: {
        // iOS UINavigationController / UITabBar 표준 deceleration
        // SwiftUI .animation(.easeOut) 동등. Apple HIG 공식 권장 커브.
        ios: 'cubic-bezier(0.32, 0.72, 0, 1)',
        'ios-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'ios-in-out': 'cubic-bezier(0.42, 0, 0.58, 1)',
        // BottomNav 전용 alias → Apple 공식 ios 커브 참조.
        // 바운스 0, 빠른 시작 → 부드러운 착지 (UITabBar 인디케이터 그대로).
        'ios-glide': 'cubic-bezier(0.32, 0.72, 0, 1)',
        // iOS/AOS 공용 smooth damped-spring — ease-out-quint 변형.
        // BottomNav 슬라이딩에 최적: 초반 빠른 진입 + 꼬리 완만 감속 → WebView jank 최소
        'ios-spring': 'cubic-bezier(0.22, 1, 0.36, 1)',
        // ─── TEAMPLUS Wallet v2 ease ────────────────────────────────────
        'wallet': 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      // iOS 네이티브 드로어 표준 duration — 300ms 는 다소 촉박, 500ms 는 굼떠 보임
      transitionDuration: {
        400: '400ms',
        450: '450ms',
      },
      borderRadius: {
        '4xl': '2rem',
        // ─── TEAMPLUS Wallet v2 Radius ─────────────────────────────────
        'w-xs':   '4px',
        'w-sm':   '8px',
        'w-md':   '12px',
        'w-lg':   '16px',  // 카드 표준
        'w-xl':   '20px',  // 큰 카드
        'w-2xl':  '28px',  // 시트, 다이얼로그
        'w-pill': '999px',
      },
      spacing: {
        // TEAMPLUS 공통 하단 간격 — MobileContainer 내부 main 영역 공통 패딩
        // BottomNav(72px) + 추가 시각적 여유(48px) = 120px (7.5rem)
        '30': '7.5rem',
      },
      // ─── z-index SoT (2026-05-16) — 모든 레이어의 단일 출처 ──────────
      // AppBar(30) / BottomNav(40) / FAB(45) / Toast(60) /
      // Overlay base(9990) / Modal-Sheet(9991) / Popup(9992) / Critical(9999)
      // SPEC: docs/Planning/SPEC_POPUP_FULLSCREEN_DIM.md
      zIndex: {
        'appbar': '30',
        'bottomnav': '40',
        'fab': '45',
        'toast': '60',
        'overlay-base': '9990',     // dim 배경
        'overlay-modal': '9991',    // Modal 본체
        'overlay-sheet': '9991',    // BottomSheet 본체
        'overlay-popup': '9992',    // Popup (EventPopup 등)
        'overlay-critical': '9999', // 시스템 알림 / LoadingPuck
      },
    },
  },
  plugins: [],
};
