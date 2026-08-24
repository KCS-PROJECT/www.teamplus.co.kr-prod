/**
 * migrate-team-notices.ts — 팀 공지 SystemNotice → TeamPost 이관 (unit-notice Phase 2)
 *
 * ▸ 계약 SoT
 *   claudedocs/unit-notice-stream-design-2026-08-19.md §3.2 (v1.2.4 동결)
 *   - id 보존 (SystemNotice.id → TeamPost.id) — 구 linkUrl·DailyViewLog·딥링크 재매핑 회피
 *   - 원본 행은 삭제하지 않는다 (롤백 안전망 — 정리는 Phase 3)
 *   - 기본값 이탈 판정 검출 시 즉시 중단·보고 (서비스 공지 전용 필드를 쓰는 행은 이관 불가)
 *   - NoticeRead → TeamPostRead (readAt 보존) · NoticeComment → TeamPostComment (id·시각 보존)
 *   - commentCount = 이관 댓글 수 · likeCount = 0 · updatedAt = 원본 createdAt 보존
 *   - createdBy null/유령 행은 Team.coachId(팀 감독)로 지정하고 결정 내역을 출력에 기록
 *
 * ▸ 운영 runbook (Codex P2-R2 C01 — §3 고정 순서 "쓰기 중지"의 실행 절차)
 *   ① **점검 모드 ON** — 어드민(app-management)에서 점검 공지(maintenance) 게시.
 *      앱 전체가 차단되어 구 팀 공지(SystemNotice)와 신규(TeamPost) **양쪽의 쓰기·조회가
 *      실제로 정지**된다. 봉인 코드(400)만으로는 배포 전 창이 남으므로 점검이 SoT.
 *   ② Phase 2 코드 배포 (구 팀 공지 쓰기 400 봉인 + 소비처 전환 포함)
 *   ③ 본 스크립트 `--apply --rewrite-links` 실행 — 기본 gate 가 **점검 공지 활성을 DB 에서
 *      직접 검증**한다 (쓰기 중지의 증명). 검증 실패 시 트랜잭션 자동 롤백.
 *   ④ 출력의 전건 대조표 PASS 확인 → 점검 모드 OFF (= 신규 쓰기 재개)
 *   자동 gate 3중:
 *   (a) `--require-maintenance`(기본 ON) — 점검 공지가 게시 중이 아니면 실행을 거부한다.
 *   (b) [Codex P2-R3 C01] 이관 트랜잭션 최상단에서 원본 3테이블(system_notices·
 *       notice_reads·notice_comments)에 `LOCK TABLE … IN SHARE MODE` — 커밋까지 다른
 *       커넥션의 INSERT/UPDATE/DELETE 를 **PostgreSQL 이 물리적으로 차단**한다(읽기는
 *       허용 — 서비스 공지 조회 무영향). 열린 앱·직접 API·rolling 중 구 인스턴스가
 *       무엇을 하든 이관 중 원본 변경은 불가능하다.
 *   (c) 락 획득 후 원본 전 행(공지·읽음·댓글) **fingerprint 재대조** — 시작 스냅샷과
 *       한 행이라도 다르면(in-place 수정·동수 삭제/생성 포함) 전체 롤백. 락 이전
 *       변경은 (c)가 검출하고 락 이후는 (b)가 차단하므로 커밋 시점까지 보장이 닫힌다.
 *   DEV 리허설은 `--allow-live` 로 (a)만 우회할 수 있다 (경고 출력 · (b)(c) 는 항상 활성).
 *
 * ▸ 멱등성 (점검 창 전제 — Codex P2-R2 H01)
 *   점검 창에서는 원본도 flat 도 변하지 않으므로 재실행 = 성공 후 동일 상태의 재검증
 *   또는 실패(전체 롤백) 후 재시도뿐이다. 따라서 기이관 판정은 **전 콘텐츠 필드
 *   fingerprint**(title·content·시각·게시기간·pinned·isActive·viewCount·commentCount·
 *   updatedAt=원본 createdAt)로 확증하고, 읽음·댓글도 전필드 일치를 요구한다 —
 *   불일치는 "flat 진화"가 아니라 손상/충돌이므로 중단한다. (이전 판의 "가변 필드
 *   진화 허용"은 점검 창 밖 실행을 전제한 오류였고, 실제로 R1 스크립트가 남긴
 *   updatedAt 오염을 은닉했다 — Codex R2 실측 지적으로 폐기)
 *   ⚠️ prisma/manual-migrations/ 에 두지 않는 이유: apply-all.sh 가 매 배포 재실행하는
 *   경로라 데이터 이관(one-shot) 혼입 금지 — 스키마 DDL 전용 (환불 스트림 교훈).
 *
 * ▸ 사용법 (teamplus-backend 디렉토리에서 실행 — DATABASE_URL 대상)
 *   npx tsx scripts/migrate-team-notices.ts                          # dry-run (변경 없음)
 *   npx tsx scripts/migrate-team-notices.ts --apply --rewrite-links  # 운영 (점검 gate)
 *   npx tsx scripts/migrate-team-notices.ts --apply --allow-live     # DEV 리허설
 */
