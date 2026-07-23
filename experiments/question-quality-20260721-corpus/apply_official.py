# 공식 해설 정답으로 코퍼스 최종 확정.
#   - 본문이 이미 공식 정답 상태면 무조치(메타만 정정)
#   - 본문에 공식 오답어가 남아 있으면 → 공식 정답으로 교정
#   - 본문에 내 동의어가 들어가 있으면 → 공식 정답으로 교체
# 사용: python apply_official.py [--dry]
import os, re, json, sys, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = "d:/Desktop/2026project/nara"
CORPUS = os.path.join(ROOT, "src/data/exam-passages/passages.json")
DRY = "--dry" in sys.argv

corpus = json.load(open(CORPUS, encoding="utf-8"))
by_id = {c["id"]: c for c in corpus}
plan = json.load(open(os.path.join(HERE, "reconcile-plan.json"), encoding="utf-8"))

def wre(t):
    return re.compile(rf"(?<![A-Za-z]){re.escape(t)}(?![A-Za-z])")

def norm_eq(a, b):
    return re.sub(r"\s+"," ",str(a or "")).strip().lower() == re.sub(r"\s+"," ",str(b or "")).strip().lower()

def count(text, t):
    return len(wre(t).findall(text))

actions = []
for bucket in ("AGREE", "OVERRIDE", "APPLY"):
    for it in plan[bucket]:
        rec = by_id.get(it["corpusId"])
        if not rec:
            continue
        text = rec["text"]
        frm, to = it["from"], it["to"]
        mine = rec.get("plantedError")
        n_from, n_to = count(text, frm), count(text, to)

        # ⚠ 버킷별 엄격 분기. 흔한 단어가 지문 다른 곳에 정당하게 또 나오는 함정이 있으므로
        #    "본문 전체 단어 카운트"만 보고 치환하면 멀쩡한 자리를 오손한다(G040 판례).
        if bucket == "AGREE":
            # 내 복원이 공식 정답과 축자 일치 → 본문은 이미 정답 상태. 메타만 확정.
            actions.append({"id": rec["id"], "op": "META_ONLY", "from": frm, "to": to, "bucket": bucket})
            continue

        if bucket == "OVERRIDE":
            # ⚠ 내 복원은 '구간'이고 공식 정답은 '단어'인 경우가 많다.
            #   구간을 단어로 통째 치환하면 문장이 깨진다(does not have enough time or ability → little).
            #   해법: 공식 교정을 '내가 기록해 둔 오염 구간'에 적용해 올바른 구간을 재구성한 뒤,
            #         본문에 들어가 있는 '내 구간'을 그 재구성 구간으로 교체한다.
            my_planted = (mine or {}).get("planted") or ""
            my_original = (mine or {}).get("original") or ""
            if my_planted and my_original and count(text, my_original) == 1:
                if count(my_planted, frm) >= 1:
                    fixed_span = wre(frm).sub(to, my_planted, count=1)
                else:
                    fixed_span = None
                if fixed_span is None:
                    actions.append({"id": rec["id"], "op": "SKIP", "from": frm, "to": to,
                                    "why": f"공식 오답어가 내 기록 구간에 없음 (planted={my_planted!r})", "bucket": bucket})
                elif norm_eq(fixed_span, my_original):
                    # 내 복원 결과가 공식과 동일 → 본문 무변경, 메타만 확정
                    actions.append({"id": rec["id"], "op": "META_ONLY", "from": frm, "to": to, "bucket": bucket})
                else:
                    actions.append({"id": rec["id"], "op": "SWAP", "target": my_original, "repl": fixed_span,
                                    "from": frm, "to": to, "bucket": bucket})
                continue
            if n_from == 1 and n_to == 0:
                actions.append({"id": rec["id"], "op": "FIX", "target": frm, "repl": to,
                                "from": frm, "to": to, "bucket": bucket})
                continue
            actions.append({"id": rec["id"], "op": "SKIP", "from": frm, "to": to,
                            "why": f"my={my_original!r} x{count(text, my_original) if my_original else '-'}, from x{n_from}, to x{n_to}",
                            "bucket": bucket})
            continue

        # APPLY — 내가 못 잡은 오염. 공식 오답어가 정확히 1회일 때만 교정.
        if n_from == 1:
            actions.append({"id": rec["id"], "op": "FIX", "target": frm, "repl": to,
                            "from": frm, "to": to, "bucket": bucket})
        elif n_from == 0 and n_to >= 1:
            actions.append({"id": rec["id"], "op": "META_ONLY", "from": frm, "to": to, "bucket": bucket})
        else:
            actions.append({"id": rec["id"], "op": "SKIP", "from": frm, "to": to,
                            "why": f"from x{n_from}, to x{n_to} — 구간 앵커 필요", "bucket": bucket})

from collections import Counter
print("조치 분포:", dict(Counter(a["op"] for a in actions)))
for a in actions:
    if a["op"] in ("FIX", "SWAP"):
        print(f"  [{a['op']}:{a['bucket']}] {a['id']:28s} \"{a['target']}\" → \"{a['repl']}\"  (공식 {a['from']}→{a['to']})")
    elif a["op"] == "SKIP":
        print(f"  [SKIP:{a['bucket']}] {a['id']:28s} {a['from']}→{a['to']}  {a['why']}")

if DRY:
    print("\nDRY-RUN")
    sys.exit(0)

shutil.copyfile(CORPUS, os.path.join(HERE, "passages.json.backup-before-official"))
changed = 0
for a in actions:
    rec = by_id[a["id"]]
    if a["op"] in ("FIX", "SWAP"):
        new = wre(a["target"]).sub(a["repl"], rec["text"], count=1)
        if new == rec["text"]:
            print(f"  ✗ 치환 실패 {a['id']}")
            continue
        rec["text"] = new
        changed += 1
    if a["op"] in ("FIX", "SWAP", "META_ONLY"):
        rec["plantedError"] = {
            "planted": a["from"], "original": a["to"],
            "verifiedBy": "official-solution(EBSi 해설지)",
            "restoredAt": "2026-07-22",
        }
        rec["hasDeliberateError"] = False

json.dump(corpus, open(CORPUS, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(f"\n본문 변경 {changed}건 / 메타 확정 {sum(1 for a in actions if a['op'] in ('FIX','SWAP','META_ONLY'))}건")

# 재검증
re_c = json.load(open(CORPUS, encoding="utf-8"))
rb = {c["id"]: c for c in re_c}
bad = 0
for a in actions:
    if a["op"] not in ("FIX", "SWAP", "META_ONLY"):
        continue
    t = rb[a["id"]]["text"]
    if count(t, a["to"]) < 1:
        print(f"  ✗ 정답어 부재 {a['id']} ({a['to']})")
        bad += 1
    if a["op"] in ("FIX",) and count(t, a["from"]) > 0:
        print(f"  ✗ 오답어 잔존 {a['id']} ({a['from']})")
        bad += 1
print("재검증:", "pass" if bad == 0 else f"{bad}건 문제")
print("레코드 수:", len(re_c))
