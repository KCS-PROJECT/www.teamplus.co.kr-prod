# 타임존 재설계 Step 1~3 — 변경 내역 + 운영 반영 런북

> 작성: 2026-07-02 · 설계 SoT: [timezone-storage-redesign-2026-07-02.md](timezone-storage-redesign-2026-07-02.md)
> DEV 반영 완료 상태 (하네스 10.0 S ×2 검수 통과). **운영 반영 대기.**
> 교훈 문서: [Step2 사고](../docs/solutions/2026-07-02-timezone-step2-timestamptz.md) · [Step3 체크리스트](../docs/solutions/2026-07-02-timezone-step3-scheduled-date.md)

---

## PART A. 무엇이 바뀌었나 (커밋 대상 전체)

### A-1. Step 1 — 업로드 디렉터리 날짜 버그 수정 (코드만)

| 파일 | 변경 |
|---|---|
| `teamplus-backend/src/common/utils/kst-date.util.ts` | **신규** — KST 날짜/시각 공통 유틸 (이후 Step 3에서 7함수로 확장) |
| `teamplus-backend/src/files/files.service.ts` | `getKstNow()`+로컬 getter 이중 시프트 제거 → `nowKstParts()` — KST 15시 이후 업로드 디렉터리가 내일 날짜로 생성되던 버그 해결 |

### A-2. Step 2 — 절대 시점 컬럼 timestamptz 전환 (DB + 스키마, 코드 0줄)

| 대상 | 변경 |
|---|---|
| DB (DEV 적용됨) | **371컬럼/156테이블** `timestamp(3)` → `timestamptz(3)` (`USING col AT TIME ZONE 'UTC'` — 순간 보존, epoch 불변 실증). 잔여 timestamp 36 = B군(달력 날짜) 34 + C군(Class.startTime/endTime) 2 |
| `teamplus-backend/prisma/schema.prisma` | A군 371필드에 `@db.Timestamptz(3)` 부여 |
| 운영 SQL | `teamplus-backend/prisma/manual-migrations/20260702_tz_step2/` — `00_precheck_audit.sql` · `01_step2_timestamptz.sql`(371 ALTER) · `99_rollback_step2.sql` |

효과: DBeaver/SQL에서 시각이 KST로 자동 표시. 애플리케이션 동작 무변화(Prisma 왕복 동일).

### A-3. Step 3 — scheduled_date @db.Date 전환 (DB + 백엔드 23파일 + 프론트 8파일)

| 대상 | 변경 |
|---|---|
| DB (DEV 적용됨) | `class_schedules.scheduled_date` `timestamp` → **`date`** (165행, 백필 0건 — USING 변환이 전 저장 레짐의 정확한 역변환임을 행별 요일 대조로 증명). 백업 테이블 `class_schedules_backup_20260702` 존치 |
| `schema.prisma` | `ClassSchedule.scheduledDate`에 `@db.Date` (1줄) |
| `kst-date.util.ts` | 확장: `dateOnlyToUtc`·`dateOnlyToString`·`composeKstInstant`·`utcDayRange`·`kstTodayUtcMidnight`·`addUtcDays` |
| 백엔드 23파일 | write ~11지점(`dateOnlyToUtc` — UTC 자정 규약)·경계 필터 ~55지점(UTC 자정 경계, **A군 공유 변수는 sd\* 분리**)·시각 합성 3지점(`composeKstInstant`)·attendance 판정 day-level 재설계·hourlyPattern startTime 버킷 재설계·coach status composeKstInstant. 주요: classes·attendance·training·teams·calendar·children·rsvp·admin(bulk-import)·postpaid-settlement·lesson/game-confirmation·payment-calculation·member-level·대시보드 8종·schedule-time.util |
| 프론트 8파일 | scheduledDate에서 시각(HH:mm) 유도하던 fallback 9건 제거/정정 (attendance-window KST 자정 고정 포함) |
| 운영 SQL | `teamplus-backend/prisma/manual-migrations/20260702_tz_step3/` — `00_precheck_audit.sql` · `02a_step3_backfill_dev.sql`(dev 전용, 실제 0건) · `03_step3_scheduled_date.sql`(백업+ALTER) |

효과: `scheduled_date`가 달력 날짜 그 자체(`2026-07-02`)로 저장·조회 — 하루 밀림 원천 소멸. 프론트 화면 표시는 동일(브라우저 KST 변환 결과 같은 날짜).

### A-4. 새 코드 규약 (이후 개발 시 준수 — Step 4 온디맨드 전환에도 동일)

1. `@db.Date` 컬럼 write = **UTC 자정** `dateOnlyToUtc("YYYY-MM-DD")` — `+09:00` 파싱 절대 금지(전일 오저장)
2. `@db.Date` 경계 필터 = UTC 자정 경계 (`kstTodayUtcMidnight`·`addUtcDays`·`utcDayRange`)
3. **scheduledDate에서 시각 유도 금지** — 시각 SoT는 `startTime`("HH:mm" 텍스트). 합성 필요 시 `composeKstInstant(date, "HH:mm")`
4. 오프셋 없는 `new Date("...T00:00:00")` 금지 · `Date.now()+9h`는 반드시 `getUTC*` getter와 짝 (유틸 경유 권장)

---

## PART B. 운영 반영 런북

### B-0. 전제

