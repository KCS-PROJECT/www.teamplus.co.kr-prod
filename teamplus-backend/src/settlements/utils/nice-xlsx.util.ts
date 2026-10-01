import * as XLSX from "xlsx";

export type NiceXlsxCell = string | number;

export const NICE_XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * 나이스 관리자 다량등록 양식 xlsx(Sheet1, 첫 줄 제목).
 * 문자열은 글자 셀, 숫자는 숫자 셀로 들어간다 — 계좌번호처럼 앞자리 0·16자리 이상을 지켜야 하는 값은 문자열로 넘긴다.
 */
export function buildNiceXlsx(
  header: readonly string[],
  rows: readonly (readonly NiceXlsxCell[])[],
): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([
    [...header],
    ...rows.map((row) => [...row]),
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Sheet1");
  // 엑셀이 저장한 파일과 같은 형태(공유 문자열·압축)로 쓴다 — 나이스 샘플 파일이 이 형태다.
  return XLSX.write(book, {
    type: "buffer",
    bookType: "xlsx",
    bookSST: true,
    compression: true,
  }) as Buffer;
}

/** UTF-8 바이트 기준 자르기 — 나이스 길이 제한이 바이트인지 글자인지 문서에 없어 더 엄격한 쪽을 따른다. */
export function truncateUtf8Bytes(value: string, maxBytes: number): string {
  let bytes = 0;
  let out = "";
  for (const ch of value) {
    bytes += Buffer.byteLength(ch, "utf8");
    if (bytes > maxBytes) break;
    out += ch;
  }
  return out;
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}
