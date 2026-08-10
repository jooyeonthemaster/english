# 평가원 ZIP 첨부(구회차 문제지) 다운로드 → 내부 PDF 추출 → pdfs/{fileSeq}.pdf 로 정규화
import os, sys, json, io, time, zipfile, re
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PDFS = os.path.join(HERE, "pdfs")
man = json.load(open(os.path.join(PDFS, "manifest.json"), encoding="utf-8"))
UA = {"User-Agent": "Mozilla/5.0 (compatible; corpus-audit/1.0)"}

def fetch(url):
    for i in range(3):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read()
        except Exception:
            time.sleep(2 * (i + 1))
    return None

def kname(n):
    """zip 엔트리명이 CP949 로 저장돼 있으면 복원 (zipfile 은 flag 미설정 시 cp437 로 디코드)."""
    try:
        return n.encode("cp437").decode("cp949")
    except Exception:
        return n

def pick_paper(names):
    """zip 내부에서 문제지 PDF 고르기 (홀수형 우선, 정답/대본 제외)."""
    pdfs = [n for n in names if n.lower().endswith(".pdf")]
    if not pdfs:
        return None
    def score(n):
        b = os.path.basename(kname(n))
        s = 0
        if "정답" in b or "답안" in b or "답" == b[:1]: s -= 100
        if "대본" in b or "듣기" in b or "음원" in b: s -= 80
        if "해설" in b: s -= 60
        if "문제" in b: s += 40
        if "홀수" in b: s += 10
        if "짝수" in b: s -= 5
        return s
    best = max(pdfs, key=score)
    return best if score(best) > -40 else None

targets = [m for m in man if m["fileName"].lower().endswith(".zip")]
print(f"ZIP 첨부 {len(targets)}건")
ok = fail = skip = 0
for m in targets:
    out = os.path.join(PDFS, m["fileSeq"] + ".pdf")
    if os.path.exists(out) and os.path.getsize(out) > 10000 and "--force" not in sys.argv:
        skip += 1
        continue
    data = fetch(m["url"])
    if not data:
        fail += 1
        continue
    if data[:2] != b"PK":
        fail += 1
        continue
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except Exception:
        fail += 1
        continue
    names = z.namelist()
    pick = pick_paper(names)
    if not pick:
        print(f"  - {m['fileName'][:26]}: 문제지 PDF 없음 ({[os.path.basename(kname(n))[:22] for n in names[:3]]})")
        fail += 1
        continue
    blob = z.read(pick)
    if blob[:4] != b"%PDF":
        fail += 1
        continue
    open(out, "wb").write(blob)
    ok += 1
    print(f"  ✓ {m['year']} {m['siheng']} seq={m['boardSeq']} ← {os.path.basename(kname(pick))[:44]}")
    time.sleep(0.3)
print(f"\nZIP 추출: 성공 {ok} / 실패 {fail} / 스킵 {skip}")
