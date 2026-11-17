# -*- coding: utf-8 -*-
"""클래스픽 공유 페이지 생성기 — 카톡 미리보기(og) 용 짧은 주소

만드는 것
  a/{학원id}/index.html      → /#/p/{학원id} 로 이동 (쿼리 ?g= ?sc= 그대로 넘김)
  t/{강사 slug}/index.html   → /#/p/{학원id}/t/{강사}
  assets/og/*.png            1200x630 미리보기 이미지
  data/share.js              어떤 짧은 주소가 있는지 (공유 도구가 읽음)

학원·강사·수업 데이터(data/*.js)가 바뀌면 다시 실행하고 커밋한다.
  python scripts/build_share_pages.py
"""
import json, re, os, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

SITE = "https://classpick.vercel.app"
ROOT = Path(__file__).resolve().parent.parent
FONT_B = next((p for p in [r"C:\Windows\Fonts\malgunbd.ttf", "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf"] if os.path.exists(p)), None)
FONT_R = next((p for p in [r"C:\Windows\Fonts\malgun.ttf", "/usr/share/fonts/truetype/nanum/NanumGothic.ttf"] if os.path.exists(p)), None)
if not FONT_B:
    sys.exit("한글 폰트를 찾지 못했습니다")
SUBJ_ORDER = ["국어", "영어", "수학", "과학", "사회"]


def read(p):
    return (ROOT / p).read_text(encoding="utf-8")


def academies():
    out = []
    for m in re.finditer(r"\{\s*id:\s*\"([^\"]+)\",\s*name:\s*\"([^\"]+)\",\s*branch:\s*\"([^\"]*)\",\s*area:\s*\"([^\"]+)\"[^}]*?logo:\s*\"([^\"]*)\"", read("data/academies.js")):
        out.append(dict(id=m[1], name=m[2], branch=m[3], area=m[4], logo=m[5]))
    return out


def teachers():
    t = read("data/teachers.js")
    return json.loads(t[t.index("{"): t.rindex("}") + 1])


def courses():
    txt = read("data/courses.js")
    out = []
    for chunk in re.split(r"\{\s*id:\s*\"", txt)[1:]:
        g = lambda k: (re.search(r"\b" + k + r":\s*\"([^\"]*)\"", chunk) or [None, ""])[1]
        out.append(dict(ac=g("ac"), s=g("s"), t=g("t")))
    return [c for c in out if c["ac"]]


def font(sz, bold=True):
    return ImageFont.truetype(FONT_B if bold else FONT_R, sz)


def aurora(w=1200, h=630):
    im = Image.new("RGB", (w, h), (7, 12, 11))
    glow = Image.new("RGB", (w, h), (0, 0, 0))
    d = ImageDraw.Draw(glow)
    d.ellipse((-260, -380, 560, 380), fill=(15, 150, 122))
    d.ellipse((760, -300, 1500, 360), fill=(80, 60, 210))
    d.ellipse((420, 470, 980, 900), fill=(200, 80, 50))
    glow = glow.filter(ImageFilter.GaussianBlur(150))
    return Image.blend(im, glow, 0.62)


