# 해설지 전수 채굴 — "④ strengthened → destroyed" 형태의 교정 원장을 만든다.
# 이것이 최종 정답(ground truth)이다. AI 추측을 전부 대체한다.
import os, re, sys, glob, json
import fitz

HERE = os.path.dirname(os.path.abspath(__file__))
SOLDIR = os.path.join(HERE, "pdfs_ebsi")
OUT = os.path.join(HERE, "solution-corrections.json")

# ④ strengthened →destroyed  /  ②believe → challenge  /  (e) rapid → slow
ARROW = re.compile(
    r"(?:([①-⑤])|\(([a-e])\))\s*([A-Za-z][A-Za-z'’\- ]{0,40}?)\s*[→⇒]\s*([A-Za-z][A-Za-z'’\- ]{0,40})"
)
QHEAD = re.compile(r"(?m)^\s*(\d{1,2})\s*[.．]")

def pdf_text(p):
    try:
        doc = fitz.open(p)
        return "\n".join(pg.get_text("text") for pg in doc)
    except Exception:
        return ""

def clean(s):
    return re.sub(r"\s+", " ", s).strip(" .,·")

rows = []
files = sorted(glob.glob(os.path.join(SOLDIR, "*_sol_*.pdf")))
print(f"해설지 {len(files)}개 채굴")
for f in files:
    base = os.path.basename(f)
    m = re.match(r"(ebsi_go\d_\d{8})_sol_", base)
    exam = m.group(1) if m else ""
    text = pdf_text(f)
    if not text:
        continue
    # 문항 경계로 잘라서, 각 구간 안의 화살표 교정을 그 문항에 귀속
    heads = [(mm.start(), int(mm.group(1))) for mm in QHEAD.finditer(text)]
    heads = [h for h in heads if 18 <= h[1] <= 45]
    for i, (pos, qn) in enumerate(heads):
        end = heads[i + 1][0] if i + 1 < len(heads) else min(len(text), pos + 3000)
        seg = text[pos:end]
        for mm in ARROW.finditer(seg):
            mk = mm.group(1) or mm.group(2)
            frm, to = clean(mm.group(3)), clean(mm.group(4))
            if not frm or not to or frm.lower() == to.lower():
                continue
            if len(frm) < 2 or len(to) < 2:
                continue
            rows.append({
                "examId": exam, "qNum": qn, "marker": mk,
                "from": frm, "to": to, "source": base,
            })

# 중복 제거 (같은 exam/q/marker)
uniq = {}
for r in rows:
    k = (r["examId"], r["qNum"], r["marker"], r["from"].lower())
    if k not in uniq:
        uniq[k] = r
rows = list(uniq.values())

json.dump(rows, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"교정 원장 {len(rows)}건 → solution-corrections.json")
byq = {}
for r in rows:
    byq[r["qNum"]] = byq.get(r["qNum"], 0) + 1
print("문항번호 분포:", dict(sorted(byq.items())))
print("\n샘플:")
for r in rows[:12]:
    print(f"  {r['examId']} q{r['qNum']} {r['marker']} {r['from']} → {r['to']}")
