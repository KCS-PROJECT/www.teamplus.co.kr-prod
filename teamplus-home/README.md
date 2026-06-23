# TEAMPLUS Home — 공식 홍보 홈페이지

아이스하키 클럽 통합 관리 플랫폼 **TEAMPLUS** 의 공식 홍보·마케팅 사이트.

## 스택

- Next.js 15 (App Router) · React 19
- Tailwind CSS 3.4 · Framer Motion 11
- TypeScript 5.6
- 포트 **5010** (web 5001·admin 5002·backend 5003 과 충돌 방지)

## 개발

```bash
cd teamplus-home
npm install
npm run dev      # http://localhost:5010
```

## 빌드 & 배포

```bash
npm run build
npm run start
```

## 디렉토리

```
src/
├── app/                  # App Router 엔트리
│   ├── layout.tsx        # 루트 레이아웃 (헤더·푸터·메타데이터)
│   ├── page.tsx          # 메인 랜딩
│   ├── solution/         # 솔루션 소개
│   ├── features/         # 주요 기능
│   ├── pricing/          # 요금제
│   ├── cases/            # 도입 사례
│   ├── news/             # 공지·소식
│   └── contact/          # 문의·상담
├── components/
│   ├── layout/           # Header · Footer
│   ├── sections/         # Hero · Features · Pricing …
│   └── ui/               # Button · Card · GradientText …
└── lib/                  # utils · content data
```

## 디자인 원칙

1. **Dark-first** — 기본 다크 모드, 메쉬 그라디언트 + 노이즈 텍스처
2. **Bento Grid** — 주요 기능을 비정형 그리드로 배치
3. **Scroll Animation** — Framer Motion in-view 페이드업
4. **Micro-interaction** — 카드 hover 3D tilt, 버튼 magnetic 효과
5. **Typography-first** — Display 폰트 강조 (Pretendard)
6. **Accessibility** — WCAG AA · 키보드 포커스 · reduce-motion 대응
