# 평가원 구회차(2004~2009) — 첨부가 HWP 뿐인 회차를 HWP 로 직접 뚫는다.
#   zip 다운로드 → 내부 .hwp 추출 → pyhwp(hwp5txt) 로 텍스트화 → parsed 용 텍스트 산출
import os, re, sys, json, io, time, zipfile, subprocess, tempfile
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PDFS = os.path.join(HERE, "pdfs")
HWPDIR = os.path.join(HERE, "hwp")
os.makedirs(HWPDIR, exist_ok=True)
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
    try:
        return n.encode("cp437").decode("cp949")
    except Exception:
        return n

def pick_hwp(names):
    """문제지 성격의 hwp 고르기 (정답/대본/답안 제외)."""
    hwps = [n for n in names if n.lower().endswith((".hwp", ".hwpx"))]
    if not hwps:
        return None
    def score(n):
        b = os.path.basename(kname(n))
        s = 0
        if "정답" in b or "답안" in b: s -= 100
        if "대본" in b or "듣기" in b: s -= 80
        if "해설" in b: s -= 60
        if "문제" in b: s += 40
        if "홀수" in b: s += 10
        return s
    best = max(hwps, key=score)
    return best if score(best) > -40 else None

def hwp_to_text(path):
    """pyhwp 의 hwp5txt CLI 우선, 실패 시 python API."""
    try:
        out = subprocess.run([sys.executable, "-m", "hwp5.hwp5txt", path],
                             capture_output=True, timeout=180)
        if out.returncode == 0 and out.stdout:
            return out.stdout.decode("utf-8", "replace")
    except Exception:
        pass
    try:
        from hwp5.xmlmodel import Hwp5File
        from hwp5.proc import _do_hwp5_xml  # noqa
    except Exception:
        pass
    # 최후: olefile 로 PrvText(미리보기 텍스트) 추출 — 전체는 아니지만 유용
    try:
        import olefile
        if olefile.isOleFile(path):
            ole = olefile.OleFileIO(path)
            if ole.exists("PrvText"):
                return ole.openstream("PrvText").read().decode("utf-16-le", "replace")
    except Exception:
        pass
    return ""

targets = [m for m in man if m["fileName"].lower().endswith(".zip")]
print(f"ZIP 첨부 {len(targets)}건 중 HWP 회차 탐색")
ok = fail = 0
results = []
for m in targets:
    seq = str(m.get("boardSeq"))
    outtxt = os.path.join(HWPDIR, f"{seq}.txt")
    if os.path.exists(outtxt) and os.path.getsize(outtxt) > 2000:
        ok += 1
        continue
    # 이미 PDF 확보된 회차는 건너뜀
    if os.path.exists(os.path.join(PDFS, m["fileSeq"] + ".pdf")):
        continue
    data = fetch(m["url"])
    if not data or data[:2] != b"PK":
        fail += 1
        continue
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except Exception:
        fail += 1
        continue
    pick = pick_hwp(z.namelist())
    if not pick:
        continue
    blob = z.read(pick)
    tmp = os.path.join(HWPDIR, f"{seq}.hwp")
    open(tmp, "wb").write(blob)
    txt = hwp_to_text(tmp)
    if len(txt.strip()) < 500:
        print(f"  ✗ {seq} {m['year']} {m['siheng']}: 텍스트 추출 빈약 ({len(txt.strip())}자) ← {os.path.basename(kname(pick))[:40]}")
        fail += 1
        continue
    open(outtxt, "w", encoding="utf-8").write(txt)
    ok += 1
    results.append({"boardSeq": seq, "year": m["year"], "siheng": m["siheng"],
                    "hwp": os.path.basename(kname(pick)), "chars": len(txt)})
    print(f"  ✓ {seq} {m['year']} {m['siheng']}: {len(txt):,}자 ← {os.path.basename(kname(pick))[:40]}")
    time.sleep(0.3)

json.dump(results, open(os.path.join(HWPDIR, "index.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"\nHWP 텍스트화: 성공 {ok} / 실패 {fail}")
