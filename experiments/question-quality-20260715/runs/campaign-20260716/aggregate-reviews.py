# -*- coding: utf-8 -*-
"""평가 리뷰 집계: eval/reviews/*.json + key.json → 문항별 최종판정 + arm별 지표.

판정 규칙(RUBRIC v0.2):
- V2(정답 유일성): 두 블라인드 솔버가 모두 key 정답과 일치 + 복수정답 판정 없음 + auditor V2 통과.
  불일치 항목은 adjudicator 결과(있으면)로 확정.
- F = V1~V5 하나라도 실패. C = V 전부 통과 + 공예 결함. B = C최저2·합17+. A = C최저3·합21+.
- beautiful-killer = A && difficulty=KILLER && auditor killerConditionsMet.
사용: python aggregate-reviews.py <batchDir>
"""
import json, sys, os, collections, glob

batch_dir = sys.argv[1]
eval_dir = os.path.join(batch_dir, "eval")
key = json.load(open(os.path.join(eval_dir, "key.json"), encoding="utf-8"))
reviews_dir = os.path.join(eval_dir, "reviews")

def load(pid, role):
    p = os.path.join(reviews_dir, f"{pid}.{role}.json")
    if not os.path.exists(p):
        return None
    try:
        return json.load(open(p, encoding="utf-8"))
    except Exception as e:
        print(f"WARN broken review {p}: {e}")
        return None

results = []
for pid, k in sorted(key.items()):
    s1, s2 = load(pid, "solver1"), load(pid, "solver2")
    aud = load(pid, "auditor")
    adj = load(pid, "adjudicator")
    rec = {"pid": pid, **k}
    if not (s1 and s2 and aud):
        rec["finalGrade"] = "UNREVIEWED"
        results.append(rec)
        continue
    keyans = str(k.get("correctAnswer") or "").strip()
    def norm(a):
        s = str(a or "").strip()
        # 표기 통일: ①~⑤ / 1~5 / (A)~(E) / A~E → 1~5 canonical
        table = {"①":"1","②":"2","③":"3","④":"4","⑤":"5",
                 "(A)":"1","(B)":"2","(C)":"3","(D)":"4","(E)":"5",
                 "A":"1","B":"2","C":"3","D":"4","E":"5"}
        return table.get(s, s)
    solver_answers = [norm(s1.get("answer")), norm(s2.get("answer"))]
    solver_match = [a == norm(keyans) for a in solver_answers]
    multi = bool(s1.get("multipleDefensible") or s2.get("multipleDefensible"))
    v = dict(aud.get("validity") or {})
    # 솔버 근거로 V2 강화: 솔버 불일치·복수정답은 adjudicator 가 뒤집지 않는 한 V2 실패
    v2_blind = all(solver_match) and not multi
    if not v2_blind:
        if adj and adj.get("finalV2") is True:
            pass  # adjudicator 가 유일성 인정
        else:
            v["V2"] = False
    v_all = all(v.get(x) is True for x in ("V1", "V2", "V3", "V4", "V5"))
    c = aud.get("craft") or {}
    cvals = [int(c.get(f"C{i}", 0)) for i in range(1, 7)]
    csum, cmin = sum(cvals), min(cvals) if cvals else 0
    if not v_all:
        grade = "F"
    elif cmin >= 3 and csum >= 21:
        grade = "A"
    elif cmin >= 2 and csum >= 17:
        grade = "B"
    else:
        grade = "C"
    rec.update({
        "solverAnswers": solver_answers, "solverMatch": solver_match, "multipleDefensible": multi,
        "adjudicated": bool(adj), "validity": v, "craft": c, "craftSum": csum,
        "finalGrade": grade,
        "beautifulKiller": bool(grade == "A" and k["difficulty"] == "KILLER" and aud.get("killerConditionsMet")),
        "auditorGrade": aud.get("grade"),
        "validityIssues": aud.get("validityIssues"),
    })
    results.append(rec)

with open(os.path.join(eval_dir, "final-judgments.json"), "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=1)

by_arm = collections.defaultdict(lambda: collections.Counter())
for r in results:
    ctr = by_arm[r["armId"]]
    ctr["n"] += 1
    g = r["finalGrade"]
    ctr[g] += 1
    if g in ("A", "B"):
        ctr["shipReady"] += 1
    if g != "F" and g != "UNREVIEWED":
        ctr["fatalFree"] += 1
    if r.get("beautifulKiller"):
        ctr["beautiful"] += 1

print(f"{'arm':38s} {'n':>3s} {'A':>3s} {'B':>3s} {'C':>3s} {'F':>3s} {'unrev':>5s} {'fatalFree%':>10s} {'ship%':>6s} {'btfl':>4s}")
for arm, c in sorted(by_arm.items()):
    n = c["n"]
    print(f"{arm:38s} {n:3d} {c['A']:3d} {c['B']:3d} {c['C']:3d} {c['F']:3d} {c['UNREVIEWED']:5d} {100*c['fatalFree']/n:9.1f}% {100*c['shipReady']/n:5.1f}% {c['beautiful']:4d}")
