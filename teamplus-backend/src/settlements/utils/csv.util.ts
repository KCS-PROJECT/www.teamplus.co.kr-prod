/**
 * CSV 버퍼 공용 빌더 — settlements 모듈의 exportSettlements·getPayoutExport 가 공유한다.
 * BOM(엑셀 한글 깨짐 방지) + 일반 이스케이프(쉼표·따옴표·개행) + CSV 수식 주입 방지
 * (`=`,`+`,`-`,`@` 로 시작하는 셀은 앞에 `'` 를 붙여 무해화)를 한 곳에서 보장한다.
 * 순수 정수 셀(예: 음수 금액 `-5000`)은 수식이 될 수 없으므로 무해화하지 않는다 —
 * `'` 가 붙으면 엑셀이 텍스트로 읽어 합계에서 빠진다.
 */
const PLAIN_INTEGER = /^-?\d+$/;

export function toCsvBuffer(headers: string[], rows: string[][]): Buffer {
  const escapeCell = (val: string): string => {
    const neutralized =
      !PLAIN_INTEGER.test(val) && /^[=+\-@]/.test(val) ? `'${val}` : val;
    if (
      neutralized.includes(",") ||
      neutralized.includes('"') ||
      neutralized.includes("\n")
    ) {
      return `"${neutralized.replace(/"/g, '""')}"`;
    }
    return neutralized;
  };

  const csvLines = [
    headers.map(escapeCell).join(","),
    ...rows.map((row) => row.map(escapeCell).join(",")),
  ];

  const bom = "﻿";
  return Buffer.from(bom + csvLines.join("\n"), "utf-8");
}