- 운영 DB는 dev 카피 + 약 1주 독자 데이터 → **데이터 의존 단계(precheck·백필)는 운영 실측 기준으로 별도 판정** (dev SQL의 ALTER는 행별 변환 규칙이라 공용, 백필만 환경 전용)
- ⚠️ **`prisma db execute` 사용 금지 — 반드시 psql** (Step 2 사고 원인: socket_timeout 15s로 클라이언트만 끊기고 서버는 계속 실행 → 재실행 시 이중 변환 −9h). psql 단일 세션·1회 실행, 타임아웃/끊김 시 **재실행 절대 금지**하고 서버 측 완료 여부(타입 집계)부터 확인
- 사전 DB 백업(pg_dump) 권장

### B-1. 사전 점검 (언제든, 서비스 무중단)

```bash
# 운영 DB 접속 (접속 정보는 운영 .env 참조)
psql "postgresql://<user>:<pw>@<prod-host>:<port>/<db>" -f teamplus-backend/prisma/manual-migrations/20260702_tz_step2/00_precheck_audit.sql
psql "..." -f teamplus-backend/prisma/manual-migrations/20260702_tz_step3/00_precheck_audit.sql
```

**판정 기준**:
| 확인 | 기대값 (dev와 동일 시) | 다르면 |
|---|---|---|
| 앱 테이블 timestamptz 수 | 0 (전부 timestamp) | 이미 timestamptz인 컬럼 존재 → **해당 컬럼은 01 SQL에서 제거 후 실행** (재변환 = −9h 오염) |
| scheduled_date 시각 분포 | 15:00 다수 + 06:00/15:30 소수, **00:00 = 0건** | 00:00 행 존재 또는 미지 패턴 → **02b(운영 백필) 판정 필요 — precheck 출력을 개발자(Claude 세션)에 전달해 02b 생성 후 진행** |

### B-2. Step 2 SQL — 코드 배포와 무관, 미리 실행 가능

```bash
psql "..." --single-transaction=off -f teamplus-backend/prisma/manual-migrations/20260702_tz_step2/01_step2_timestamptz.sql
# 파일 자체가 테이블 단위 BEGIN/COMMIT — 중간 실패 시 실패 테이블부터 "타입 확인 후" 이어서
```
- 실행 후 확인: `00_precheck` 재실행 → timestamptz 374 / timestamp 36 (dev와 동일 기대)
- 롤백: `99_rollback_step2.sql` (무손실 역변환)
- 구코드/신코드 모두와 호환이므로 배포 창 이전 아무 때나 가능. **단 1회만.**

### B-3. 배포 창 — Step 3 SQL + 새 코드 (반드시 함께)

> 이유: 구코드가 새 스키마(date)에 쓰면 **전일로 오저장**, 신코드가 옛 스키마에 써도 어긋남. 혼재 창을 0으로.

```bash
# ① 소스 반영 준비 (기존 dev-prod-sync 절차): 소스만 운영 repo 복사·커밋 (schema.prisma 포함)
#    ※ Jenkins ARM 재빌드가 prisma generate 수행 — node_modules/dist 복사 금지 (기존 정책)

# ② 구 서비스 정지
pm2 stop teamplus-api

# ③ Step 3 SQL 실행 (psql)
#    (B-1에서 02b 필요 판정이 났으면 02b를 먼저)
psql "..." -f teamplus-backend/prisma/manual-migrations/20260702_tz_step3/03_step3_scheduled_date.sql
#    → 백업 테이블(class_schedules_backup_YYYYMMDD) 생성 + ALTER 포함

# ④ 즉시 검증 (심리스): 타입=date, 행수 보존, 표본 날짜가 KST 달력일과 일치
psql "..." -c "SELECT count(*), min(scheduled_date), max(scheduled_date) FROM icehockey.class_schedules;"

# ⑤ Jenkins 빌드 → 새 코드 기동
pm2 start teamplus-api   # (또는 Jenkins 배포 스크립트)
```

### B-4. 반영 후 확인

1. `00_precheck` 2종 재실행 — 타입 분포 최종 확인
2. 화면 스팟 체크: 일정 캘린더(감독/학부모) · 출석 관리(오늘 수업 목록·출석 윈도우) · 대시보드(이번 달 수업 수·출석 트렌드) · **이미지 업로드 1회**(디렉터리 날짜 = KST 오늘)
3. 신규 일정 1건 등록 → DB에서 `scheduled_date`가 입력 날짜 그대로인지 확인

### B-5. 롤백 절차 (문제 발생 시)

| 대상 | 방법 |
|---|---|
| Step 2 | `99_rollback_step2.sql` (무손실) + schema.prisma 이전 커밋으로 재배포 |
| Step 3 스키마 | `ALTER ... TYPE timestamp(3) USING (scheduled_date::timestamp AT TIME ZONE 'Asia/Seoul' AT TIME ZONE 'UTC')` — KST 자정 instant 규약으로 복귀 |
| Step 3 데이터 | 백업 테이블 `class_schedules_backup_*` join 복원 |
| 코드 | 이전 커밋 재배포 (스키마 롤백과 반드시 동시) |

### B-6. 남은 로드맵 (운영 반영과 별개)

- **Step 4**: 나머지 B군 33컬럼(birthDate·startDate/endDate 류) 온디맨드 전환 — [체크리스트](../docs/solutions/2026-07-02-timezone-step3-scheduled-date.md) 재사용
- **Step 5**: 서버 TZ 명시 고정(pm2 ecosystem `TZ`) + CI 금지 패턴 가드 + CLAUDE_STANDARDS 시간 규약 등재
