# EBSi 학력평가 영어 문제지·해설지 전수 수집
#   목록 AJAX(POST) → goDownLoadP/H 상대경로 추출 → wdown CDN 다운로드
# 사용: python crawl_ebsi.py [--dry] [--years 2011-2026]
import re, os, sys, json, time, html
import urllib.request, urllib.parse

AJAX = "https://www.ebsi.co.kr/ebs/xip/xipc/previousPaperListAjax.ajax"
CDN = "https://wdown.ebsi.co.kr/W61001/01exam"
TARGETS = {"D100": "go1", "D200": "go2", "D300": "go3"}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pdfs_ebsi")
os.makedirs(OUT, exist_ok=True)
DRY = "--dry" in sys.argv

yr = "2011-2026"
if "--years" in sys.argv:
    yr = sys.argv[sys.argv.index("--years") + 1]
Y0, Y1 = [int(x) for x in yr.split("-")]

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"

def post(target, year, page):
    body = (
        f"targetCd={target}&yearList={year}"
        "&monthList=03%2C04%2C05%2C06%2C07%2C08%2C09%2C10%2C11%2C12"
        "&arOrd=1%2C2%2C3%2C4%2C5%2C%2C6%2C7%2C8"
        "&subjIdList=firstEnter&sort=recent&paperId=&paperNo=&lvl="
        f"&year={year}&monthAll=all"
        "&korArOrd=1&mathArOrd=2&engArOrd=3&hisArOrd=4&srch1ArOrd=5&srch2ArOrd=6"
        f"&currentPage={page}"
    ).encode()
    req = urllib.request.Request(AJAX, data=body, headers={
        "X-Requested-With": "XMLHttpRequest",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Referer": f"https://www.ebsi.co.kr/ebs/xip/xipc/previousPaperList.ebs?targetCd={target}",
        "User-Agent": UA,
    })
    for i in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except Exception:
            time.sleep(2 * (i + 1))
    return ""

BOX = re.compile(r"<div[^>]*class=\"[^\"]*qus_box[^\"]*\".*?(?=<div[^>]*class=\"[^\"]*qus_box|\Z)", re.S)
DL_P = re.compile(r"goDownLoadP\('([^']+)'")
DL_H = re.compile(r"goDownLoadH\('([^']+)'")
TOT = re.compile(r'<em class="tot">\s*([0-9,]+)\s*개')

def txt(h):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h))).strip()

def is_hakpyeong(label):
    return "학평" in label or "학력평가" in label

def is_english(path, label):
    p = path.lower()
    if re.search(r"/(eng|eng1|eng_1)[_/]", p) or "_eng" in p or "eng_" in p.split("/")[-1]:
        return True
    return "영어" in label

manifest = []
seen = set()
for target, grade in TARGETS.items():
    for year in range(Y1, Y0 - 1, -1):
        h1 = post(target, year, 1)
        if not h1:
            continue
        m = TOT.search(h1)
        tot = int(m.group(1).replace(",", "")) if m else 0
        pages = max(1, (tot + 14) // 15)
        got = 0
        for page in range(1, pages + 1):
            h = h1 if page == 1 else post(target, year, page)
            if not h:
                break
            for box in BOX.findall(h):
                label = txt(box)[:120]
                if not is_hakpyeong(label):
                    continue
                for kind, rx in (("paper", DL_P), ("sol", DL_H)):
                    for rel in rx.findall(box):
                        if not is_english(rel, label):
                            continue
                        if rel in seen:
                            continue
                        seen.add(rel)
                        got += 1
                        # 신형: /20260324/go1/eng_mun_XXXX.pdf
                        # 구형: /20101123/eng_mun.pdf  (학년 디렉터리 없음 → 크롤 루프의 학년 사용)
                        dm = re.search(r"/(\d{8})/(go\d)/", rel)
                        if dm:
                            date, gdir = dm.group(1), dm.group(2)
                        else:
                            dm2 = re.search(r"/(\d{8})\d?/", rel)
                            date = dm2.group(1) if dm2 else ""
                            gdir = grade
                        manifest.append({
                            "grade": grade, "year": year, "kind": kind,
                            "date": date, "gradeDir": gdir,
                            "label": label[:80], "rel": rel,
                            "examId": f"ebsi_{gdir}_{date}" if date else "",
                            "url": CDN + rel,
                        })
            time.sleep(0.25)
        print(f"[{grade} {year}] tot={tot} pages={pages} 영어학평 신규 {got} (누적 {len(manifest)})")

mpath = os.path.join(OUT, "manifest.json")
prev = []
if os.path.exists(mpath):
    try: prev = json.load(open(mpath, encoding="utf-8"))
    except Exception: prev = []
merged = {m["rel"]: m for m in prev}
for m in manifest: merged[m["rel"]] = m
manifest = list(merged.values())
json.dump(manifest, open(mpath, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
kinds = {}
for m in manifest:
    kinds[m["kind"]] = kinds.get(m["kind"], 0) + 1
exams = len({m["examId"] for m in manifest if m["examId"]})
print(f"\n대상 {len(manifest)}건 / 시험지 {exams}개 / 종류 {kinds} → pdfs_ebsi/manifest.json")

if DRY:
    for m in manifest[:12]:
        print(f"  [{m['kind']}] {m['examId']} | {m['rel']}")
    sys.exit(0)

ok = fail = 0
for i, m in enumerate(manifest, 1):
    flat = m['rel'].strip('/').replace('/', '_')
    name = f"{m['examId'] or 'x'}_{m['kind']}_{flat}"
    path = os.path.join(OUT, name)
    if os.path.exists(path) and os.path.getsize(path) > 10000:
        ok += 1
        continue
    try:
        req = urllib.request.Request(m["url"], headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=90) as r:
            data = r.read()
    except Exception as e:
        fail += 1
        print(f"  ✗ {name[:50]} {e}")
        continue
    if data[:4] != b"%PDF":
        fail += 1
        continue
    open(path, "wb").write(data)
    ok += 1
    if i % 20 == 0:
        print(f"  … {i}/{len(manifest)} (성공 {ok} 실패 {fail})")
    time.sleep(0.25)
print(f"\n다운로드 완료: 성공 {ok} / 실패 {fail}")
