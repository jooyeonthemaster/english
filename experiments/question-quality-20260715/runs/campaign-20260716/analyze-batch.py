# -*- coding: utf-8 -*-
"""배치 사후 분석: wire.jsonl(HTTP 원문)을 원가·토큰의 권위 소스로 삼아
items/arm 별 집계와 원장 대사(reconciliation)를 출력한다.
사용: python analyze-batch.py <batchDir>
"""
import json, sys, collections

batch_dir = sys.argv[1]

wire_cost = collections.defaultdict(float)
wire_tokens_in = collections.defaultdict(int)
wire_tokens_out = collections.defaultdict(int)
wire_calls = collections.defaultdict(int)
wire_status = collections.Counter()
total_wire_cost = 0.0
for line in open(f"{batch_dir}/wire.jsonl", encoding="utf-8"):
    w = json.loads(line)
    wire_status[w["status"]] += 1
    item = w.get("item") or "?"
    wire_calls[item] += 1
    try:
        resp = json.loads(w["response"])
        u = resp.get("usage") or {}
        c = u.get("cost") or 0
        wire_cost[item] += c
        total_wire_cost += c
        wire_tokens_in[item] += u.get("prompt_tokens") or 0
        wire_tokens_out[item] += u.get("completion_tokens") or 0
    except Exception:
        pass

arms = collections.defaultdict(lambda: {"n": 0, "accepted": 0, "gate_rejected": 0, "no_candidate": 0,
                                        "slots": 0, "wireCost": 0.0, "wireCalls": 0, "ms": 0})
items_cost_stage = 0.0
for line in open(f"{batch_dir}/items.jsonl", encoding="utf-8"):
    it = json.loads(line)
    a = arms[it["armId"]]
    a["n"] += 1
    a[it["outcome"]] = a.get(it["outcome"], 0) + 1
    a["slots"] += it["slots"]
    a["wireCost"] += wire_cost.get(it["itemId"], 0.0)
    a["wireCalls"] += wire_calls.get(it["itemId"], 0)
    a["ms"] += it["ms"]
    items_cost_stage += it["costUsd"]

print(f"wire: statuses={dict(wire_status)} totalCost=${total_wire_cost:.4f} (stage-계상 ${items_cost_stage:.4f} → 차액 ${total_wire_cost-items_cost_stage:.4f})")
print(f"{'arm':38s} {'n':>3s} {'acc':>4s} {'rej':>4s} {'noc':>4s} {'slots':>5s} {'calls':>5s} {'cost$':>8s} {'$/acc':>7s} {'avg_s':>6s}")
for arm, a in sorted(arms.items()):
    per_acc = a["wireCost"] / a["accepted"] if a["accepted"] else float("nan")
    print(f"{arm:38s} {a['n']:3d} {a['accepted']:4d} {a.get('gate_rejected',0):4d} {a.get('no_candidate',0):4d} {a['slots']:5d} {a['wireCalls']:5d} {a['wireCost']:8.4f} {per_acc:7.4f} {a['ms']/a['n']/1000:6.1f}")
