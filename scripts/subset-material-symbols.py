#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Material Symbols 아이콘 폰트를 실사용 아이콘만 남기고 서브셋한다.

배경 (2026-07-30 성능 감사):
  전체 아이콘 세트(6,072 글리프 / 3.39MB)를 자체 호스팅하고 있었다. woff2 는 이미
  압축 포맷이라 gzip 이 무효이고, `layout.tsx` 의 인라인 critical CSS 가
  `font-display: block` 으로 선언하므로 콜드 스타트마다 3.39MB 를 그대로 받는다.
  실사용 아이콘은 287개뿐이어서 95% 가 낭비였다.

사용:
  python3 scripts/subset-material-symbols.py

  아이콘을 새로 쓰기 시작했으면 이 스크립트를 다시 실행해야 한다.
  실행하지 않으면 새 아이콘이 글리프 없이 텍스트로 표시된다.

동작:
  1) teamplus-web/src 전체에서 실사용 Material ligature 를 수집
     - Icon.tsx 매핑 테이블의 값 (`users: "groups"` → groups)
     - `name="..."` 중 매핑 키가 아닌 것 (직접 ligature 로 쓰는 경우)
     - `<span class="material-symbols-outlined">person</span>` 인라인 형태
  2) 원본 폰트의 GSUB 에서 ligature 규칙을 읽어 각 이름이 어느 글리프로
     치환되는지 확인하고, 그 글리프 + ligature 입력 문자 글리프만 남긴다
  3) pyftsubset 으로 서브셋 (variable axes FILL/GRAD/opsz/wght 유지)
  4) 서브셋 결과를 다시 파싱해 요청한 ligature 가 전부 살아있는지 검증

주의 — 이 폰트 구조의 두 가지 함정:
  · ligature 규칙이 Extension lookup(GSUB type 7) 안에 감싸여 있다.
    type 4 만 찾으면 0건이 나온다. unwrap 이 필요하다.
  · cmap 이 대문자 codepoint 도 소문자 글리프에 매핑한다(대소문자 무시 ligature).
    글리프명 → codepoint 역매핑 시 대문자를 고르면 이름이 안 맞는다. 소문자 우선.

  단순히 `--text=<ligature 목록>` 으로 서브셋하면 layout closure 가 3,462 글리프를
  유지해 25% 밖에 줄지 않는다. 글리프를 직접 지정하고 `--no-layout-closure` 를
  써야 95% 감소한다.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB_SRC = ROOT / "teamplus-web/src"
FULL_FONT = ROOT / "tools/fonts/MaterialSymbolsOutlined.full.woff2"
OUT_FONT = ROOT / "teamplus-web/public/fonts/MaterialSymbolsOutlined.woff2"

COLLECTOR = ROOT / "scripts/collect-material-symbols.mjs"


