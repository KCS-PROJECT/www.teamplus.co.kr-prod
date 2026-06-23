/**
 * QrGlyph — 'QR 체크인' 메트릭을 시각화하는 브랜드 QR 일러스트.
 *
 * - 실제 스캔용 코드가 아니라 제품(QR 출석) 표현용 장식 SVG.
 * - 모듈 패턴은 고정 시드 LCG로 생성(Math.random 미사용) → 서버/클라이언트 렌더가
 *   완전히 동일(hydration mismatch 0).
 * - 색은 currentColor(다크 모듈) + 토큰 fill-* 유틸(흰 간격·ice-500 파인더 코어)만 사용 → 임의 hex 0.
 */

const SIZE = 21; // QR v1 모듈 수

/** 파인더(코너 눈) 영역 + 분리 여백(8셀) 판정 */
function inFinderZone(r: number, c: number): boolean {
  return (
    (r < 8 && c < 8) ||
    (r < 8 && c >= SIZE - 8) ||
    (r >= SIZE - 8 && c < 8)
  );
}

/** 데이터 모듈 좌표 — 고정 시드 결정론적 패턴(매 렌더 동일) */
function buildModules(): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  let seed = 0x5f3a91;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (inFinderZone(r, c)) continue;
      if (rnd() > 0.52) cells.push([r, c]);
    }
  }
  return cells;
}

const MODULES = buildModules();
const FINDERS: Array<[number, number]> = [
  [0, 0],
  [0, SIZE - 7],
  [SIZE - 7, 0],
];

export function QrGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label="QR 출석 코드 일러스트"
      className={className}
    >
      {/* 데이터 모듈 — 둥근 사각 */}
      <g fill="currentColor">
        {MODULES.map(([r, c]) => (
          <rect key={`${r}-${c}`} x={c + 0.12} y={r + 0.12} width={0.76} height={0.76} rx={0.26} />
        ))}
      </g>

      {/* 파인더(코너 눈) 3개 — 다크 라운드 + 흰 간격 + ice-500 코어 */}
      {FINDERS.map(([y, x]) => (
        <g key={`f-${y}-${x}`}>
          <rect x={x + 0.4} y={y + 0.4} width={6.2} height={6.2} rx={1.8} fill="currentColor" />
          <rect x={x + 1.5} y={y + 1.5} width={4} height={4} rx={1.2} className="fill-white" />
          <rect x={x + 2.4} y={y + 2.4} width={2.2} height={2.2} rx={0.8} className="fill-ice-500" />
        </g>
      ))}
    </svg>
  );
}
