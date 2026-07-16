-- [2026-07-16] 랜딩 블로그(BlogPost) 초기 데이터 시드 — 개발에서 등록한 6건을 운영 DB로 이관.
--   · 개발 로컬 DB(teamplus_db)에서 추출한 6건(PUBLISHED 5 + DRAFT 1) 원본 그대로.
--   · teamplus-admin(일반관리 ▸ 블로그 관리) 등록분 → teamplus-home 랜딩 /blog 공개 노출용.
--   · content 는 admin 저장 시 백엔드 sanitizeBlogHtml 로 이미 살균된 HTML.
--   · authorId 는 NULL — 개발 계정 id(운영 미존재) 참조를 피함. BlogPost.authorId 는 nullable·FK 없음.
--   · publishedAt/createdAt/updatedAt 은 원본 유지(UTC). DRAFT(c2892ca4)는 publishedAt=NULL.
--   · 멱등: ON CONFLICT (slug) DO NOTHING — 재실행/기존행 존재 시 무시(덮어쓰지 않음).
--   · 비한정 식별자 — manual-migrations 컨벤션(search_path=연결 스키마). 로컬(public)/원격(icehockey) 양쪽 안전.
--   · 선행 조건: 20260714_add_blog_posts.sql (테이블/enum 생성). 파일명 정렬상 이 파일이 뒤에 적용됨.

INSERT INTO "blog_posts"
  ("id", "slug", "title", "summary", "content", "category", "coverImageUrl",
   "status", "pinned", "viewCount", "publishedAt", "authorId", "createdAt", "updatedAt")
VALUES
  ($blog$cmrker48900076j7sdn5xs96k$blog$, $blog$2026-dfd00a2c$blog$, $blog$팀플러스+ 2026 봄 시즌 정식 오픈$blog$, $blog$QR 출석·수업권·성장기록을 한 앱에서. 봄 시즌 신규 클럽 도입 안내드립니다.$blog$, $blog$<h2>봄 시즌이 열립니다</h2><p>팀플러스+ 가 <strong>2026 봄 시즌</strong> 정식 오픈했습니다. 수업 일정, QR 출석, 수업권 결제, 성장 기록까지 학부모와 코치가 한곳에서 확인합니다.</p><h3>이번 시즌 핵심</h3><ul><li>QR 출석 자동 기록</li><li>카카오 알림톡 연동</li><li>역할별 맞춤 화면</li></ul>$blog$, $blog$NEWS$blog$::"BlogCategory", NULL, $blog$PUBLISHED$blog$::"BlogStatus", true, 4, '2026-07-14T17:47:16.521Z'::timestamptz, NULL, '2026-07-14T17:47:16.521Z'::timestamptz, '2026-07-14T18:00:41.546Z'::timestamptz),
  ($blog$cmrker48l00086j7s1jyy2rvh$blog$, $blog$qr-1d778079$blog$, $blog$우리 클럽에 QR 출석을 도입하는 방법$blog$, $blog$코치가 QR을 생성하고 학부모·선수가 스캔하면 끝. 5분이면 세팅됩니다.$blog$, $blog$<h2>QR 출석, 이렇게 시작하세요</h2><p>복잡한 장비 없이 스마트폰만 있으면 됩니다.</p><h3>3단계</h3><ol><li>코치가 수업에서 QR 생성(5분 유효)</li><li>학부모·선수가 앱으로 스캔</li><li>출석과 수업권 차감이 자동 기록</li></ol><blockquote>출결 누락과 수기 정산 스트레스를 줄여줍니다.</blockquote>$blog$, $blog$GUIDE$blog$::"BlogCategory", NULL, $blog$PUBLISHED$blog$::"BlogStatus", false, 0, '2026-07-14T17:47:16.533Z'::timestamptz, NULL, '2026-07-14T17:47:16.533Z'::timestamptz, '2026-07-14T17:47:16.533Z'::timestamptz),
  ($blog$cmrker48r00096j7szpsabhjr$blog$, $blog$c2892ca4$blog$, $blog$[내부 검토중] 여름 캠프 이벤트 초안$blog$, $blog$아직 공개 전 임시저장 글입니다.$blog$, $blog$<p>여름 캠프 상세는 확정 후 공개됩니다.</p>$blog$, $blog$EVENT$blog$::"BlogCategory", NULL, $blog$DRAFT$blog$::"BlogStatus", false, 0, NULL, NULL, '2026-07-14T17:47:16.540Z'::timestamptz, '2026-07-14T17:47:16.540Z'::timestamptz),
  ($blog$cmrkf5w07000l6j7s03fbkblw$blog$, $blog$5-68af60a1$blog$, $blog$수업권 결제, 학부모가 가장 자주 묻는 질문 5가지$blog$, $blog$환불·양도·유효기간까지. 결제 전 꼭 확인하는 항목을 정리했습니다.$blog$, $blog$<h2>결제 전 체크리스트</h2><p>수업권 구매 전 자주 묻는 항목을 모았습니다.</p><ul><li>유효기간과 연장</li><li>환불 규정</li><li>형제 양도 가능 여부</li></ul>$blog$, $blog$GUIDE$blog$::"BlogCategory", NULL, $blog$PUBLISHED$blog$::"BlogStatus", false, 0, '2026-07-14T17:58:45.702Z'::timestamptz, NULL, '2026-07-14T17:58:45.703Z'::timestamptz, '2026-07-14T17:58:45.703Z'::timestamptz),
  ($blog$cmrkf5w0n000m6j7sng2rimfq$blog$, $blog$2026-27ab5284$blog$, $blog$2026 유소년 아이스하키 리그 일정 안내$blog$, $blog$봄·여름 리그 일정과 참가 신청 방법을 안내드립니다.$blog$, $blog$<h2>리그 일정</h2><p>올해 유소년 리그가 확대 운영됩니다.</p><h3>신청 방법</h3><p>앱에서 대회 메뉴로 신청하세요.</p>$blog$, $blog$EVENT$blog$::"BlogCategory", NULL, $blog$PUBLISHED$blog$::"BlogStatus", false, 0, '2026-07-14T17:58:45.719Z'::timestamptz, NULL, '2026-07-14T17:58:45.719Z'::timestamptz, '2026-07-14T17:58:45.719Z'::timestamptz),
  ($blog$cmrkf5w0v000n6j7st43k3dp8$blog$, $blog$a051b758$blog$, $blog$팀플러스+, 카카오 알림톡 정식 연동 완료$blog$, $blog$출석·결제·공지 알림을 카카오톡으로 받아보세요.$blog$, $blog$<h2>알림톡 연동</h2><p>이제 중요한 알림을 카카오톡으로 안정적으로 받습니다.</p>$blog$, $blog$PRESS$blog$::"BlogCategory", NULL, $blog$PUBLISHED$blog$::"BlogStatus", false, 0, '2026-07-14T17:58:45.727Z'::timestamptz, NULL, '2026-07-14T17:58:45.728Z'::timestamptz, '2026-07-14T17:58:45.728Z'::timestamptz)
ON CONFLICT ("slug") DO NOTHING;
