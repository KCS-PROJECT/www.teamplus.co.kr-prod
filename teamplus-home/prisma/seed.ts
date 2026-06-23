/**
 * TEAMPLUS Home — 공지 게시판 초기 시드
 *
 * 기존 홍보 페이지에 하드코딩되어 있던 NEWS 4건을 DB 로 이관.
 * 빈 DB 일 때만 삽입 · 이미 데이터가 있으면 건너뜀 (idempotent)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SEED_NOTICES = [
  {
    title: 'v8.5 — API Lifecycle 4-플랫폼 통합 · 1초 SLA 성능 세트 배포',
    category: 'Release',
    summary:
      'gzip · keep-alive · ETag · Redis 캐시 · Prisma pool 25 확장으로 전 플랫폼 API 응답을 1초 이내로 단축했습니다.',
    content: `TEAMPLUS v8.5 에서 백엔드 · 웹 · 어드민 · 앱 4개 플랫폼의 API Lifecycle 이 하나의 표준으로 통합되었습니다.

주요 개선 사항
- gzip compression 도입으로 응답 크기 평균 85% 감소 (실측)
- HTTP keep-alive 65초 · Weak ETag · Redis 캐시 레이어 추가
- Prisma connection_limit 10 → 25 확장
- Flutter 타임아웃 30s → 5/10/15s 세분화

목표 SLA: 1초 이내 응답률 99% 유지.`,
    pinned: true,
  },
  {
    title: '팀 운영 DB · 로스터 · 매치 풀스택 구현 완료',
    category: 'Feature',
    summary:
      'Team / TeamRoster 모델 + 13개 엔드포인트 + E2E 테스트 + 64개 유닛 테스트까지 완비되어 팀 단위 대회 운영이 한층 강력해졌습니다.',
    content: `팀(Team) 단위의 대회 운영을 위한 풀스택 구현이 완료되었습니다.

- Team / TeamRoster 두 개의 Prisma 모델 신규
- 13개 REST 엔드포인트 (CRUD · 로스터 · 매치 연동)
- Playwright E2E 테스트 1건 신규
- 유닛 테스트 64건 신규
- 운영 DB 메뉴에서 바로 생성 · 편집 가능`,
  },
  {
    title: '아카데미 프로모션 · 해외원정 관리 모듈 오픈',
    category: 'Notice',
    summary:
      '클럽 아카데미 홍보 페이지와 해외 원정 일정 관리가 기본 제공됩니다. 관리자 대시보드에서 바로 생성하세요.',
    content: `TEAMPLUS 의 핵심 모듈 2종이 새롭게 추가되었습니다.

1) 아카데미 프로모션
  - 클럽별 아카데미 홍보 페이지 자동 생성
  - 기간 · 대상 · 가격 · 신청 폼 연동

2) 해외 원정 관리
  - 국제 대회 · 캠프 스케줄 관리
  - 참가자 여권 · 항공권 · 숙소 일괄 관리

관리자 대시보드 > 콘텐츠 메뉴에서 즉시 사용할 수 있습니다.`,
  },
  {
    title: '카카오 Alimtalk Partner 공식 인증 완료',
    category: 'Partner',
    summary:
      'TEAMPLUS 이 카카오 비즈니스 공식 파트너로 등록되었습니다. 기본 5개 템플릿 사전 승인 + 커스텀 대행 서비스 개시.',
    content: `TEAMPLUS 이 카카오 비즈니스 공식 Alimtalk Partner 로 등록되었습니다.

사전 승인된 기본 템플릿 5종
- 결제 완료 · 승인 완료 · 수업 생성 · 출석 리마인더 · 수업 취소

추가 서비스
- 커스텀 알림톡 템플릿 승인 대행
- Redis 큐 기반 재시도 · SMS 자동 폴백
- 조용한 시간(7PM~7AM) 일괄 설정 지원`,
  },
];

async function main() {
  const existing = await prisma.notice.count();
  if (existing > 0) {
    console.log(`[seed] 이미 ${existing}건의 공지가 있습니다 — 스킵`);
    return;
  }

  for (const n of SEED_NOTICES) {
    await prisma.notice.create({ data: n });
  }
  console.log(`[seed] ${SEED_NOTICES.length}건의 공지 삽입 완료`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
