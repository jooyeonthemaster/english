# 영어 problems.json 산출 — 국어 코퍼스(problems.json) 형상에 맞춘 문제 원문 자산
#
# 국어 형상: { "<passageId>": { rawProblems: [{qNum, stem, choices, point, bogi}], answerKey: {...} } }
# 영어 확장: markers(밑줄 ①~⑤ 단어), letterMarkers((a)~(e)), kind(문항 유형)
#
# 산출: src/data/exam-passages/problems.json  (앱 번들과 같은 위치, minified)
import os, re, json, glob

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = "d:/Desktop/2026project/nara"
PARSED = os.path.join(HERE, "parsed")
CORPUS = os.path.join(ROOT, "src/data/exam-passages/passages.json")
OUT = os.path.join(ROOT, "src/data/exam-passages/problems.json")

corpus = json.load(open(CORPUS, encoding="utf-8"))
# passageId -> (examId, qNumbers)
by_exam = {}
for c in corpus:
    by_exam.setdefault(c["examId"], []).append(c)

problems = {}
stats = {"passages": 0, "withQuestions": 0, "withMarkers": 0, "exams": 0}
for pf in sorted(glob.glob(os.path.join(PARSED, "*.json"))):
    parsed = json.load(open(pf, encoding="utf-8"))
    exam_id = parsed["examId"]
    recs = by_exam.get(exam_id)
    if not recs:
        continue
    stats["exams"] += 1
    qmap = {q["qNum"]: q for q in parsed["questions"]}
    for rec in recs:
        stats["passages"] += 1
        qs = rec.get("qNumbers") or []
        raw = []
        for n in qs:
            q = qmap.get(n)
            if not q:
                continue
            item = {
                "qNum": n,
                "kind": q.get("kind"),
                "stem": q.get("stem", ""),
                "choices": q.get("choices") or [],
                "point": q.get("point"),
            }
            if q.get("markers"):
                item["markers"] = q["markers"]
            if q.get("letterMarkers"):
                item["letterMarkers"] = q["letterMarkers"]
            if q.get("bracketChoices"):
                item["bracketChoices"] = q["bracketChoices"]
            raw.append(item)
        if not raw:
            continue
        stats["withQuestions"] += 1
        if any(r.get("markers") or r.get("letterMarkers") for r in raw):
            stats["withMarkers"] += 1
        problems[rec["id"]] = {
            "examId": exam_id,
            "rawProblems": raw,
            "answerKey": {str(n): rec.get("answer") for n in qs} if rec.get("answer") else {},
            "sourcePdf": parsed.get("sourcePdf", ""),
        }

json.dump(problems, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
size = os.path.getsize(OUT)
print(f"problems.json 산출: {len(problems)}개 지문 / {size/1048576:.2f} MB")
print(f"  파싱 시험지 {stats['exams']} | 지문 {stats['passages']} | 문항 확보 {stats['withQuestions']} | 밑줄마커 보유 {stats['withMarkers']}")
print(f"  코퍼스 전체 지문 대비 커버리지: {len(problems)}/{len(corpus)} = {len(problems)/len(corpus)*100:.1f}%")
