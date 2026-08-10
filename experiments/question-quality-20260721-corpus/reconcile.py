# 해설지 정답 원장 vs 내 AI 복원 대조 → 최종 적용 계획 산출
#   AGREE      : 내 복원이 정답과 일치 (그대로 둠)
#   OVERRIDE   : 내 복원이 정답과 다름 → 정답으로 덮어씀 (되돌린 뒤 재적용)
#   APPLY      : 내가 못 잡은 것 → 정답대로 신규 적용
#   ALREADY    : 코퍼스가 이미 정답 상태 (조치 없음)
import os, re, json

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = "d:/Desktop/2026project/nara"
corpus = json.load(open(os.path.join(ROOT, "src/data/exam-passages/passages.json"), encoding="utf-8"))
sols = json.load(open(os.path.join(HERE, "solution-corrections.json"), encoding="utf-8"))
by_id = {c["id"]: c for c in corpus}

def norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip().lower()

def wordre(t):
    return re.compile(rf"(?<![A-Za-z]){re.escape(t)}(?![A-Za-z])")

# 해설 원장 → corpusId 매핑 (examId + qNum)
by_exam_q = {}
for c in corpus:
    for q in (c.get("qNumbers") or []):
        by_exam_q[(c["examId"], q)] = c

plan = {"AGREE": [], "OVERRIDE": [], "APPLY": [], "ALREADY": [], "NO_TARGET": []}
for s in sols:
    rec = by_exam_q.get((s["examId"], s["qNum"]))
    if not rec:
        plan["NO_TARGET"].append(s)
        continue
    text = rec["text"]
    mine = rec.get("plantedError")
    frm, to = s["from"], s["to"]
    has_from = bool(wordre(frm).search(text))
    has_to = bool(wordre(to).search(text))
    item = {
        "corpusId": rec["id"], "examId": s["examId"], "qNum": s["qNum"],
        "marker": s["marker"], "from": frm, "to": to,
        "mine": f"{mine['planted']}→{mine['original']}" if mine else None,
        "hasFrom": has_from, "hasTo": has_to, "source": s["source"],
    }
    if mine:
        if norm(mine["planted"]) == norm(frm) and norm(mine["original"]) == norm(to):
            plan["AGREE"].append(item)
        else:
            plan["OVERRIDE"].append(item)
    else:
        if has_from:
            plan["APPLY"].append(item)
        elif has_to:
            plan["ALREADY"].append(item)
        else:
            plan["NO_TARGET"].append(item)

for k, v in plan.items():
    print(f"{k:10s} {len(v)}")
json.dump(plan, open(os.path.join(HERE, "reconcile-plan.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

print("\n=== OVERRIDE (내 복원 ≠ 정답) ===")
for i in plan["OVERRIDE"]:
    print(f"  {i['corpusId']:30s} 정답: {i['from']} → {i['to']}   내것: {i['mine']}   (본문에 from={i['hasFrom']}, to={i['hasTo']})")
print("\n=== APPLY (내가 놓친 오염) ===")
for i in plan["APPLY"]:
    print(f"  {i['corpusId']:30s} {i['marker']} {i['from']} → {i['to']}")
