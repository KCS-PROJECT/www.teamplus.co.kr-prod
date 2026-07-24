/**
 * backfill-activity-platform.ts — UserActivityLog 플랫폼 라벨 정정 백필
 *
 * ▸ 배경
 *   admin(5002) 의 `/api/log` route 가 백엔드 forward 시 `source:"web"` 으로 하드코딩되어
 *   (버그), admin 운영자 트래픽이 전부 `platform='web'` 으로 저장돼 있었다.
 *   또한 web(5001) 은 과거 백엔드 forward 자체가 없었으므로, **수정 배포 이전의
 *   `platform='web'` 데이터는 100% admin route 에서 온 것 = 전부 admin 트래픽**이다.
 *
 * ▸ 안전 기준 (운영)
 *   수정 배포 이후에는 web route 가 정상 forward 하므로 `platform='web'` 에 진짜 web
 *   사용자가 섞이기 시작한다. 따라서 **배포 시각(--before) 이전의 `platform='web'`만**
 *   `platform='admin'` 으로 정정한다. 배포 이후 데이터는 건드리지 않는다.
 *
 * ▸ 사용법 (운영 서버의 teamplus-backend 디렉토리에서 실행)
 *   # dry-run (기본) — 무엇이 바뀔지 건수/샘플만 출력, 변경 없음
 *   npm run backfill:platform -- --before "2026-07-24T12:00:00+09:00"
 *
 *   # 실제 적용
 *   npm run backfill:platform -- --before "2026-07-24T12:00:00+09:00" --apply
 *
 *   (tsx 직접: npx tsx scripts/backfill-activity-platform.ts --before "..." [--apply])
 *   --before 생략 시: 현재 분포만 조회하고 종료 (안전).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseArgs() {
  const argv = process.argv.slice(2);
  const apply = argv.includes("--apply");
  const bi = argv.indexOf("--before");
  const before =
    bi >= 0 && argv[bi + 1] ? new Date(argv[bi + 1]) : null;
  return { apply, before };
}

async function main() {
  const { apply, before } = parseArgs();

  // 0) 현재 분포
  const dist = await prisma.userActivityLog.groupBy({
    by: ["platform"],
    _count: true,
  });
  console.log("[현재 platform 분포]");
  dist.forEach((d) => console.log(`  ${d.platform ?? "(null)"}: ${d._count}건`));
  console.log("");

  if (!before || isNaN(before.getTime())) {
    console.log(
      "⚠️  --before <배포시각ISO> 미지정 → 분포만 출력하고 종료합니다.",
    );
    console.log(
      '   예: npm run backfill:platform -- --before "2026-07-24T12:00:00+09:00" [--apply]',
    );
    return;
  }

  // 1) 대상: 배포 시각 이전 + platform='web'
  const target = { platform: "web", createdAt: { lt: before } } as const;
  const targetCount = await prisma.userActivityLog.count({ where: target });

  // 2) 안전 점검 — 대상 중 admin 경로(/dashboard*, /login, /)가 아닌 행 샘플
  const nonAdminLike = await prisma.userActivityLog.findMany({
    where: {
      ...target,
      NOT: [
        { resource: { startsWith: "/dashboard" } },
        { resource: { in: ["/login", "/"] } },
        { resource: null },
      ],
    },
    select: { resource: true, action: true, createdAt: true },
    take: 15,
    orderBy: { createdAt: "desc" },
  });

  console.log(`[백필 대상] created_at < ${before.toISOString()} AND platform='web'`);
  console.log(`  총 ${targetCount}건 → 'admin' 으로 정정 예정`);
  console.log(
    `  이 중 admin 경로(/dashboard·/login·/)가 아닌 행: ${nonAdminLike.length === 15 ? "15건 이상" : nonAdminLike.length + "건"}`,
  );
  if (nonAdminLike.length > 0) {
    console.log(
      "  ⚠️  아래 resource 는 admin 경로가 아닙니다. 진짜 web 사용자면 --before 시각을 앞당기세요:",
    );
    nonAdminLike.forEach((r) =>
      console.log(
        `     ${r.createdAt.toISOString().slice(0, 16)} | ${r.action} | ${r.resource}`,
      ),
    );
  }
  console.log("");

  if (!apply) {
    console.log("🔎 dry-run 입니다. 실제 적용하려면 --apply 를 붙여 다시 실행하세요.");
    return;
  }

  // 3) 적용
  const res = await prisma.userActivityLog.updateMany({
    where: target,
    data: { platform: "admin" },
  });
  console.log(`✅ 백필 완료: ${res.count}건 'web' → 'admin' 정정`);

  const after = await prisma.userActivityLog.groupBy({
    by: ["platform"],
    _count: true,
  });
  console.log("\n[백필 후 platform 분포]");
  after.forEach((d) => console.log(`  ${d.platform ?? "(null)"}: ${d._count}건`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