import "dotenv/config";
import { PrismaClient, Prisma, SystemNotice } from "@prisma/client";
import {
  commentFingerprint,
  noticeFingerprint,
  readFingerprint,
} from "./migrate-team-notices.fingerprint";

const prisma = new PrismaClient();

interface Args {
  apply: boolean;
  rewriteLinks: boolean;
  allowLive: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  return {
    apply: argv.includes("--apply"),
    rewriteLinks: argv.includes("--rewrite-links"),
    allowLive: argv.includes("--allow-live"),
  };
}

/** §3.2 동결 판정식 — 서비스 공지 전용 필드 사용 행은 이관 대상이 아니다 (검출 시 전체 중단) */
function deviationReasons(n: {
  targetType: string | null;
  priority: number;
  targetBirthYearFrom: number | null;
  targetBirthYearTo: number | null;
  displayLocationsJson: Prisma.JsonValue;
  maintenanceReason: string | null;
}): string[] {
  const reasons: string[] = [];
  if (n.targetType !== null && n.targetType !== "all") {
    reasons.push(`targetType=${n.targetType}`);
  }
  if (n.priority !== 0) reasons.push(`priority=${n.priority}`);
  if (n.targetBirthYearFrom !== null || n.targetBirthYearTo !== null) {
    reasons.push(
      `학년타깃=${n.targetBirthYearFrom ?? ""}~${n.targetBirthYearTo ?? ""}`,
    );
  }
  if (JSON.stringify(n.displayLocationsJson) !== "[]") {
    reasons.push(`displayLocations=${JSON.stringify(n.displayLocationsJson)}`);
  }
  if (n.maintenanceReason !== null) reasons.push("maintenanceReason 존재");
  return reasons;
}

// fingerprint 함수는 spec 회귀 고정을 위해 분리 — [Codex P2-R4 C01]
// noticeFingerprint 는 사전검사 B 의 판정 필드(서비스 전용 4필드)까지 포함한다.

function fail(lines: string[]): never {
  for (const line of lines) console.error(line);
  process.exit(1);
}

const ts = (d: Date | null | undefined) => d?.getTime() ?? null;