def circle(img, size):
    img = img.convert("RGB")
    w, h = img.size
    s = min(w, h)
    img = img.crop(((w - s) // 2, int((h - s) * 0.15), (w - s) // 2 + s, int((h - s) * 0.15) + s)).resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size * 4, size * 4), fill=255)
    out = Image.new("RGBA", (size, size))
    out.paste(img, (0, 0), mask.resize((size, size), Image.LANCZOS))
    return out


def brandmark(d, x, y):
    d.rounded_rectangle((x, y, x + 34, y + 34), 9, fill=(15, 118, 110))
    for i, ln in enumerate([18, 18, 11]):
        d.rounded_rectangle((x + 8, y + 9 + i * 6, x + 8 + ln, y + 11 + i * 6), 1, fill=(255, 255, 255))
    d.text((x + 46, y + 2), "클래스픽", font=font(24), fill=(255, 255, 255))


def og_academy(a, subs, n_teach, faces, path):
    im = aurora().convert("RGBA")
    d = ImageDraw.Draw(im)
    brandmark(d, 64, 56)
    d.text((64, 150), f"부산 {a['area']} · {' · '.join(subs)}", font=font(30, False), fill=(43, 227, 184))
    name = a["name"]
    fs = 112 if len(name) <= 6 else 88
    d.text((60, 196), name, font=font(fs), fill=(255, 255, 255))
    if a["branch"]:
        w = d.textlength(name, font=font(fs))
        d.text((60 + w + 18, 196 + fs - 50), a["branch"], font=font(38), fill=(160, 230, 214))
    d.text((64, 360), "수업 · 요일 · 시간 · 선생님 · 진도를 한 페이지에", font=font(32, False), fill=(214, 228, 224))
    d.text((64, 410), "수업을 담아 우리 아이 시간표까지 바로 짜 보세요", font=font(32, False), fill=(214, 228, 224))
    x = 64
    for f in faces[:7]:
        try:
            c = circle(Image.open(ROOT / f), 74)
            ring = Image.new("RGBA", (82, 82), (0, 0, 0, 0))
            ImageDraw.Draw(ring).ellipse((0, 0, 81, 81), fill=(7, 12, 11, 255))
            im.alpha_composite(ring, (x - 4, 506))
            im.alpha_composite(c, (x, 510))
            x += 58
        except Exception:
            pass
    if n_teach:
        d.text((x + 34, 528), f"선생님 {n_teach}명", font=font(28), fill=(255, 255, 255))
    path.parent.mkdir(parents=True, exist_ok=True)
    im.convert("RGB").save(path, quality=90)


def og_teacher(name, t, a, k, path):
    im = aurora().convert("RGBA")
    d = ImageDraw.Draw(im)
    brandmark(d, 64, 56)
    if t.get("photo") and (ROOT / t["photo"]).exists():
        ph = Image.open(ROOT / t["photo"]).convert("RGB")
        w, h = ph.size
        tw, th = 400, 533
        sc = max(tw / w, th / h)
        ph = ph.resize((int(w * sc), int(h * sc)), Image.LANCZOS)
        ph = ph.crop(((ph.width - tw) // 2, 0, (ph.width - tw) // 2 + tw, th))
        mask = Image.new("L", (tw, th), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, tw - 1, th - 1), 34, fill=255)
        im.paste(ph, (736, 48), mask)
    d.text((64, 160), f"{a['name']} {a['branch']} · {t.get('s', '')}".strip(), font=font(30, False), fill=(43, 227, 184))
    d.text((60, 206), name, font=font(116), fill=(255, 255, 255))
    d.text((64 + d.textlength(name, font=font(116)) + 14, 206 + 66), "선생님", font=font(40), fill=(160, 230, 214))
    q = t.get("quote") or ""
    if q:
        q = "“" + q + "”"
        if d.textlength(q, font=font(34)) > 640:
            q = q[:20] + "…”"
        d.text((64, 380), q, font=font(34), fill=(255, 255, 255))
    d.text((64, 520), f"수업 {k}개 · 요일별 시간표 보기", font=font(30, False), fill=(214, 228, 224))
    path.parent.mkdir(parents=True, exist_ok=True)
    im.convert("RGB").save(path, quality=90)


def stub(title, desc, img, target, canon):
    e = lambda s: s.replace("&", "&amp;").replace("\"", "&quot;").replace("<", "&lt;")
    return f"""<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="클래스픽">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:image" content="{SITE}/{img}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:url" content="{SITE}/{canon}">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="{SITE}/{canon}">
<script>var q=location.search.replace(/^\\?/,"");location.replace("/#/{target}"+(q?"?"+q:""));</script>
<style>html,body{{margin:0;height:100%;background:#070C0B;color:#E9F2EF;font-family:-apple-system,"Malgun Gothic",sans-serif}}body{{display:grid;place-items:center}}a{{color:#2BE3B8;font-weight:700}}</style>
</head><body><a href="/#/{target}">{e(title)} 보기</a></body></html>
"""


def main():
    A, T, CS = academies(), teachers(), courses()
    share = {"a": {}, "t": {}}
    for a in A:
        cs = [c for c in CS if c["ac"] == a["id"]]
        if not cs:
            continue
        subs = sorted({c["s"] for c in cs}, key=lambda s: SUBJ_ORDER.index(s) if s in SUBJ_ORDER else 99)
        names = sorted({c["t"] for c in cs if c["t"] and c["t"] in T}, key=lambda n: (SUBJ_ORDER.index(T[n].get("s")) if T[n].get("s") in SUBJ_ORDER else 99, n))
        img = f"assets/og/a-{a['id']}.png"
        og_academy(a, subs, len(names), [T[n]["photo"] for n in names if T[n].get("photo")], ROOT / img)
        full = (a["name"] + " " + a["branch"]).strip()
        (ROOT / "a" / a["id"]).mkdir(parents=True, exist_ok=True)
        (ROOT / "a" / a["id"] / "index.html").write_text(stub(f"{full} · 수업·시간표·선생님", f"부산 {a['area']} {' · '.join(subs)} · 요일·시간·선생님·진도를 한 페이지에. 수업을 담아 우리 아이 시간표를 짜 보세요.", img, f"p/{a['id']}", f"a/{a['id']}"), encoding="utf-8")
        share["a"][a["id"]] = 1
    for n, t in T.items():
        cs = [c for c in CS if c["t"] == n]
        if not cs or not t.get("photo"):
            continue
        acid = max({c["ac"] for c in cs}, key=lambda x: sum(1 for c in cs if c["ac"] == x))
        a = next((x for x in A if x["id"] == acid), None)
        if not a:
            continue
        slug = Path(t["photo"]).stem
        img = f"assets/og/t-{slug}.png"
        k = sum(1 for c in cs if c["ac"] == acid)
        og_teacher(n, t, a, k, ROOT / img)
        (ROOT / "t" / slug).mkdir(parents=True, exist_ok=True)
        (ROOT / "t" / slug / "index.html").write_text(stub(f"{n} 선생님 · {a['name']} {a['branch']}".strip(), (t.get("quote") or f"{t.get('s','')} 수업") + f" · 수업 {k}개의 요일·시간을 한눈에.", img, f"p/{acid}/t/{n}", f"t/{slug}"), encoding="utf-8")
        share["t"][n] = {"s": slug, "a": acid}
    # 기본 미리보기 (사이트 전체)
    im = aurora().convert("RGBA"); d = ImageDraw.Draw(im); brandmark(d, 64, 56)
    d.text((60, 190), "우리 동네 학원 시간표,", font=font(84), fill=(255, 255, 255))
    d.text((60, 300), "한 화면에서 고릅니다.", font=font(84), fill=(43, 227, 184))
    d.text((64, 450), "부산 센텀 · 사직 — 수업·요일·선생님을 비교하고 우리 아이 시간표까지", font=font(30, False), fill=(214, 228, 224))
    (ROOT / "assets/og").mkdir(parents=True, exist_ok=True)
    im.convert("RGB").save(ROOT / "assets/og/classpick.png", quality=90)
    (ROOT / "data/share.js").write_text("/* 자동 생성 — scripts/build_share_pages.py. 직접 고치지 말 것. */\nwindow.CP_SHARE = " + json.dumps(share, ensure_ascii=False) + ";\n", encoding="utf-8")
    print("학원", len(share["a"]), "· 강사", len(share["t"]))


if __name__ == "__main__":
    main()
