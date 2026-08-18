/**
 * KST(한국시간) 날짜 입력 ↔ UTC ISO 변환 유틸 — teamplus-admin 공용
 *
 * 프로젝트 시간 처리 규약(A군 절대시점)에 따라 서버는 UTC instant 로 저장하고,
 * **KST 벽시계 변환은 입력/표시 화면의 책임**이다. 이 파일이 그 변환의 단일 출처다.
 *
 * 브라우저 타임존과 무관하게 동작한다 — `new Date(input).toISOString()` 처럼
 * 로컬 타임존에 의존하는 변환을 쓰면 등록 환경에 따라 저장 인스턴트가 달라진다.
 *
 * ⚠️ 백엔드에 KST 변환 helper 를 두지 않는다는 규약이 있으므로, 관리자 화면에서
 *    날짜/시각을 전송할 때는 반드시 이 유틸을 거쳐 UTC ISO 로 바꿔 보낸다.
 */

/** KST = UTC+9 (DST 없음) */
export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** ISO(UTC) → datetime-local 입력값 "YYYY-MM-DDTHH:mm" (한국시간 KST 고정) */
export const isoToDatetimeLocal = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // 인스턴트를 +9h 시프트한 뒤 UTC 파트를 읽으면 KST 벽시계가 된다(브라우저 TZ 무관).
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(kst.getUTCDate())}T${pad2(kst.getUTCHours())}:${pad2(kst.getUTCMinutes())}`;
};

/** ISO(UTC) → date 입력값 "YYYY-MM-DD" (한국시간 KST 고정) */
export const isoToDateInput = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  return `${kst.getUTCFullYear()}-${pad2(kst.getUTCMonth() + 1)}-${pad2(kst.getUTCDate())}`;
};

/** ISO(UTC) → "YYYY.MM.DD" 표시 문자열 (한국시간 KST 고정) */
export const isoToKstDateLabel = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  return `${kst.getUTCFullYear()}.${pad2(kst.getUTCMonth() + 1)}.${pad2(kst.getUTCDate())}`;
};

/** ISO(UTC) → "YYYY.MM.DD HH:mm" 표시 문자열 (한국시간 KST 고정) */
export const isoToKstDateTimeLabel = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  return `${kst.getUTCFullYear()}.${pad2(kst.getUTCMonth() + 1)}.${pad2(kst.getUTCDate())} ${pad2(kst.getUTCHours())}:${pad2(kst.getUTCMinutes())}`;
};

/**
 * datetime-local("YYYY-MM-DDTHH:mm") 또는 date("YYYY-MM-DD") 입력값을
 * **한국시간(KST)으로 간주**하여 백엔드용 UTC ISO 문자열로 변환한다.
 *
 * boundary='end' + 날짜만 입력된 경우 그날 23:59:59.999 KST 까지로 해석한다.
 *   (00:00 으로 변환하면 "종료일 당일 0시에 이미 만료"되어 하루가 통째로 사라진다.)
 *   분 단위(datetime-local)로 받은 값은 입력 시각을 그대로 존중한다.
 */
export const kstInputToUtcIso = (
  local?: string | null,
  boundary: 'start' | 'end' = 'start',
): string | undefined => {
  if (!local) return undefined;
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return undefined;
  const [, y, mo, d, hh, mm] = m;
  const hasTime = hh !== undefined && mm !== undefined;
  // KST 벽시계 → UTC epoch: Date.UTC(KST 파트) - 9h
  let utcMs = Date.UTC(+y, +mo - 1, +d, +(hh ?? 0), +(mm ?? 0)) - KST_OFFSET_MS;
  if (boundary === 'end' && !hasTime) {
    utcMs += 24 * 60 * 60 * 1000 - 1;
  }
  const dt = new Date(utcMs);
  if (Number.isNaN(dt.getTime())) return undefined;
  return dt.toISOString();
};
