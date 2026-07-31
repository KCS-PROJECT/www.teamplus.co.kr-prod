/**
 * 콘텐츠 필터 (UGC 안전장치 — 정보통신망법 §44조의2 · 청소년보호법 · Apple Guideline 1.2 / Google #9876937 "필터")
 *
 * 채팅·UGC 텍스트의 욕설/비속어를 마스킹한다. 전송 차단이 아닌 마스킹 방식 —
 * 대화 흐름을 끊지 않으면서 부적절 표현 노출을 막는다(신고·차단과 병행).
 *
 * 적용 경로: 채팅 메시지 · 팀 커뮤니티 게시글/댓글/이벤트 · 공지 댓글 ·
 * 픽업매치 제목/설명 · 상담 문의 본문. 아동·청소년이 이용하는 서비스라
 * 쓰기 경로 전체에 적용한다.
 *
 * 운영자가 어드민에서 단어를 추가/수정하는 단계로 확장 가능(현재는 코드 상수 시드).
 */

/**
 * 차단 단어 시드 (한국어 + 영어 대표 비속어 + 자모 분리 변형).
 *
 * 수록 기준:
 * - 정상 문맥에서 쓰이는 일반어는 제외한다. 예: 단독 "새끼"(강아지 새끼 등)는 빼고
 *   욕설로만 쓰이는 결합형("개새끼", "새끼야", "이새끼")만 넣는다.
 * - 공백·특수문자 삽입 변형("시.발", "시 발")은 정규화 단계가 흡수하므로 별도 등재 불요.
 * - 자모 분리("ㅅㅣㅂㅏㄹ")는 정규화로 흡수되지 않아 대표형만 직접 등재한다.
 */
const PROFANITY_SEED: readonly string[] = [
  // 한국어 — 욕설
  "씨발",
  "시발",
  "씨바",
  "시바르",
  "씨빨",
  "시팔",
  "씹",
  "ㅅㅂ",
  "ㅆㅂ",
  "개새끼",
  "개색기",
  "개세끼",
  "새끼야",
  "새끼들",
  "이새끼",
  "저새끼",
  "그새끼",
  "병신",
  "븅신",
  "빙신",
  "ㅂㅅ",
  "지랄",
  "ㅈㄹ",
  "좆",
  "존나",
  "좆같",
  "엿같",
  "닥쳐",
  "꺼져",
  "미친놈",
  "미친년",
  "미친새",
  "창녀",
  "썅",
  "쌍놈",
  "쌍년",
  "ㅈ같",
  "니미",
  "느금마",
  "니애미",
  "엄창",
  "찐따",
  "등신",
  "정신병자",
  "머저리",
  "호모",
  "짱깨",
  "쪽바리",
  "따까리",
  // 한국어 — 자모 분리 우회 (대표형만; 완전 대응은 불가하므로 실효성 위주)
  "ㅅㅣㅂㅏㄹ",
  "ㅆㅣㅂㅏㄹ",
  "ㅂㅕㅇㅅㅣㄴ",
  "ㅈㅣㄹㅏㄹ",
  // 영어
  "fuck",
  "fuk",
  "fck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "dick",
  "cunt",
  "motherfucker",
  "retard",
  "whore",
  "slut",
];

/**
 * 정규화 시 제거하는 우회용 구분자.
 * 공백·제로폭 문자·특수기호를 지운 뒤 매칭하므로 "시 발" · "시.발" · "시*발" 을 모두 잡는다.
 *
 * 문장부호 중 `,`·`!`·`?`·`;`·`:` 는 **제거하지 않는다** — 강한 문장 경계라
 * 제거하면 "김코치 씨, 발표" 처럼 정상 문장이 오탐되는 부작용이 더 크다.
 */
const SEPARATOR_PATTERN = new RegExp(
  "[\\s\\u200b\\u200c\\u200d\\u2060\\ufeff.~^_*'\"`|/\\\\()\\[\\]{}<>+=@#$%&-]",
);

/** 정규식 메타문자 이스케이프. */
function escapeRegExp(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const PROFANITY_REGEX = new RegExp(
  PROFANITY_SEED.map(escapeRegExp).join("|"),
  "gi",
);

export interface ContentFilterResult {
  /** 마스킹 적용된 텍스트 */
  filtered: string;
  /** 비속어 탐지 여부 */
  hasProfanity: boolean;
}

/**
 * 정규화 텍스트 + 원문 인덱스 역매핑을 만든다.
 * 구분자를 제거하고 소문자화하며, 남은 각 문자가 원문 몇 번째였는지 기록한다.
 */
function buildNormalized(input: string): { text: string; indexMap: number[] } {
  const chars = Array.from(input);
  let text = "";
  const indexMap: number[] = [];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (SEPARATOR_PATTERN.test(ch)) continue;
    text += ch.toLowerCase();
    indexMap.push(i);
  }

  return { text, indexMap };
}

/**
 * 텍스트의 비속어를 ● 로 마스킹한다.
 *
 * 정규화(구분자 제거 + 소문자) 텍스트에서 매칭한 뒤 **원문 구간을 되짚어 치환**한다 —
 * 과거 구현은 정규화 매칭 시 플래그만 세우고 치환하지 않아 "시 발" 류 우회가 무방비였다.
 * 매칭 구간 사이에 끼어 있던 구분자까지 함께 마스킹하므로 원문 길이는 보존된다.
 */
export function filterProfanity(input: string): ContentFilterResult {
  if (!input) return { filtered: input, hasProfanity: false };

  const { text: normalized, indexMap } = buildNormalized(input);
  if (!normalized) return { filtered: input, hasProfanity: false };

  const chars = Array.from(input);
  const maskFlags = new Array<boolean>(chars.length).fill(false);
  let hasProfanity = false;

  PROFANITY_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = PROFANITY_REGEX.exec(normalized)) !== null) {
    // 빈 매칭 방어 (무한 루프 차단)
    if (match[0].length === 0) {
      PROFANITY_REGEX.lastIndex += 1;
      continue;
    }
    hasProfanity = true;

    const originalStart = indexMap[match.index];
    const originalEnd = indexMap[match.index + match[0].length - 1];
    for (let i = originalStart; i <= originalEnd; i++) {
      maskFlags[i] = true;
    }
  }

  if (!hasProfanity) return { filtered: input, hasProfanity: false };

  const filtered = chars.map((ch, i) => (maskFlags[i] ? "●" : ch)).join("");
  return { filtered, hasProfanity: true };
}

/**
 * 마스킹된 텍스트만 반환하는 축약 헬퍼 — UGC 쓰기 경로에서 sanitize 후 체이닝한다.
 * null/undefined 는 그대로 통과시켜 optional 필드에 그대로 쓸 수 있다.
 */
export function maskProfanity(input: string): string;
export function maskProfanity(input: null | undefined): null;
export function maskProfanity(
  input: string | null | undefined,
): string | null;
export function maskProfanity(
  input: string | null | undefined,
): string | null {
  if (input === null || input === undefined) return null;
  return filterProfanity(input).filtered;
}
