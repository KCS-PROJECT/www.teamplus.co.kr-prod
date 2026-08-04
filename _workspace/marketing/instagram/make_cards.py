# -*- coding: utf-8 -*-
"""팀플러스 인스타그램 정보성 카드뉴스 5장 생성 (1080x1350, 플랫 디자인)"""
from PIL import Image, ImageDraw, ImageFont
import os

W, H = 1080, 1350
NAVY = (31, 37, 54)        # #1f2536 rink-800
ICE = (47, 95, 255)        # #2f5fff ice-500
WHITE = (255, 255, 255)
BGLIGHT = (246, 248, 252)  # #f6f8fc
GRAY = (154, 164, 186)     # #9aa4ba
LINE = (229, 233, 242)     # #e5e9f2

FONT = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
# AppleSDGothicNeo.ttc indexes: 0=Regular, 1=Bold ... (weights vary); try named indexes
def f(size, bold=False):
    # index 1 is typically Bold in AppleSDGothicNeo.ttc, 0 Regular
    try:
        return ImageFont.truetype(FONT, size, index=1 if bold else 0)
    except Exception:
        return ImageFont.truetype(FONT, size)

OUT = os.path.dirname(os.path.abspath(__file__))

def draw_footer(d, dark_bg=False):
    color = WHITE if dark_bg else NAVY
    accent = WHITE if dark_bg else ICE
    d.rectangle([80, H-150, 140, H-144], fill=accent)
    d.text((80, H-120), "팀플러스  |  TeamPlus", font=f(34, bold=True), fill=color)

def multiline(d, xy, lines, font, fill, gap=18):
    x, y = xy
    for ln in lines:
        d.text((x, y), ln, font=font, fill=fill)
        bbox = font.getbbox(ln if ln else "가")
        y += (bbox[3]-bbox[1]) + gap
    return y

# ---------- Card 1: 후킹 ----------
img = Image.new("RGB", (W, H), NAVY)
d = ImageDraw.Draw(img)
d.text((80, 170), "아이스하키 클럽 운영,", font=f(76, bold=True), fill=WHITE)
d.text((80, 280), "90%는 이 세 가지가", font=f(76, bold=True), fill=WHITE)
d.text((80, 390), "정합니다", font=f(76, bold=True), fill=WHITE)
d.text((80, 540), "링크장에서 확인한 클럽 운영 원칙 3가지 →", font=f(38), fill=GRAY)
# 3 items
items = ["일정", "출석", "회비"]
y = 640
for i, it in enumerate(items, 1):
    d.rounded_rectangle([80, y, 1000, y+140], radius=24, fill=(41, 49, 70))
    d.text((130, y+38), f"{i}", font=f(58, bold=True), fill=ICE)
    d.text((230, y+40), it, font=f(54, bold=True), fill=WHITE)
    y += 175
draw_footer(d, dark_bg=True)
img.save(os.path.join(OUT, "card1.png"))

# ---------- Cards 2~4: 내용 ----------
contents = [
    ("01", "일정은 한 곳에만",
     ["단톡방, 엑셀, 구두 공지…", "채널이 두 개면 공지는", "반드시 하나 어긋납니다.", "", "일정을 보는 곳을 하나로 정하고,", "변경되면 그곳에서만 알리세요."]),
    ("02", "출석은 기록으로",
     ["“지난달에 몇 번 왔었지?”", "기억은 늘 부정확합니다.", "", "출석이 자동으로 쌓이면", "훈련 참여도, 회비 정산까지", "숫자로 이야기할 수 있습니다."]),
    ("03", "회비는 투명하게",
     ["금액, 마감일, 납부 현황이", "한눈에 보이기만 해도", "“저 냈는데요?” 실랑이가", "사라집니다.", "", "돈 이야기일수록 기록이 필요합니다."]),
]
for idx, (num, title, body) in enumerate(contents, start=2):
    img = Image.new("RGB", (W, H), WHITE)
    d = ImageDraw.Draw(img)
    d.text((80, 140), num, font=f(120, bold=True), fill=ICE)
    d.rectangle([80, 320, 200, 328], fill=ICE)
    d.text((80, 380), title, font=f(80, bold=True), fill=NAVY)
    multiline(d, (80, 560), body, f(48), (74, 84, 105), gap=26)
    draw_footer(d, dark_bg=False)
    img.save(os.path.join(OUT, f"card{idx}.png"))

# ---------- Card 5: CTA ----------
img = Image.new("RGB", (W, H), BGLIGHT)
d = ImageDraw.Draw(img)
d.rounded_rectangle([60, 120, 1020, 900], radius=32, fill=WHITE, outline=LINE, width=2)
d.text((120, 200), "이 세 가지를", font=f(70, bold=True), fill=NAVY)
d.text((120, 300), "앱 하나로 정리하려고", font=f(70, bold=True), fill=NAVY)
d.text((120, 400), "만들고 있습니다", font=f(70, bold=True), fill=NAVY)
d.rectangle([120, 540, 240, 548], fill=ICE)
multiline(d, (120, 590),
          ["유소년 아이스하키 클럽 관리 앱 팀플러스.", "지금은 첫 클럽과 함께", "매일 쓰는 기능부터 다듬는 중입니다."],
          f(44), (74, 84, 105), gap=24)
d.rounded_rectangle([60, 960, 1020, 1120], radius=32, fill=ICE)
d.text((120, 1010), "시즌 준비할 때 꺼내보게 → 저장해두세요", font=f(44, bold=True), fill=WHITE)
draw_footer(d, dark_bg=False)
img.save(os.path.join(OUT, "card5.png"))

print("saved:", [f"card{i}.png" for i in range(1, 6)])