def collect_ligatures() -> tuple[
    set[str], list[dict[str, object]], list[str], list[str], set[str]
]:
    """TypeScript AST 수집기를 실행해 후보와 rounded 직접 사용 위치를 반환한다."""
    result = subprocess.run(
        ["node", str(COLLECTOR), "--json", "--root", str(ROOT)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(f"Material Symbols AST 수집 실패: {detail}")

    report = json.loads(result.stdout)
    return (
        set(report["ligatures"]),
        report.get("roundedUsages", []),
        report.get("unlistedMenuIcons", []),
        report.get("invalidRuntimeIcons", []),
        set(report.get("runtimeLigatures", [])),
    )


def unwrap(lookup):
    """GSUB Extension(type 7) 을 풀어 (실제타입, subtable) 을 순회한다."""
    if lookup.LookupType == 7:
        for st in lookup.SubTable:
            yield st.ExtensionLookupType, st.ExtSubTable
    else:
        for st in lookup.SubTable:
            yield lookup.LookupType, st


def ligature_map(font) -> tuple[dict[str, str], dict[int, str]]:
    """ligature 이름(소문자) → 치환 결과 글리프명, 그리고 cmap."""
    cmap: dict[int, str] = font.getBestCmap() or {}
    # 소문자 codepoint 우선 — 이 폰트는 대문자 codepoint 도 같은 글리프에 매핑한다
    rev: dict[str, int] = {}
    for cp in sorted(cmap, reverse=True):
        rev.setdefault(cmap[cp], cp)

    out: dict[str, str] = {}
    for lk in font["GSUB"].table.LookupList.Lookup:
        for t, st in unwrap(lk):
            if t != 4 or not hasattr(st, "ligatures"):
                continue
            for first, ligs in st.ligatures.items():
                for lig in ligs:
                    seq = [first] + list(lig.Component)
                    try:
                        text = "".join(chr(rev[g]) for g in seq).lower()
                    except KeyError:
                        continue
                    out[text] = lig.LigGlyph
    return out, cmap


def validate_subset(found: dict[str, str]) -> int:
    if not OUT_FONT.exists():
        print(f"배포 서브셋이 없습니다: {OUT_FONT}", file=sys.stderr)
        return 1

    from fontTools.ttLib import TTFont

    sub = TTFont(OUT_FONT)
    sub_map, _ = ligature_map(sub)
    lost = sorted(set(found) - set(sub_map))
    if lost:
        print(f"\n  ✘ 유실된 아이콘 {len(lost)}개: {', '.join(lost[:20])}", file=sys.stderr)
        return 1
    print(f"  ✔ 요청 아이콘 {len(found)}개 ligature 전부 유지")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Material Symbols 서브셋 생성·검증")
    parser.add_argument(
        "--check",
        action="store_true",
        help="폰트를 재생성하지 않고 현재 배포 서브셋의 누락 여부만 검사",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        print("fontTools 가 필요합니다: pip install fonttools brotli", file=sys.stderr)
        return 1

    if not FULL_FONT.exists():
        print(f"원본 폰트가 없습니다: {FULL_FONT}", file=sys.stderr)
        print("Google Fonts 에서 Material Symbols Outlined variable woff2 를 받아 위 경로에 두세요.",
              file=sys.stderr)
        return 1

    try:
        (
            want,
            rounded_usages,
            unlisted_menu_icons,
            invalid_runtime_icons,
            runtime_ligatures,
        ) = collect_ligatures()
    except (RuntimeError, json.JSONDecodeError) as error:
        print(str(error), file=sys.stderr)
        return 1

    print(f"실사용 아이콘 {len(want)}개 수집")
    if rounded_usages:
        print("material-symbols-rounded 직접 사용은 공용 Icon으로 교체해야 합니다:", file=sys.stderr)
        for usage in rounded_usages:
            print(f"  {usage['file']}:{usage['line']}", file=sys.stderr)
        return 1
    if unlisted_menu_icons:
        print(
            "앱 메뉴 허용 목록에 없는 아이콘: " + ", ".join(unlisted_menu_icons),
            file=sys.stderr,
        )
        return 1
    if invalid_runtime_icons:
        print(
            "Material 매핑이 없는 앱 메뉴 아이콘: "
            + ", ".join(invalid_runtime_icons),
            file=sys.stderr,
        )
        return 1

    font = TTFont(FULL_FONT)
    lig_map, cmap = ligature_map(font)
    found = {w: lig_map[w] for w in want if w in lig_map}
    missing = sorted(want - set(found))
    missing_runtime = sorted(runtime_ligatures - set(found))
    print(f"  폰트에 존재 {len(found)}개 / 없음 {len(missing)}개")
    if missing:
        print(f"  ⚠ 폰트에 없는 이름(오타 또는 아이콘 아님): {', '.join(missing[:10])}")
    if missing_runtime:
        print(
            "  ✘ 원본 폰트에 없는 앱 메뉴 아이콘: " + ", ".join(missing_runtime),
            file=sys.stderr,
        )
        return 1

    if args.check:
        return validate_subset(found)

    # 필요 글리프 = 아이콘 글리프 + ligature 입력 문자 글리프
    need = set(found.values())
    chars: set[str] = set()
    for w in found:
        chars |= set(w)
    for c in chars:
        for cp in (ord(c), ord(c.upper())):
            if cp in cmap:
                need.add(cmap[cp])
    for g in (".notdef", "space", "CR"):
        if g in font.getGlyphOrder():
            need.add(g)

    print(f"  필요 글리프 {len(need)}개 / 전체 {font['maxp'].numGlyphs}개")

    OUT_FONT.parent.mkdir(parents=True, exist_ok=True)
    before = FULL_FONT.stat().st_size
    cmd = [
        "pyftsubset", str(FULL_FONT),
        f"--output-file={OUT_FONT}",
        "--flavor=woff2",
        f"--glyphs={','.join(sorted(need))}",
        "--layout-features=rlig,rclt",
        "--no-layout-closure",   # 없으면 closure 가 3,462 글리프를 유지해 25% 만 줄어든다
        "--no-hinting",
        "--drop-tables+=STAT",
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[-2000:], file=sys.stderr)
        return 1

    after = OUT_FONT.stat().st_size
    sub = TTFont(OUT_FONT)
    print(f"\n  {before // 1024}KB → {after // 1024}KB ({100 - after * 100 // before}% 감소)")
    print(f"  glyphs {font['maxp'].numGlyphs} → {sub['maxp'].numGlyphs}")
    axes = [a.axisTag for a in sub["fvar"].axes] if "fvar" in sub else []
    print(f"  variable axes: {axes}")

    # 검증 — 요청한 ligature 가 서브셋에 살아있는지
    return validate_subset(found)


if __name__ == "__main__":
    sys.exit(main())
