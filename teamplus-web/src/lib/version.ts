/**
 * compareSemver - 세미버전 비교
 *
 * @returns -1 if a < b, 0 if equal, 1 if a > b
 *
 * @example
 * compareSemver('1.0.0', '1.0.1') // -1
 * compareSemver('2.0.0', '1.9.9') // 1
 * compareSemver('1.2.3', '1.2.3') // 0
 *
 * 유연한 포맷 허용:
 * - 'v1.2.3' → 1.2.3
 * - '1.2' → 1.2.0
 * - '1.2.3-beta' → 1.2.3 (prerelease 무시)
 * - 잘못된 입력 → 0 (동등 간주, 안전 기본값)
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const parse = (v: string): number[] => {
    if (!v || typeof v !== 'string') return [0, 0, 0];
    // 'v' 접두사 제거, prerelease/메타 제거
    const cleaned = v.replace(/^v/i, '').split(/[-+]/)[0] ?? '0.0.0';
    const parts = cleaned.split('.').map((p) => {
      const n = parseInt(p, 10);
      return Number.isNaN(n) ? 0 : n;
    });
    while (parts.length < 3) parts.push(0);
    return parts.slice(0, 3);
  };

  const [a1, a2, a3] = parse(a);
  const [b1, b2, b3] = parse(b);

  if (a1 !== b1) return a1 < b1 ? -1 : 1;
  if (a2 !== b2) return a2 < b2 ? -1 : 1;
  if (a3 !== b3) return a3 < b3 ? -1 : 1;
  return 0;
}

/**
 * isBelowMinimum - 현재 버전이 최소 요구 버전 미달인지
 */
export function isBelowMinimum(current: string, minimum: string): boolean {
  return compareSemver(current, minimum) < 0;
}
