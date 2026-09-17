# 평가원 정답표 PDF → 홀수형/짝수형 정답 맵. 짝수형만 있는 시험지 PDF(2016~2021 수능)의 선지 순서에 맞는 정답을 확보한다.
# 산출: .tmp-gichul-bank/answer-keys.json  { examId: { odd: {"18": 3, …}, even: {…}, points: {"18": 2, …} } }
import fitz, json, re, os
ROOT = "d:/Desktop/2026project/nara"
MAN = json.load(open(f"{ROOT}/experiments/question-quality-20260721-corpus/pdfs/manifest.json", encoding="utf-8"))
CIRC = "①②③④⑤"
corpus = json.load(open(f"{ROOT}/src/data/exam-passages/passages.json", encoding="utf-8"))
exam_ids = {}
for c in corpus:
    if not c["examId"].startswith("ebsi_"):
        m = re.search(r"_(\d{6,8})(?:_[AB])?$", c["examId"])
        if m:
            exam_ids.setdefault(m.group(1), set()).add(c["examId"])

def parse_table(text):
    # 토큰 흐름: 번호 \n 정답 \n 배점 반복 — 표 헤더 뒤부터
    toks = [t.strip() for t in text.split("\n") if t.strip()]
    out, pts = {}, {}
    i = 0
    while i < len(toks) - 2:
        if re.fullmatch(r"\d{1,2}", toks[i]) and toks[i + 1] in CIRC and re.fullmatch(r"\d", toks[i + 2]):
            out[toks[i]] = CIRC.index(toks[i + 1]) + 1
            pts[toks[i]] = int(toks[i + 2])
            i += 3
        else:
            i += 1
    return out, pts

result = {}
for m in MAN:
    if m.get("kind") != "answer":
        continue
    seq = str(m.get("boardSeq", ""))
    exams = exam_ids.get(seq)
    if not exams:
        continue
    p = f"{ROOT}/experiments/question-quality-20260721-corpus/pdfs/{m['fileSeq']}.pdf"
    if not os.path.exists(p):
        continue
    try:
        d = fitz.open(p)
    except Exception as e:  # noqa
        print("open fail", seq, e); continue
    forms = {}
    for pg in d:
        t = pg.get_text("text")
        if "영어" not in t and "외국어" not in t:
            continue
        form = "odd" if "홀수" in t else "even" if "짝수" in t else "A" if re.search(r"[(（]\s*[AＡ]\s*형", t) else "B" if re.search(r"[(（]\s*[BＢ]\s*형", t) else "single"
        ans, pts = parse_table(t)
        if len(ans) >= 20:
            forms[form] = {"answers": ans, "points": pts}
    for ex in exams:
        # 같은 boardSeq 에 A/B 두 PDF 가 있으면 형 열을 **병합**한다(덮어쓰면 뒤에 온 B 만 남는다 — 2014 9월 실측)
        result.setdefault(ex, {}).update(forms)
print("exams with keys", len(result), "| forms:", sum(1 for v in result.values() for k in v))
json.dump(result, open(f"{ROOT}/.tmp-gichul-bank/answer-keys.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
# 대조: 코퍼스 answer 가 홀수형/짝수형 어느 쪽과 일치하는가
byexam = {}
for c in corpus:
    byexam.setdefault(c["examId"], []).append(c)
for ex, forms in sorted(result.items()):
    if "odd" not in forms or "even" not in forms:
        continue
    odd, even = forms["odd"]["answers"], forms["even"]["answers"]
    diff_q = [q for q in odd if q in even and odd[q] != even[q]]
    mo = me = 0
    for c in byexam.get(ex, []):
        if isinstance(c["answer"], int) and len(c["qNumbers"]) == 1:
            q = str(c["qNumbers"][0])
            if q in diff_q:
                if odd.get(q) == c["answer"]: mo += 1
                if even.get(q) == c["answer"]: me += 1
    print(f"{ex}: 홀/짝 상이 문항 {len(diff_q)} · 코퍼스 일치 홀 {mo} 짝 {me}")
