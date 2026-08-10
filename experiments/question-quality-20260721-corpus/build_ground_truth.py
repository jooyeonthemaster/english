# 대조 엔진: 파싱된 시험지 + 코퍼스(정답번호) → 오염 단어 확정 원장
#
# 원리: 코퍼스 레코드에는 answer(정답 선지 번호)가 있고, 파서는 각 마커의 밑줄 구간을 준다.
#       answer=4 → ④ 구간이 곧 "심긴 오답"이 있는 자리. 추측이 사라진다.
#
# 산출: ground-truth.json  [{corpusId, examId, qNum, kind, answer, markerSpan,
#                            plantedCandidate, corpusHasSpan, note}]
import json, os, re, sys, glob

ROOT = "d:/Desktop/2026project/nara"
CORPUS = os.path.join(ROOT, "src/data/exam-passages/passages.json")
PARSED_DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "experiments/question-quality-20260721-corpus/parsed")
OUT = os.path.join(ROOT, "experiments/question-quality-20260721-corpus/ground-truth.json")

MARK = "①②③④⑤"
LETTERS = "abcde"

corpus = json.load(open(CORPUS, encoding="utf-8"))
by_exam = {}
for c in corpus:
    by_exam.setdefault(c["examId"], []).append(c)

def qnums_of(rec):
    return rec.get("qNumbers") or []

def norm_words(s):
    return re.sub(r"[^A-Za-z]+", " ", s).lower().strip()

rows = []
missing = []
for pf in sorted(glob.glob(os.path.join(PARSED_DIR, "*.json"))):
    parsed = json.load(open(pf, encoding="utf-8"))
    exam_id = parsed.get("examId")
    cands = by_exam.get(exam_id)
    if not cands:
        missing.append((exam_id, os.path.basename(pf)))
        continue
    qmap = {}
    for q in parsed["questions"]:
        qmap[q["qNum"]] = q
    for rec in cands:
        qs = qnums_of(rec)
        if not qs:
            continue
        # 어법/어휘/장문어휘만 대상
        if not (rec["type"] in ("어법", "어휘") or rec["type"].startswith("장문")):
            continue
        # 해당 문항 찾기 — 장문은 어휘 문항 번호(보통 두 번째)를 쓴다
        q = None
        for n in qs:
            cand = qmap.get(n)
            if cand and cand["kind"] in ("grammar_underline", "vocab_underline", "vocab_letter", "box_choice"):
                q = cand
                break
        if q is None:
            continue
        ans = rec.get("answer")
        if not isinstance(ans, int) or not (1 <= ans <= 5):
            continue
        span = None
        if q["kind"] == "vocab_letter":
            span = (q.get("letterMarkers") or {}).get(LETTERS[ans - 1])
        elif q["kind"] in ("grammar_underline", "vocab_underline"):
            span = (q.get("markers") or {}).get(MARK[ans - 1])
        if not span:
            continue
        # 코퍼스 본문에 그 구간이 실제로 있는가 (있으면 = 오염 잔존)
        text = rec["text"]
        first = span.split()[0]
        has_span = norm_words(span)[:40] in norm_words(text)
        rows.append({
            "corpusId": rec["id"],
            "examId": exam_id,
            "qNum": q["qNum"],
            "type": rec["type"],
            "kind": q["kind"],
            "answer": ans,
            "markerSpan": span,
            "plantedCandidate": first,
            "corpusHasSpan": has_span,
            "corpusRestored": bool(rec.get("plantedError")),
            "priorFix": (rec.get("plantedError") or {}).get("planted"),
            "priorTo": (rec.get("plantedError") or {}).get("original"),
        })

json.dump(rows, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"대조 원장 {len(rows)}건 → {OUT}")
if missing:
    print(f"코퍼스에 없는 시험지 {len(missing)}개: {missing[:5]}")

hit = [r for r in rows if r["corpusHasSpan"]]
print(f"  코퍼스 본문에 밑줄 구간 실재: {len(hit)}  (= 오염 잔존 또는 정상 구간)")
prior = [r for r in rows if r["corpusRestored"]]
print(f"  내가 이미 복원한 건: {len(prior)}")
agree = [r for r in prior if r["priorFix"] and norm_words(r["priorFix"]) in norm_words(r["markerSpan"])]
print(f"    그중 밑줄 구간과 위치 일치: {len(agree)} / 불일치: {len(prior) - len(agree)}")
for r in prior:
    if not (r["priorFix"] and norm_words(r["priorFix"]) in norm_words(r["markerSpan"])):
        print(f"    ✗ {r['corpusId']} 정답{r['answer']} 구간=\"{r['markerSpan']}\" 내가고친것=\"{r['priorFix']}\"")
