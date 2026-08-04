# -*- coding: utf-8 -*-
"""인스타그램 카드(1080x1350) 생성기 — JSON 스펙을 받아 카드 PNG를 뽑는다.

사용: python3 cards_gen.py spec.json outdir

spec.json 예시:
{
  "brand": "팀플러스 | TeamPlus",
  "theme": "teamplus",
  "cards": [
    {"type": "cover",   "headline": "두 줄까지\\n들어가는 제목", "sub": "보조 문구", "bullets": ["일정", "출석", "회비"]},
    {"type": "content", "num": "01", "headline": "소제목", "body": ["본문 줄1", "본문 줄2"]},
    {"type": "cta",     "headline": "마지막 카드\\n제목", "sub": "설명", "button": "저장해두세요"}
  ]
}
"""
import json
import os
import sys
from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1350
FONT = "/System/Library/Fonts/AppleSDGothicNeo.ttc"

THEMES = {
    # 팀플러스: DESIGN.md 토큰 (rink-800 / ice-500 / wbg)
    "teamplus": {
        "dark": (31, 37, 54),
        "accent": (47, 95, 255),
        "bg": (246, 248, 252),
        "card": (255, 255, 255),
        "line": (229, 233, 242),
        "text": (31, 37, 54),
        "muted": (74, 84, 105),
        "dim": (154, 164, 186),
        "chip": (41, 49, 70),
    },
    # 셀러이즈: 커머스 도구 톤 (딥 차콜 + 앰버)
    "sellerease": {
        "dark": (24, 28, 36),
        "accent": (245, 158, 11),
        "bg": (247, 247, 245),
        "card": (255, 255, 255),
        "line": (231, 231, 227),
        "text": (24, 28, 36),
        "muted": (77, 82, 92),
        "dim": (150, 154, 163),
        "chip": (35, 40, 50),
    },
}


def f(size, bold=False):
    try:
        return ImageFont.truetype(FONT, size, index=1 if bold else 0)
    except Exception:
        return ImageFont.truetype(FONT, size)


def line_h(font, sample="가"):
    b = font.getbbox(sample)
    return b[3] - b[1]


def draw_lines(d, xy, lines, font, fill, gap):
    x, y = xy
    for ln in lines:
        if ln:
            d.text((x, y), ln, font=font, fill=fill)
        y += line_h(font) + gap
    return y


def footer(d, t, brand, dark_bg):
    color = (255, 255, 255) if dark_bg else t["text"]
    accent = (255, 255, 255) if dark_bg else t["accent"]
    d.rectangle([80, H - 150, 140, H - 144], fill=accent)
    d.text((80, H - 120), brand, font=f(34, bold=True), fill=color)


def wrap(text, font, max_w):
    """공백 기준 줄바꿈. 명시적 \n 은 유지."""
    out = []
    for para in text.split("\n"):
        words, cur = para.split(" "), ""
        for w in words:
            test = (cur + " " + w).strip()
            if font.getlength(test) <= max_w or not cur:
                cur = test
            else:
                out.append(cur)
                cur = w
        out.append(cur)
    return out


def card_cover(c, t, brand):
    img = Image.new("RGB", (W, H), t["dark"])
    d = ImageDraw.Draw(img)
    hf = f(74, bold=True)
    lines = wrap(c.get("headline", ""), hf, W - 160)[:3]
    y = draw_lines(d, (80, 170), lines, hf, (255, 255, 255), 34)
    if c.get("sub"):
        y += 40
        y = draw_lines(d, (80, y), wrap(c["sub"], f(38), W - 160)[:2], f(38), t["dim"], 16)
    bullets = c.get("bullets") or []
    if bullets:
        y = max(y + 60, 640)
        gap = 175 if len(bullets) <= 3 else 130
        box_h = 140 if len(bullets) <= 3 else 100
        for i, it in enumerate(bullets[:4], 1):
            d.rounded_rectangle([80, y, 1000, y + box_h], radius=24, fill=t["chip"])
            d.text((130, y + box_h // 2 - 30), str(i), font=f(52, bold=True), fill=t["accent"])
            d.text((230, y + box_h // 2 - 28), it, font=f(50, bold=True), fill=(255, 255, 255))
            y += gap
    footer(d, t, brand, True)
    return img


def card_content(c, t, brand):
    img = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(img)
    y = 140
    if c.get("num"):
        d.text((80, y), c["num"], font=f(118, bold=True), fill=t["accent"])
        y += 180
    d.rectangle([80, y, 200, y + 8], fill=t["accent"])
    y += 60
    hf = f(76, bold=True)
    y = draw_lines(d, (80, y), wrap(c.get("headline", ""), hf, W - 160)[:2], hf, t["text"], 22)
    y += 60
    body = c.get("body") or []
    bf = f(46)
    flat = []
    for b in body:
        flat.extend(wrap(b, bf, W - 160) if b else [""])
    draw_lines(d, (80, y), flat[:10], bf, t["muted"], 26)
    footer(d, t, brand, False)
    return img


def card_cta(c, t, brand):
    img = Image.new("RGB", (W, H), t["bg"])
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([60, 120, 1020, 900], radius=32, fill=t["card"], outline=t["line"], width=2)
    hf = f(66, bold=True)
    y = draw_lines(d, (120, 200), wrap(c.get("headline", ""), hf, W - 280)[:3], hf, t["text"], 30)
    y += 40
    d.rectangle([120, y, 240, y + 8], fill=t["accent"])
    y += 60
    if c.get("sub"):
        draw_lines(d, (120, y), wrap(c["sub"], f(42), W - 280)[:5], f(42), t["muted"], 24)
    if c.get("button"):
        d.rounded_rectangle([60, 960, 1020, 1120], radius=32, fill=t["accent"])
        bt = f(44, bold=True)
        label = c["button"]
        tw = bt.getlength(label)
        d.text(((W - tw) / 2, 1010), label, font=bt, fill=(255, 255, 255))
    footer(d, t, brand, False)
    return img


BUILDERS = {"cover": card_cover, "content": card_content, "cta": card_cta}


def main():
    spec_path, outdir = sys.argv[1], sys.argv[2]
    spec = json.load(open(spec_path, encoding="utf-8"))
    t = THEMES[spec.get("theme", "teamplus")]
    brand = spec.get("brand", "")
    os.makedirs(outdir, exist_ok=True)
    paths = []
    for i, c in enumerate(spec["cards"], 1):
        img = BUILDERS[c.get("type", "content")](c, t, brand)
        p = os.path.join(outdir, f"card{i}.png")
        img.save(p)
        paths.append(p)
    print(json.dumps(paths, ensure_ascii=False))


if __name__ == "__main__":
    main()
