#!/usr/bin/env python3
"""
클래스픽 강사 사진·소개 동기화 — 원천: kyin.co.kr 공개 강사 카탈로그 (public_teacher_catalog)

kyin 관리자 화면에서 강사 사진·한줄소개·약력을 바꾸면, 이 스크립트를 한 번 돌리는 것으로
클래스픽 data/teachers.js 와 assets/teachers/*.webp 가 같은 내용으로 갱신된다.

  python scripts/sync_teachers_from_kyin.py

- 강좌 데이터(data/courses.js)에 등장하는 강사만 내보낸다 (시간표에 없는 강사는 자동으로 내려감).
- 사진은 가로 400px · 3:4 · webp 로 줄여 저장한다.
- 키: 환경변수 KYIN_ANON_KEY, 없으면 kyin 로컬 repo 의 .env 에서 VITE_SUPABASE_ANON_KEY 를 읽는다.
  (kyin 웹사이트 번들에 이미 공개된 anon 키이며, 공개 뷰만 읽는다.)
- 런타임(브라우저)에서 kyin 을 직접 부르지 않는 이유: kyin 응답이 느리거나 막히면 클래스픽 첫 화면이
  비는 문제가 있었고, 원본 사진이 수 MB 라 모바일 로딩이 느려진다. 그래서 빌드 시점 동기화로 한다.
- Windows 에서 인증서 오류가 나면: pip install truststore (시스템 인증서 저장소 사용)
"""
import hashlib
import io
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

from PIL import Image

try:  # Windows 시스템 인증서 저장소 사용 (있으면)
    import truststore
    truststore.inject_into_ssl()
except Exception:
    pass

ROOT = Path(__file__).resolve().parent.parent
KYIN_DIR = Path(os.environ.get("KYIN_DIR", r"C:\학원자료\운영\kyin"))
SUPA = "https://jahvkvmcefkjrrutxcvm.supabase.co"
OUT_JS = ROOT / "data" / "teachers.js"
OUT_IMG = ROOT / "assets" / "teachers"
WIDTH = 400

SLUG = {
    "차동우": "cha-dongwoo", "이영환": "lee-younghwan", "김형석": "kim-hyungseok",
    "윤훈관": "yoon-hungwan", "김민진": "kim-minjin", "강유나": "kang-yuna",
    "안성훈": "ahn-sunghoon", "정준호": "jung-junho", "김영온": "kim-youngon",
    "박연정": "park-yeonjung", "이준호": "lee-junho", "강필": "kang-pil",
    "김규생": "kim-gyusaeng", "권기현": "kwon-gihyun", "박승혜": "park-seunghye",
}
# 학원 자사 홍보로 읽힐 수 있는 표현은 중립 표현으로 바꾼다
NEUTRAL = [(r"우리\s*학원", "학원"), (r"저희\s*학원", "학원"), (r"교육\s*[iI][nN]\s*", ""), (r"교육인\s*학원", "")]


def anon_key():
    k = os.environ.get("KYIN_ANON_KEY")
    if k:
        return k.strip()
    for name in (".env.local", ".env", ".env.production"):
        p = KYIN_DIR / name
        if p.exists():
            for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
                if line.startswith("VITE_SUPABASE_ANON_KEY="):
                    return line.split("=", 1)[1].strip().strip('"')
    sys.exit("KYIN_ANON_KEY 를 찾지 못했습니다")


def get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {"User-Agent": "classpick-sync"})
    return urllib.request.urlopen(req, timeout=30).read()


def neutral(s):
    s = (s or "").strip()
    for a, b in NEUTRAL:
        s = re.sub(a, b, s)
    return re.sub(r"\s{2,}", " ", s).strip()


def to_webp(data, path):
    im = Image.open(io.BytesIO(data)).convert("RGBA")
    bg = Image.new("RGBA", im.size, (236, 238, 240, 255))
    bg.alpha_composite(im)
    im = bg.convert("RGB")
    w, h = im.size  # 3:4 로 맞춘다 (위쪽 기준 — 얼굴이 잘리지 않게)
    if h / w > 4 / 3:
        im = im.crop((0, 0, w, int(w * 4 / 3)))
    elif h / w < 4 / 3:
        nw = int(h * 3 / 4)
        im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    im.resize((WIDTH, int(WIDTH * 4 / 3)), Image.LANCZOS).save(path, "WEBP", quality=78, method=6)


def main():
    names = sorted(set(re.findall(r'\bt:"([^"]+)"', (ROOT / "data" / "courses.js").read_text(encoding="utf-8"))))
    key = anon_key()
    rows = json.loads(get(
        SUPA + "/rest/v1/public_teacher_catalog?select=name,subject,quote,bio,photo_url,photo_display_url,branch"
        "&is_public=eq.true&status=eq.active",
        {"apikey": key, "Authorization": "Bearer " + key, "User-Agent": "classpick-sync"}))
    by = {r["name"].strip(): r for r in rows}
    OUT_IMG.mkdir(parents=True, exist_ok=True)
    out, missing, nophoto = {}, [], []
    for n in names:
        r = by.get(n)
        if not r:
            missing.append(n)
            continue
        src = r.get("photo_display_url") or r.get("photo_url") or ""
        photo = ""
        if src:
            local = KYIN_DIR / "public" / src.lstrip("/") if src.startswith("/") else None
            data = local.read_bytes() if local and local.exists() else get(src if src.startswith("http") else "https://kyin.co.kr" + src)
            fn = (SLUG.get(n) or "t-" + hashlib.sha1(n.encode()).hexdigest()[:10]) + ".webp"
            to_webp(data, OUT_IMG / fn)
            photo = "assets/teachers/" + fn
        else:
            nophoto.append(n)
        out[n] = {
            "s": r.get("subject") or "",
            "quote": neutral(r.get("quote")),
            "bio": neutral(r.get("bio")),
            "photo": photo,
        }
    js = ("/* 자동 생성 — scripts/sync_teachers_from_kyin.py (원천: kyin.co.kr 공개 강사 카탈로그). 직접 고치지 말 것. */\n"
          "window.CP_TEACHERS = " + json.dumps(out, ensure_ascii=False, indent=1) + ";\n")
    OUT_JS.write_text(js, encoding="utf-8")
    print(f"[teachers] {len(out)}명 저장 · 사진 {len(out) - len(nophoto)}장")
    if missing:
        print("[teachers] kyin 카탈로그에 없는 이름:", ", ".join(missing))
    if nophoto:
        print("[teachers] 사진 없음:", ", ".join(nophoto))


if __name__ == "__main__":
    main()
