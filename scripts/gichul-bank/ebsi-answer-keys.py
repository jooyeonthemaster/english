# 학평(EBSi) 해설지 PDF(*_sol_*_eng_hsj.pdf) → 영어 정답표 추출 → answer-keys.json 에 examId:{single:{answers,points}} 병합
# 해설지는 여러 영역이 합본된 경우가 있어(2010 고1: 언어영역 정답이 1쪽) "외국어/영어 영역" 머리 **뒤**에 오는 첫 정답표를 채택한다.
# 대조: 코퍼스(passages.json) answer 와의 일치율을 시험지별로 출력 — 낮으면 표를 잘못 집은 것(채택 보류).
import fitz, json, re, glob, os
ROOT = "d:/Desktop/2026project/nara"
CIRC = "①②③④⑤"
corpus = json.load(open(f"{ROOT}/src/data/exam-passages/passages.json", encoding="utf-8"))
byexam = {}
for c in corpus:
    if c["examId"].startswith("ebsi_"):
        byexam.setdefault(c["examId"], []).append(c)
keys_path = f"{ROOT}/.tmp-gichul-bank/answer-keys.json"
keys = json.load(open(keys_path, encoding="utf-8")) if os.path.exists(keys_path) else {}

HEAD_RE = re.compile(r"(외국어\s*\(?\s*영어\s*\)?\s*영역|영어\s*영역|외국어영역)")

def tables_in(text):
    toks = [x.strip() for x in text.split("\n") if x.strip()]
    seqs = []
    cur = []
    expect = 1
    for j in range(len(toks) - 1):
        a, b = toks[j], toks[j + 1]
        if re.fullmatch(r"\d{1,2}", a) and b in CIRC:
            n = int(a)
            if n == expect:
                cur.append((n, CIRC.index(b) + 1)); expect += 1
            elif n == 1:
                if len(cur) >= 30: seqs.append(cur)
                cur = [(1, CIRC.index(b) + 1)]; expect = 2
    if len(cur) >= 30: seqs.append(cur)
    return seqs

def extract(pdf):
    d = fitz.open(pdf)
    full = ""
    for pg in d[:8]:
        full += pg.get_text("text") + "\n"
    # 영어 머리 이후 텍스트에서 첫 정답표. 머리가 없으면 전체에서 첫 표(단일 영역 해설지)
    # 영어 머리(외국어/영어 영역) **뒤**의 첫 정답표만 채택한다 — 합본 해설지는 1쪽이 언어영역 정답표라 머리 없는 채택은 오염이다.
    m = HEAD_RE.search(full)
    if not m:
        return None
    seqs = tables_in(full[m.start():])
    return seqs[0] if seqs else None

stats = {"exams": 0, "found": 0, "agree_hi": 0, "agree_lo": 0, "missing_sol": 0}
report = []
for ex, recs in sorted(byexam.items()):
    stats["exams"] += 1
    sols = glob.glob(f"{ROOT}/experiments/question-quality-20260721-corpus/pdfs_ebsi/{ex}_sol_*.pdf")
    if not sols:
        stats["missing_sol"] += 1; continue
    tab = None
    try:
        tab = extract(sols[0])
    except Exception as e:  # noqa
        report.append((ex, "open-fail", str(e)[:60])); continue
    if not tab:
        report.append((ex, "no-table", "")); continue
    stats["found"] += 1
    ans = {str(n): a for n, a in tab}
    # 코퍼스 대조(단일 문항만)
    tot = agree = 0
    for r in recs:
        if isinstance(r.get("answer"), int) and len(r["qNumbers"]) == 1:
            q = str(r["qNumbers"][0])
            if q in ans:
                tot += 1
                if ans[q] == r["answer"]: agree += 1
    rate = agree / tot if tot else 0
    # 영어 머리 뒤에서 잡은 표는 정본으로 채택한다. 일치율이 낮은 시험지(2010·2011 고1/고2 3월)는 코퍼스 정답이 틀린 것으로
    # 블라인드 풀이 함대가 확인했다(ebsi_go1_20100310-q44 등) — 낮은 일치율은 채택 보류 사유가 아니라 코퍼스 오염 신호다.
    keys[ex] = {"single": {"answers": ans, "points": {}}, "agreeRate": round(rate, 3), "compared": tot}
    if tot >= 5 and rate >= 0.6:
        stats["agree_hi"] += 1
    else:
        stats["agree_lo"] += 1
        report.append((ex, f"low-agree {agree}/{tot} — 채택(코퍼스 오염 의심)", f"table len {len(tab)}"))
json.dump(keys, open(keys_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(stats)
for r in report[:40]:
    print("  ", r)
# 불일치 문항 원장(채택된 시험지에서 코퍼스와 다른 것)
mism = []
for ex, recs in byexam.items():
    k = keys.get(ex, {}).get("single")
    if not k: continue
    for r in recs:
        if isinstance(r.get("answer"), int) and len(r["qNumbers"]) == 1:
            q = str(r["qNumbers"][0])
            if q in k["answers"] and k["answers"][q] != r["answer"]:
                mism.append((ex, q, r["answer"], k["answers"][q]))
print("corpus≠official(EBSi):", len(mism))
for m in mism[:30]: print("  ", m)