async function main() {
  const { apply, rewriteLinks, allowLive } = parseArgs();
  console.log(
    `[migrate-team-notices] 모드: ${apply ? "APPLY" : "DRY-RUN"}` +
      (rewriteLinks ? " + rewrite-links" : "") +
      (allowLive ? " + allow-live" : ""),
  );

  // ── 0. [Codex P2-R2 C01] 쓰기 중지 증명 gate — 점검 공지 활성 검사 ──
  //    app-management 의 점검 판정과 동일 조건 (전역·maintenance·게시 중).
  if (apply) {
    const now = new Date();
    const maintenance = await prisma.systemNotice.findFirst({
      where: {
        targetType: "maintenance",
        targetTeamId: null,
        isActive: true,
        startAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      select: { id: true, title: true },
    });
    if (!maintenance && !allowLive) {
      fail([
        "[중단] 점검 모드가 아닙니다 — 쓰기 중지가 보장되지 않아 이관을 거부합니다.",
        "  runbook: ①점검 공지 게시(ON) → ②Phase 2 배포 → ③본 스크립트 → ④점검 OFF",
        "  (DEV 리허설 한정: --allow-live 로 이 gate 만 우회 — fingerprint gate 는 유지)",
      ]);
    }
    if (maintenance) {
      console.log(`[gate] 점검 공지 활성 확인: "${maintenance.title}"`);
    } else {
      console.warn(
        "[gate] --allow-live — 점검 gate 우회 (DEV 리허설 전용). " +
          "이관 중 쓰기가 발생하면 fingerprint gate 가 전체 롤백시킨다.",
      );
    }
  }

  // ── 1. 이관 후보 로드 (시작 스냅샷 — fingerprint gate 의 기준) ──────
  const notices = await prisma.systemNotice.findMany({
    where: { targetTeamId: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  if (notices.length === 0) {
    console.log("[사전검사] 이관 대상 팀 공지 0건 — 종료");
    return;
  }
  const startFingerprints = new Map(
    notices.map((n) => [n.id, noticeFingerprint(n)]),
  );
  console.log(`[사전검사] 이관 후보: 팀 공지 ${notices.length}건`);

  // ── 2. 사전검사 A — 고아 공지 분류 (A안: 삭제된 팀의 공지는 이관 제외) ──
  //    TeamPost.teamId 는 FK RESTRICT 라 유령 팀 행은 이관이 물리적으로 불가하고
  //    팀이 없어 열람자·수신자도 0 — skip 후 원본은 Phase 3 레거시 정리 대상.
  const teamIds = [...new Set(notices.map((n) => n.targetTeamId!))];
  const teams = await prisma.team.findMany({
    where: { id: { in: teamIds } },
    select: { id: true, coachId: true, name: true },
  });
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const orphans = notices.filter((n) => !teamById.has(n.targetTeamId!));
  const migratable = notices.filter((n) => teamById.has(n.targetTeamId!));
  if (orphans.length > 0) {
    console.log(
      `[사전검사 A] 고아 공지 ${orphans.length}건 skip (유령 팀 ${teamIds.length - teams.length}개 — Phase 3 정리 대상):`,
    );
    for (const o of orphans) {
      console.log(`  - ${o.id} "${o.title}" (team=${o.targetTeamId})`);
    }
  } else {
    console.log("[사전검사 A] 고아 공지 0건");
  }
  if (migratable.length === 0) {
    console.log("[사전검사] 이관 가능한 공지 0건 — 종료");
    return;
  }
  const migratableIds = migratable.map((n) => n.id);
  const migratableIdSet = new Set(migratableIds);

  // ── 3. 사전검사 B — 기본값 이탈 + 비공개 원본 판정 (검출 시 중단) ──
  const deviants = migratable
    .map((n) => ({ id: n.id, title: n.title, reasons: deviationReasons(n) }))
    .filter((d) => d.reasons.length > 0);
  if (deviants.length > 0) {
    fail([
      `[중단] 기본값 이탈 ${deviants.length}건 — 이관 불가:`,
      ...deviants.map(
        (d) => `  - ${d.id} "${d.title}" → ${d.reasons.join(", ")}`,
      ),
    ]);
  }
  // [Codex P2-R1-H02] SystemNotice.isActive=false 는 "재게시 가능한 비공개"지만
  //   TeamPost 에서는 soft-delete 로 해석되어 관리·재게시가 불가능해진다.
  //   현 데이터 실측 0건 — 검출되면 사람이 처리 방침을 결정할 때까지 중단.
  const inactive = migratable.filter((n) => !n.isActive);
  if (inactive.length > 0) {
    fail([
      `[중단] 비공개(isActive=false) 원본 ${inactive.length}건 — TeamPost 에서는`,
      "  soft-delete 로 해석되어 재게시가 불가능해진다. 처리 방침(재게시 후 이관 /",
      "  원본 유지·이관 제외 등)을 결정한 뒤 다시 실행할 것:",
      ...inactive.map((n) => `  - ${n.id} "${n.title}"`),
    ]);
  }
  console.log("[사전검사 B] 기본값 이탈 0건 · 비공개 원본 0건 — 통과");

  // ── 4. 사전검사 D — authorId 해석 (createdBy 검증 · 유령/누락은 팀 감독 폴백) ──
  const createdByIds = [
    ...new Set(
      migratable.map((n) => n.createdBy).filter((v): v is string => !!v),
    ),
  ];
  const users = await prisma.user.findMany({
    where: { id: { in: createdByIds } },
    select: { id: true },
  });
  const validUserIds = new Set(users.map((u) => u.id));
  const authorResolutions: string[] = [];
  const resolveAuthor = (n: SystemNotice): string | null => {
    if (n.createdBy && validUserIds.has(n.createdBy)) return n.createdBy;
    const team = teamById.get(n.targetTeamId!);
    if (!team) return null;
    authorResolutions.push(
      `  - ${n.id} "${n.title}": createdBy=${n.createdBy ?? "null"} → 팀 감독 ${team.coachId} (${team.name})`,
    );
    return team.coachId;
  };
  const authorByNoticeId = new Map<string, string>();
  for (const n of migratable) {
    const author = resolveAuthor(n);
    if (!author) fail([`[중단] authorId 해석 불가: ${n.id}`]);
    authorByNoticeId.set(n.id, author);
  }
  if (authorResolutions.length > 0) {
    console.log(`[사전검사 D] 작성자 폴백 ${authorResolutions.length}건:`);
    for (const line of authorResolutions) console.log(line);
  } else {
    console.log("[사전검사 D] 작성자 전건 createdBy 유효 — 폴백 0건");
  }

  // ── 5. 부속 데이터 로드 ─────────────────────────────────────
  const reads = await prisma.noticeRead.findMany({
    where: { noticeId: { in: migratableIds } },
  });
  const comments = await prisma.noticeComment.findMany({
    where: { noticeId: { in: migratableIds } },
    orderBy: { createdAt: "asc" },
  });
  // 시작 스냅샷 fingerprint — 락 획득 후 재대조 기준 (건수 아닌 행 단위)
  const startReadFingerprints = new Map(
    reads.map((r) => [r.id, readFingerprint(r)]),
  );
  const startCommentFingerprints = new Map(
    comments.map((c) => [c.id, commentFingerprint(c)]),
  );
  const commentCountByNotice = new Map<string, number>();
  for (const c of comments) {
    commentCountByNotice.set(
      c.noticeId,
      (commentCountByNotice.get(c.noticeId) ?? 0) + 1,
    );
  }

  // ── 6. 사전검사 C — id 충돌 분류 (전필드 fingerprint · 그 외 전부 중단) ──
  //   [Codex P2-R2 H01] 점검 창에서는 flat 진화가 없다 — 기존 TeamPost 가 "이관
  //   완료본"이려면 전 콘텐츠 필드가 원본과 일치해야 한다. 하나라도 다르면 손상
  //   (이전 이관 결함 포함) 또는 우연한 PK 충돌이므로 중단한다.
  const existing = await prisma.teamPost.findMany({
    where: { id: { in: migratableIds } },
  });
  const existingById = new Map(existing.map((e) => [e.id, e]));
  const collisions: string[] = [];
  const alreadyMigratedIds = new Set<string>();
  for (const n of migratable) {
    const ex = existingById.get(n.id);
    if (!ex) continue;
    const mismatches: string[] = [];
    if (ex.teamId !== n.targetTeamId) mismatches.push("teamId");
    if (ex.postType !== "announcement") mismatches.push("postType");
    if (ex.title !== n.title) mismatches.push("title");
    if (ex.content !== n.content) mismatches.push("content");
    if (ex.isPinned !== n.pinned) mismatches.push("isPinned");
    if (ex.isActive !== n.isActive) mismatches.push("isActive");
    if (ex.viewCount !== n.viewCount) mismatches.push("viewCount");
    if (ex.likeCount !== 0) mismatches.push("likeCount");
    if (ex.createdAt.getTime() !== n.createdAt.getTime()) {
      mismatches.push("createdAt");
    }
    if (ex.updatedAt.getTime() !== n.createdAt.getTime()) {
      mismatches.push("updatedAt(≠원본 createdAt — 이전 이관 손상/외부 수정)");
    }
    if (ts(ex.startAt) !== ts(n.startAt)) mismatches.push("startAt");
    if (ts(ex.expiresAt) !== ts(n.expiresAt)) mismatches.push("expiresAt");
    if (ts(ex.publishedNotifiedAt) !== ts(n.publishedNotifiedAt)) {
      mismatches.push("publishedNotifiedAt");
    }
    // [Codex P2-R3 H01] 후보 집합이 아니라 사전검사 D 가 산출한 **단일 기대 작성자**와
    //   정확 비교 — 유효한 createdBy 가 있는데 감독으로 잘못 기록된 행도 손상으로 잡는다.
    if (ex.authorId !== authorByNoticeId.get(n.id)) mismatches.push("authorId");
    if (ex.commentCount !== (commentCountByNotice.get(n.id) ?? 0)) {
      mismatches.push("commentCount");
    }
    if (mismatches.length === 0) {
      alreadyMigratedIds.add(n.id);
    } else {
      collisions.push(`${n.id} "${n.title}" → ${mismatches.join(", ")}`);
    }
  }
  if (collisions.length > 0) {
    fail([
      `[중단] id 충돌/이관 손상 ${collisions.length}건 — 전필드 fingerprint 불일치:`,
      ...collisions.map((c) => `  - ${c}`),
      "  손상이면 해당 TeamPost(종속 read/comment 는 FK cascade)를 삭제 후 재이관할 것.",
    ]);
  }
  const toCreate = migratable.filter((n) => !alreadyMigratedIds.has(n.id));
  console.log(
    `[사전검사 C] 충돌 0건 — 신규 이관 ${toCreate.length}건 · 기이관(재검증) ${alreadyMigratedIds.size}건`,
  );

  // ── 7. 사전검사 E — 읽음·댓글 선점/잉여 행 전필드 대조 (점검 창 전제) ──
  //   [Codex P2-R1-H01] skipDuplicates 는 PK/unique 선점 행을 조용히 건너뛴다 —
  //   선점 행은 내용까지 일치해야 통과. 점검 창에서는 flat 재열람·수정이 없으므로
  //   readAt·content·updatedAt 전부 엄격 일치를 요구하고, 이관 대상 게시글에 원본에
  //   없는 read/comment 가 붙어 있으면(창 위반 흔적) 역시 중단한다.
  const [existingReads, existingComments] = await Promise.all([
    prisma.teamPostRead.findMany({
      where: {
        OR: [
          { id: { in: reads.map((r) => r.id) } },
          { postId: { in: migratableIds } },
        ],
      },
      select: { id: true, postId: true, userId: true, readAt: true },
    }),
    prisma.teamPostComment.findMany({
      where: {
        OR: [
          { id: { in: comments.map((c) => c.id) } },
          { postId: { in: migratableIds } },
        ],
      },
      select: {
        id: true,
        postId: true,
        authorId: true,
        content: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);
  const conflicts: string[] = [];
  const exReadById = new Map(existingReads.map((r) => [r.id, r]));
  const sourceReadIds = new Set(reads.map((r) => r.id));
  for (const r of reads) {
    const ex = exReadById.get(r.id);
    if (!ex) continue;
    if (
      ex.postId !== r.noticeId ||
      ex.userId !== r.userId ||
      ex.readAt.getTime() !== r.readAt.getTime()
    ) {
      conflicts.push(`read ${r.id} (기존 ${ex.postId}/${ex.userId})`);
    }
  }
  for (const ex of existingReads) {
    if (migratableIdSet.has(ex.postId) && !sourceReadIds.has(ex.id)) {
      conflicts.push(
        `이관 외 read ${ex.id} (post ${ex.postId}) — 점검 창 위반 흔적`,
      );
    }
  }
  const exCommentById = new Map(existingComments.map((c) => [c.id, c]));
  const sourceCommentIds = new Set(comments.map((c) => c.id));
  for (const c of comments) {
    const ex = exCommentById.get(c.id);
    if (!ex) continue;
    if (
      ex.postId !== c.noticeId ||
      ex.authorId !== c.userId ||
      ex.content !== c.content ||
      ex.createdAt.getTime() !== c.createdAt.getTime() ||
      ex.updatedAt.getTime() !== c.updatedAt.getTime()
    ) {
      conflicts.push(`comment ${c.id} (기존 ${ex.postId}/${ex.authorId})`);
    }
  }
  for (const ex of existingComments) {
    if (migratableIdSet.has(ex.postId) && !sourceCommentIds.has(ex.id)) {
      conflicts.push(
        `이관 외 comment ${ex.id} (post ${ex.postId}) — 점검 창 위반 흔적`,
      );
    }
  }
  if (conflicts.length > 0) {
    fail([
      "[중단] 읽음/댓글 선점·잉여 행 불일치 — 손상 또는 점검 창 위반 검출:",
      ...conflicts.map((c) => `  - ${c}`),
    ]);
  }
  console.log(
    `[사전검사 E] 전필드 대조 통과 — 읽음 ${reads.length}건 · 댓글 ${comments.length}건 동기화 예정`,
  );

  if (!apply) {
    console.log("\n[DRY-RUN] 변경 없이 종료. 실제 이관: --apply");
    return;
  }

  // ── 8. 이관 + 원본 락 + fingerprint gate + 전건 검증 (단일 트랜잭션 — 실패 시 롤백) ──
  await prisma.$transaction(
    async (tx) => {
      // [Codex P2-R3 C01] 원본 3테이블 SHARE MODE 락 — 커밋까지 타 커넥션의 쓰기를
      //   DB 가 차단한다(읽기 허용). 봉인 코드·점검 모드와 무관하게 이관 중 원본
      //   불변이 물리적으로 보장된다. 락 이전 변경은 아래 8a 재대조가 검출.
      await tx.$executeRaw`LOCK TABLE system_notices, notice_reads, notice_comments IN SHARE MODE`;

      for (const n of toCreate) {
        await tx.teamPost.create({
          data: {
            id: n.id, // id 보존 계약
            teamId: n.targetTeamId!,
            authorId: authorByNoticeId.get(n.id)!,
            title: n.title,
            content: n.content,
            postType: "announcement",
            isPinned: n.pinned,
            isActive: n.isActive,
            viewCount: n.viewCount,
            commentCount: commentCountByNotice.get(n.id) ?? 0,
            startAt: n.startAt,
            expiresAt: n.expiresAt,
            publishedNotifiedAt: n.publishedNotifiedAt,
            createdAt: n.createdAt, // 원본 시각 보존 (@default 우회)
            updatedAt: n.createdAt, // SystemNotice 에 updatedAt 부재 → createdAt 준용 (§3.2)
          },
        });
      }
      // 읽음·댓글 — id 보존이 곧 멱등 키 (선점 행 전필드 일치는 사전검사 E 가 보증)
      await tx.teamPostRead.createMany({
        data: reads.map((r) => ({
          id: r.id,
          postId: r.noticeId,
          userId: r.userId,
          readAt: r.readAt,
        })),
        skipDuplicates: true,
      });
      await tx.teamPostComment.createMany({
        data: comments.map((c) => ({
          id: c.id,
          postId: c.noticeId,
          authorId: c.userId,
          content: c.content,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
        skipDuplicates: true,
      });

      // ── 8a. [Codex P2-R2/R3 C01] fingerprint gate — 원본 전 행 재대조 ──
      //   공지·읽음·댓글 전부 행 내용 해시를 시작 스냅샷과 비교한다 — in-place 수정·
      //   동수 삭제/생성까지 검출. 락 획득 이전에 일어난 변경이 여기서 잡히고,
      //   이후는 락이 차단하므로 통과 = 커밋까지 원본 불변. 어긋나면 전체 롤백.
      const recheck = await tx.systemNotice.findMany({
        where: { targetTeamId: { not: null } },
      });
      const driftLines: string[] = [];
      if (recheck.length !== notices.length) {
        driftLines.push(`원본 건수 변경 ${notices.length} → ${recheck.length}`);
      }
      for (const r of recheck) {
        const start = startFingerprints.get(r.id);
        if (!start) driftLines.push(`신규 원본 출현: ${r.id}`);
        else if (start !== noticeFingerprint(r)) {
          driftLines.push(`원본 in-place 수정: ${r.id}`);
        }
      }
      const [reReads, reComments] = await Promise.all([
        tx.noticeRead.findMany({ where: { noticeId: { in: migratableIds } } }),
        tx.noticeComment.findMany({
          where: { noticeId: { in: migratableIds } },
        }),
      ]);
      if (reReads.length !== reads.length) {
        driftLines.push(`읽음 건수 변경 ${reads.length} → ${reReads.length}`);
      }
      for (const r of reReads) {
        const start = startReadFingerprints.get(r.id);
        if (!start) driftLines.push(`신규 읽음 출현: ${r.id}`);
        else if (start !== readFingerprint(r)) {
          driftLines.push(`읽음 in-place 수정: ${r.id}`);
        }
      }
      if (reComments.length !== comments.length) {
        driftLines.push(
          `댓글 건수 변경 ${comments.length} → ${reComments.length}`,
        );
      }
      for (const c of reComments) {
        const start = startCommentFingerprints.get(c.id);
        if (!start) driftLines.push(`신규 댓글 출현: ${c.id}`);
        else if (start !== commentFingerprint(c)) {
          driftLines.push(`댓글 in-place 수정: ${c.id}`);
        }
      }
      if (driftLines.length > 0) {
        throw new Error(
          "[쓰기 중지 gate] 이관 중 원본 변경 감지 — 전체 롤백:\n" +
            driftLines.map((l) => `  - ${l}`).join("\n") +
            "\n  점검 모드를 켜(쓰기 정지) 재실행할 것.",
        );
      }

      // ── 8b. 전건 대조 — 커밋 전 · 전필드 엄격 (점검 창이라 진화 예외 없음) ──
      const targetPosts = await tx.teamPost.findMany({
        where: { id: { in: migratableIds } },
      });
      const targetById = new Map(targetPosts.map((t) => [t.id, t]));
      const failures: string[] = [];
      for (const n of migratable) {
        const t = targetById.get(n.id);
        if (!t) {
          failures.push(`공지 누락: ${n.id}`);
          continue;
        }
        if (t.teamId !== n.targetTeamId) failures.push(`teamId: ${n.id}`);
        if (t.postType !== "announcement") failures.push(`postType: ${n.id}`);
        if (t.title !== n.title) failures.push(`title: ${n.id}`);
        if (t.content !== n.content) failures.push(`content: ${n.id}`);
        if (t.isPinned !== n.pinned) failures.push(`pinned: ${n.id}`);
        if (t.isActive !== n.isActive) failures.push(`isActive: ${n.id}`);
        if (t.viewCount !== n.viewCount) failures.push(`viewCount: ${n.id}`);
        if (t.likeCount !== 0) failures.push(`likeCount: ${n.id}`);
        if (t.createdAt.getTime() !== n.createdAt.getTime()) {
          failures.push(`createdAt: ${n.id}`);
        }
        if (t.updatedAt.getTime() !== n.createdAt.getTime()) {
          failures.push(`updatedAt: ${n.id}`);
        }
        if (ts(t.startAt) !== ts(n.startAt)) failures.push(`startAt: ${n.id}`);
        if (ts(t.expiresAt) !== ts(n.expiresAt)) {
          failures.push(`expiresAt: ${n.id}`);
        }
        if (ts(t.publishedNotifiedAt) !== ts(n.publishedNotifiedAt)) {
          failures.push(`publishedNotifiedAt: ${n.id}`);
        }
        if (t.authorId !== authorByNoticeId.get(n.id)) {
          failures.push(`authorId: ${n.id}`);
        }
        if (t.commentCount !== (commentCountByNotice.get(n.id) ?? 0)) {
          failures.push(`commentCount: ${n.id}`);
        }
      }
      // 읽음 — 이관 대상 게시글의 타깃 행 전수 ↔ 소스 전수 양방향 대조
      const targetReads = await tx.teamPostRead.findMany({
        where: { postId: { in: migratableIds } },
        select: { id: true, postId: true, userId: true, readAt: true },
      });
      const targetReadById = new Map(targetReads.map((r) => [r.id, r]));
      for (const r of reads) {
        const t = targetReadById.get(r.id);
        if (!t) {
          failures.push(`읽음 누락: ${r.id}`);
          continue;
        }
        if (
          t.postId !== r.noticeId ||
          t.userId !== r.userId ||
          t.readAt.getTime() !== r.readAt.getTime()
        ) {
          failures.push(`읽음 필드: ${r.id}`);
        }
      }
      if (targetReads.length !== reads.length) {
        failures.push(
          `읽음 건수 불일치: 소스 ${reads.length} ≠ 타깃 ${targetReads.length}`,
        );
      }
      // 댓글 — 동일하게 양방향 전필드 대조
      const targetComments = await tx.teamPostComment.findMany({
        where: { postId: { in: migratableIds } },
        select: {
          id: true,
          postId: true,
          authorId: true,
          content: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      const targetCommentById = new Map(targetComments.map((c) => [c.id, c]));
      for (const c of comments) {
        const t = targetCommentById.get(c.id);
        if (!t) {
          failures.push(`댓글 누락: ${c.id}`);
          continue;
        }
        if (
          t.postId !== c.noticeId ||
          t.authorId !== c.userId ||
          t.content !== c.content ||
          t.createdAt.getTime() !== c.createdAt.getTime() ||
          t.updatedAt.getTime() !== c.updatedAt.getTime()
        ) {
          failures.push(`댓글 필드: ${c.id}`);
        }
      }
      if (targetComments.length !== comments.length) {
        failures.push(
          `댓글 건수 불일치: 소스 ${comments.length} ≠ 타깃 ${targetComments.length}`,
        );
      }

      console.log("\n── 커밋 전 전건 대조표 ──────────────────────");
      console.log(
        `  공지   : 소스 ${migratable.length} → 타깃 ${targetPosts.length}` +
          (orphans.length ? ` (고아 ${orphans.length}건 제외)` : ""),
      );
      console.log(
        `  읽음   : 소스 ${reads.length} → 타깃 ${targetReads.length} · ` +
          `댓글: 소스 ${comments.length} → 타깃 ${targetComments.length}`,
      );
      if (failures.length > 0) {
        throw new Error(
          `[전건 대조 실패] ${failures.length}건 — 전체 롤백:\n` +
            failures.map((f) => `  - ${f}`).join("\n"),
        );
      }
      console.log("[검증] 전건·전필드 일치 — 커밋 진행");
    },
    { timeout: 120_000 },
  );
  console.log("[이관] 트랜잭션 커밋 완료 (fingerprint gate + 전건 검증 포함)");

  // ── 9. (opt-in) 기발송 알림 linkUrl 재작성 ─────────────────
  if (rewriteLinks) {
    let rewritten = 0;
    for (const id of migratableIds) {
      const r = await prisma.notification.updateMany({
        where: { linkUrl: `/notice/${id}` },
        data: { linkUrl: `/community-notice/${id}` },
      });
      rewritten += r.count;
    }
    console.log(`[linkUrl 재작성] 알림 ${rewritten}건 갱신`);
  }

  console.log(
    "\n[안내] 원본 system_notices 행은 계약대로 보존됨 (정리는 Phase 3)." +
      " 검증 PASS 확인 후 점검 모드를 해제할 것 (= 신규 쓰기 재개).",
  );
}

main()
  .catch((e) => {
    console.error(
      "[migrate-team-notices] 실패:",
      e instanceof Error ? e.message : e,
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
