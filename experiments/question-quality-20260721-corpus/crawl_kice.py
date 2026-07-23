# 평가원(KICE) 기출 시험지·정답표 전수 수집
#   목록(정적 HTML) → 행 파싱 → 영어영역 첨부 fileSeq 추출 → PDF 다운로드
# 사용: python crawl_kice.py [--dry] [--max-pages N]
import re, os, sys, json, time, html
import urllib.request

BASE = "https://www.suneung.re.kr"
LIST = BASE + "/boardCnts/list.do?type=default&page={page}&boardID={board}&m=0403&s=suneung"
DOWN = BASE + "/boardCnts/fileDown.do?fileSeq={seq}"
BOARDS = {
    "1500234": "수능",
    "1500235": "수능(구)",
    "1500236": "모평",
    "1500237": "예시문항",
}
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "pdfs")
DRY = "--dry" in sys.argv
MAXP = 40
if "--max-pages" in sys.argv:
    MAXP = int(sys.argv[sys.argv.index("--max-pages") + 1])

os.makedirs(OUT, exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (compatible; corpus-audit/1.0)"}

def fetch(url, binary=False, retries=3):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
                cd = r.headers.get("Content-Disposition", "")
                ct = r.headers.get("Content-Type", "")
                return (data if binary else data.decode("utf-8", "replace")), cd, ct
        except Exception as e:
            if i == retries - 1:
                return None, "", str(e)
            time.sleep(2 * (i + 1))
    return None, "", ""

ROW = re.compile(r"<tr\s+onMouseOver.*?</tr>", re.S)
TD = re.compile(r"<td[^>]*>(.*?)</td>", re.S)
FSEQ = re.compile(r"fn_fileDown\('([a-f0-9]{32})'\)")

def txt(h):
    return html.unescape(re.sub(r"<[^>]+>", " ", h)).strip()

# 첨부: onclick="fn_fileDown('HEX');" title='영어영역_문제지.pdf'
ATTACH = re.compile(r"fn_fileDown\('([a-f0-9]{32})'\)\s*;?\s*\"?\s*title='([^']*)'")

def parse_list(page_html):
    out = []
    for row in ROW.findall(page_html):
        tds = TD.findall(row)
        if len(tds) < 4:
            continue
        cells = [txt(t) for t in tds]
        attach = [{"seq": s, "name": html.unescape(n)} for s, n in ATTACH.findall(row)]
        if not attach:  # title 없는 변형 대비
            attach = [{"seq": s, "name": ""} for s in FSEQ.findall(row)]
        out.append({"cells": cells, "attach": attach})
    return out

def is_english_area(cells):
    """영역 셀이 정확히 '영어'인 행만. 제2외국어/한문 제외."""
    for c in cells[:5]:
        t = c.replace(" ", "")
        if t == "영어":
            return True
        if t in ("외국어", "외국어영역", "영어영역"):
            return True
    return False

def kind_of(name):
    n = name.replace(" ", "")
    if "정답" in n or "답안" in n:
        return "answer"
    if "문제" in n:
        return "paper"
    if "듣기" in n or "대본" in n:
        return "script"
    return "other"

def name_is_english(name):
    n = name.replace(" ", "")
    if "제2외국어" in n or "한문" in n:
        return False
    return ("영어" in n) or ("외국어" in n)

manifest = []
seen = set()
for board, label in BOARDS.items():
    for page in range(1, MAXP + 1):
        url = LIST.format(page=page, board=board)
        h, _, _ = fetch(url)
        if not h:
            print(f"[{label}] page {page} 실패")
            break
        rows = parse_list(h)
        if not rows:
            break
        newrows = 0
        for r in rows:
            if not is_english_area(r["cells"]):
                continue
            board_seq = r["cells"][0] if r["cells"] else ""
            year = r["cells"][1] if len(r["cells"]) > 1 else ""
            siheng = r["cells"][2] if len(r["cells"]) > 2 else ""
            for a in r["attach"]:
                seq, name = a["seq"], a["name"]
                if seq in seen:
                    continue
                if name and not name_is_english(name):
                    continue
                seen.add(seq)
                newrows += 1
                manifest.append({
                    "board": board, "boardLabel": label,
                    "boardSeq": board_seq, "year": year, "siheng": siheng,
                    "fileSeq": seq, "fileName": name, "kind": kind_of(name),
                    "url": DOWN.format(seq=seq),
                })
        print(f"[{label}] page {page}: 행 {len(rows)} / 영어첨부 신규 {newrows} (누적 {len(manifest)})")
        if len(rows) < 10:
            break

json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\n수집 대상 첨부 {len(manifest)}건 → pdfs/manifest.json")
kinds = {}
for m in manifest:
    kinds[m["kind"]] = kinds.get(m["kind"], 0) + 1
print("종류:", kinds)

if DRY:
    for m in manifest[:15]:
        print(f"  [{m['kind']}] {m['year']} {m['siheng']} seq={m['boardSeq']} | {m['fileName']}")
    sys.exit(0)

ok = fail = 0
for i, m in enumerate(manifest, 1):
    path = os.path.join(OUT, f"{m['fileSeq']}.pdf")
    if os.path.exists(path) and os.path.getsize(path) > 10000:
        ok += 1
        continue
    data, cd, ct = fetch(m["url"], binary=True)
    if not data or data[:4] != b"%PDF":
        fail += 1
        print(f"  ✗ {m['fileSeq']} {m['fileName'][:40]} ({ct[:40]})")
        continue
    open(path, "wb").write(data)
    ok += 1
    if i % 10 == 0:
        print(f"  … {i}/{len(manifest)} (성공 {ok} 실패 {fail})")
    time.sleep(0.3)
print(f"\n다운로드 완료: 성공 {ok} / 실패 {fail}")
