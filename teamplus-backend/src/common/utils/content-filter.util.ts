/**
 * 콘텐츠 필터 (UGC 안전장치 — Apple Guideline 1.2 / Google #9876937 "필터")
 *
 * 채팅·UGC 텍스트의 욕설/비속어를 마스킹한다. 전송 차단이 아닌 마스킹 방식 —
 * 대화 흐름을 끊지 않으면서 부적절 표현 노출을 막는다(신고·차단과 병행).
 *
 * 운영자가 어드민에서 단어를 추가/수정하는 단계로 확장 가능(현재는 코드 상수 시드).
 */

/**
 * 차단 단어 시드 (한국어 + 영어 대표 비속어).
 * - 변형(자음 반복·공백 삽입) 일부는 normalize 단계에서 흡수.
 * - 과도한 false positive 방지를 위해 일반어 부분일치는 제외(예: "shit"만, "hit" 미포함).
 */
const PROFANITY_SEED: readonly string[] = [
  // 한국어
  "씨발",
  "시발",
  "씨바",
  "시바",
  "ㅅㅂ",
  "ㅆㅂ",
  "개새끼",
  "새끼",
  "병신",
  "ㅂㅅ",
  "지랄",
  "좆",
  "좆같",
  "엿같",
  "닥쳐",
  "꺼져",
  "미친놈",
  "미친년",
  "창녀",
  "썅",
  "ㅈ같",
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "dick",
];

/** 마스킹 비교용 정규화: 공백 제거 + 소문자 (변형 회피 일부 흡수). */
function normalizeForMatch(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

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
 * 텍스트의 비속어를 ● 로 마스킹한다.
 * - 원문 길이/공백 구조는 최대한 보존(원문에서 직접 치환).
 * - 공백 삽입 변형(예: "시 발")은 normalize 검사로 탐지하되, 탐지 시 전체 토큰 단위 마스킹은
 *   과도하므로 1차로 직접 매칭만 치환하고, normalize 매칭 시 hasProfanity 플래그만 true 로 둔다.
 */
export function filterProfanity(input: string): ContentFilterResult {
  if (!input) return { filtered: input, hasProfanity: false };

  let hasProfanity = false;

  // 1차: 원문 직접 매칭 치환
  const filtered = input.replace(PROFANITY_REGEX, (match) => {
    hasProfanity = true;
    return "●".repeat(match.length);
  });

  // 2차: 공백/대소문자 변형 탐지(치환은 1차만 — 플래그용)
  if (!hasProfanity) {
    const normalized = normalizeForMatch(input);
    hasProfanity = PROFANITY_SEED.some((w) =>
      normalized.includes(normalizeForMatch(w)),
    );
  }

  return { filtered, hasProfanity };
}
