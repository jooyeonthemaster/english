# -*- coding: utf-8 -*-
"""Phase C paired 통계 판정.

같은 frameId×difficulty 조합에서 arm 간 paired 비교:
- 1차 지표: fatal-free(수락&&비F), ship-ready(A/B)
- paired McNemar (exact binomial), Wilson 95% CI
사용: python phase-c-stats.py <batchDir> <controlArm> <treatArm1> [treatArm2 ...]
"""
import json, sys, os, math, collections
from math import comb

batch_dir = sys.argv[1]
control = sys.argv[2]
treats = sys.argv[3:]

judg = json.load(open(os.path.join(batch_dir, "eval", "final-judgments.json"), encoding="utf-8"))

def outcome(r, metric):
    if r["finalGrade"] == "UNREVIEWED":
        return None
    # 파이프라인 수락 여부까지 결합: 게이트 반려 후보는 '출하 실패'로 계상
    shipped = r["sourceKind"] == "accepted"
    if metric == "fatalFree":
        return 1 if (shipped and r["finalGrade"] != "F") else 0
    if metric == "ship":
        return 1 if (shipped and r["finalGrade"] in ("A", "B")) else 0
    return None

# frameId 기준 매핑 (같은 frame 은 모든 arm 에서 같은 난이도)
by_arm_frame = collections.defaultdict(dict)
for r in judg:
    by_arm_frame[r["armId"]][r["frameId"]] = r

def wilson(k, n):
    if n == 0:
        return (0.0, 0.0, 0.0)
    p = k / n
    z = 1.96
    den = 1 + z * z / n
    center = (p + z * z / (2 * n)) / den
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (p, max(0, center - half), min(1, center + half))

def mcnemar_exact(b, c):
    """b=control만 성공, c=treat만 성공. exact binomial two-sided p."""
    n = b + c
    if n == 0:
        return 1.0
    k = min(b, c)
    p = sum(comb(n, i) for i in range(0, k + 1)) * (0.5 ** n) * 2
    return min(1.0, p)

for metric in ("fatalFree", "ship"):
    print(f"\n=== metric: {metric}")
    cframes = by_arm_frame.get(control, {})
    ck = sum(1 for r in cframes.values() if outcome(r, metric) == 1)
    cn = sum(1 for r in cframes.values() if outcome(r, metric) is not None)
    p, lo, hi = wilson(ck, cn)
    print(f"{control:8s} {ck}/{cn} = {100*p:.0f}% [Wilson {100*lo:.0f}–{100*hi:.0f}]")
    for t in treats:
        tframes = by_arm_frame.get(t, {})
        tk = sum(1 for r in tframes.values() if outcome(r, metric) == 1)
        tn = sum(1 for r in tframes.values() if outcome(r, metric) is not None)
        tp, tlo, thi = wilson(tk, tn)
        # paired
        b = c = 0
        for fid, cr in cframes.items():
            tr = tframes.get(fid)
            if tr is None:
                continue
            co, to = outcome(cr, metric), outcome(tr, metric)
            if co is None or to is None:
                continue
            if co == 1 and to == 0:
                b += 1
            if co == 0 and to == 1:
                c += 1
        pval = mcnemar_exact(b, c)
        print(f"{t:8s} {tk}/{tn} = {100*tp:.0f}% [Wilson {100*tlo:.0f}–{100*thi:.0f}]  paired vs {control}: +{c}/-{b}, McNemar p={pval:.3f}")
