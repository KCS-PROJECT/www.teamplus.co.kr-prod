#!/usr/bin/env node
/*
 * manual-migrations/*.sql 적용 러너 — 적용 이력(_manual_migrations) 기반.
 *
 * 이력에 없는 최상위 *.sql 만 파일명 순으로 실행하고 기록한다(하위 폴더는 대상 아님).
 * 이미 적용된 파일의 내용이 바뀌면 아무것도 실행하지 않고 실패한다 — 수정은 새 파일로 작성한다.
 *
 * 사용 (backend 루트에서, apply-all.sh 경유):
 *   npm run db:migrate:manual               # 적용
 *   npm run db:migrate:manual -- --status   # 읽기 전용 상태 확인 (테이블도 만들지 않음)
 *   npm run db:migrate:manual -- --accept-changed <파일명>
 *       # 적용된 파일의 내용 변경을 승인해 기록된 체크섬만 갱신한다(재실행하지 않음).
 *       # 주석·오타처럼 DB 결과가 같은 수정에만 쓰고, 스키마가 달라지는 수정은 새 파일로 작성한다.
 *
 * 종료코드: 0 성공 · 1 SQL 실행 실패 · 2 설정 오류 · 3 적용된 파일 내용 변경 · 4 잠금 대기 초과
 *
 * 주의:
 *   - 파일 실행과 이력 INSERT 를 한 스크립트로 보내 같은 암묵 트랜잭션에서 커밋되게 한다.
 *     그래서 CREATE INDEX CONCURRENTLY·VACUUM 처럼 트랜잭션 안에서 못 도는 문장은 쓸 수 없고,
 *     파일 안의 BEGIN/COMMIT 은 본문을 이력 기록 전에 먼저 커밋시키므로 새 파일에는 쓰지 않는다.
 *   - 각 파일 앞에 lock_timeout 을 건다. 운영 중인 앱 트랜잭션 뒤에서 ALTER 가 잠금을 무한정
 *     기다리면 그 테이블의 다른 쿼리까지 줄줄이 막히므로, 기다리지 말고 실패시켜 배포를 멈춘다.
 *   - 이력 테이블은 schema.prisma 에 없으므로 `prisma migrate diff` 에 차이로 나온다(의도된 차이).
 *     `prisma db push --accept-data-loss` 는 이 테이블을 지우므로 공유 DB 에 쓰지 않는다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA_FILE = path.join('prisma', 'schema.prisma');
const DIR = process.env.MANUAL_MIGRATIONS_DIR
  ? path.resolve(process.env.MANUAL_MIGRATIONS_DIR)
  : __dirname;
const LOCK_KEY = '7366250001';
const LOCK_WAIT_MS = 120000;
const LOCK_RETRY_MS = 2000;
const STATEMENT_LOCK_TIMEOUT = '30s';

const log = (msg) => console.log(`[manual-migration] ${msg}`);
const fail = (code, msg) => {
  console.error(`[manual-migration] ERROR ${msg}`);
  process.exitCode = code;
  return code;
};

function checksumOf(file) {
  // 줄바꿈만 다른 체크아웃(CRLF)은 같은 파일로 본다.
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function listFiles() {
  return fs
    .readdirSync(DIR, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.sql'))
    .map((d) => d.name)
    .sort();
}

function runSql(script, childUrl) {
  // npx 를 거치지 않고 prisma CLI 를 직접 실행한다. DB URL 은 인자가 아닌 env 로 넘겨 프로세스 목록에 남기지 않는다.
  const cli = require.resolve('prisma/build/index.js', { paths: [BACKEND_ROOT] });
  return spawnSync(
    process.execPath,
    [cli, 'db', 'execute', '--stdin', '--schema', SCHEMA_FILE],
    {
      cwd: BACKEND_ROOT,
      env: { ...process.env, DATABASE_URL: childUrl },
      input: script,
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  );
}

async function main() {
  const statusOnly = process.argv.includes('--status');
  const acceptIdx = process.argv.indexOf('--accept-changed');
  const acceptFile = acceptIdx >= 0 ? process.argv[acceptIdx + 1] : null;
  if (acceptIdx >= 0 && !acceptFile) return fail(2, '--accept-changed 에 파일명 필요');

  require('dotenv').config({ path: path.join(BACKEND_ROOT, '.env') });
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) return fail(2, 'DATABASE_URL 미설정');

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return fail(2, 'DATABASE_URL 형식 오류');
  }
  const schema = url.searchParams.get('schema') || 'public';
  if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) return fail(2, `스키마 이름 형식 오류: ${schema}`);
  const table = `"${schema}"."_manual_migrations"`;

  const files = listFiles();
  const badName = files.find((f) => !/^[A-Za-z0-9._-]+\.sql$/.test(f));
  if (badName) return fail(2, `허용되지 않는 파일명: ${badName}`);

  // 앱 런타임용 socket_timeout 은 오래 걸리는 마이그레이션 문장을 끊으므로 실행용 연결에서는 뺀다.
  const childUrlObj = new URL(url.toString());
  childUrlObj.searchParams.delete('socket_timeout');
  const childUrl = childUrlObj.toString();

  // advisory lock 이 같은 세션에 머물도록 연결을 하나로 고정한다.
  url.searchParams.set('connection_limit', '1');
  let PrismaClient;
  try {
    ({ PrismaClient } = require('@prisma/client'));
  } catch {
    return fail(2, '@prisma/client 없음 — npx prisma generate 먼저 실행');
  }
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });

  let locked = false;
  try {
    const [{ exists }] = await prisma.$queryRawUnsafe(
      `SELECT to_regclass('"${schema}"._manual_migrations') IS NOT NULL AS "exists"`,
    );

    if (statusOnly) {
      const rows = exists
        ? await prisma.$queryRawUnsafe(`SELECT filename, checksum, applied_at FROM ${table}`)
        : [];
      const applied = new Map(rows.map((r) => [r.filename, r]));
      for (const f of files) {
        const r = applied.get(f);
        const state = !r
          ? 'PENDING'
          : r.checksum === checksumOf(path.join(DIR, f))
            ? `applied ${r.applied_at.toISOString()}`
            : 'CHANGED';
        log(`${state.padEnd(32)} ${f}`);
      }
      for (const name of applied.keys()) {
        if (!files.includes(name)) log(`WARN 이력에 있으나 파일 없음: ${name}`);
      }
      log(`schema=${schema} table=${exists ? 'exists' : 'none'} files=${files.length} applied=${files.filter((f) => applied.has(f)).length}`);
      return 0;
    }

    const deadline = Date.now() + LOCK_WAIT_MS;
    for (;;) {
      const [{ ok }] = await prisma.$queryRawUnsafe(`SELECT pg_try_advisory_lock(${LOCK_KEY}) AS ok`);
      if (ok) break;
      if (Date.now() >= deadline) return fail(4, `다른 러너가 잠금 보유 중 — ${LOCK_WAIT_MS / 1000}초 대기 초과`);
      await new Promise((r) => setTimeout(r, LOCK_RETRY_MS));
    }
    locked = true;

    await prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS ${table} (
        filename   text PRIMARY KEY,
        checksum   char(64) NOT NULL,
        applied_at timestamptz(3) NOT NULL DEFAULT now()
      )`,
    );
    // 잠금을 잡은 뒤에 읽어야 앞선 러너가 기록한 행까지 보인다.
    const rows = await prisma.$queryRawUnsafe(`SELECT filename, checksum FROM ${table}`);
    const applied = new Map(rows.map((r) => [r.filename, r.checksum]));

    const sums = new Map(files.map((f) => [f, checksumOf(path.join(DIR, f))]));

    if (acceptFile) {
      if (!applied.has(acceptFile)) return fail(2, `이력에 없는 파일: ${acceptFile}`);
      if (!sums.has(acceptFile)) return fail(2, `파일 없음: ${acceptFile}`);
      if (applied.get(acceptFile) === sums.get(acceptFile)) {
        log(`변경 없음: ${acceptFile}`);
        return 0;
      }
      await prisma.$executeRawUnsafe(
        `UPDATE ${table} SET checksum = '${sums.get(acceptFile)}' WHERE filename = '${acceptFile}'`,
      );
      log(`checksum 갱신 (재실행 없음): ${acceptFile} ${applied.get(acceptFile).slice(0, 8)}.. → ${sums.get(acceptFile).slice(0, 8)}..`);
      return 0;
    }

    const changed = files.filter((f) => applied.has(f) && applied.get(f) !== sums.get(f));
    if (changed.length > 0) {
      for (const f of changed) {
        fail(3, `적용된 파일 내용 변경: ${f} (db=${applied.get(f).slice(0, 8)}.. disk=${sums.get(f).slice(0, 8)}..)`);
      }
      return fail(3, '아무것도 실행하지 않음 — 변경 내용은 새 파일로 작성');
    }
    for (const name of applied.keys()) {
      if (!files.includes(name)) log(`WARN 이력에 있으나 파일 없음: ${name}`);
    }

    const pending = files.filter((f) => !applied.has(f));
    log(`schema=${schema} files=${files.length} applied=${applied.size} pending=${pending.length}`);
    if (pending.length === 0) {
      log('대기 파일 없음 — 최신 상태');
      return 0;
    }

    for (let i = 0; i < pending.length; i++) {
      const f = pending[i];
      const started = Date.now();
      log(`applying ${f}`);
      const body = fs.readFileSync(path.join(DIR, f), 'utf8').replace(/^﻿/, '');
      const script =
        `SET lock_timeout = '${STATEMENT_LOCK_TIMEOUT}';\n` +
        `${body}\n;\nINSERT INTO ${table} (filename, checksum) VALUES ('${f}', '${sums.get(f)}');\n`;
      const res = runSql(script, childUrl);
      if (res.error || res.status !== 0) {
        return fail(1, `failed: ${f} — 이후 ${pending.length - i - 1}개 미실행`);
      }
      const [{ n }] = await prisma.$queryRawUnsafe(
        `SELECT count(*)::int AS n FROM ${table} WHERE filename = '${f}'`,
      );
      if (n !== 1) return fail(1, `실행됐으나 이력 기록 없음: ${f}`);
      log(`applied ${f} (${Date.now() - started}ms)`);
    }
    log('전체 적용 완료');
    return 0;
  } finally {
    if (locked) await prisma.$queryRawUnsafe(`SELECT pg_advisory_unlock(${LOCK_KEY})`).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  fail(1, e && e.message ? e.message : String(e));
});
