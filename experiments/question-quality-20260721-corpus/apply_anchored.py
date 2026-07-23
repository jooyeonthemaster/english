# 남은 2건 — 단어가 여러 번 나오는 경우, 공식 밑줄 구간으로 자리를 특정해 교정한다.
import os, re, json, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = "d:/Desktop/2026project/nara"
CORPUS = os.path.join(ROOT, "src/data/exam-passages/passages.json")

# (corpusId, 앵커 구간, 오답어, 정답어) — 앵커는 공식 시험지 밑줄 구간 / 해설 문맥 기준
JOBS = [
    ("ebsi_go1_20160901-q28", "become less interested in learning", "become", "becomes"),
    ("ebsi_go2_20200916-q30", "hard to believe", "believe", "challenge"),
]

corpus = json.load(open(CORPUS, encoding="utf-8"))
by_id = {c["id"]: c for c in corpus}

def wre(t):
    return re.compile(rf"(?<![A-Za-z]){re.escape(t)}(?![A-Za-z])")

def loose(span):
    return re.compile(r"[\s­]+".join(re.escape(w) for w in span.split()))

plan = []
for cid, anchor, frm, to in JOBS:
    rec = by_id.get(cid)
    if not rec:
        print(f"✗ {cid} 없음")
        continue
    text = rec["text"]
    hits = list(loose(anchor).finditer(text))
    if len(hits) != 1:
        print(f"✗ {cid}: 앵커 '{anchor}' {len(hits)}회 — 스킵")
        continue
    span = hits[0].group(0)
    if len(wre(frm).findall(span)) != 1:
        print(f"✗ {cid}: 구간 내 '{frm}' 1회 아님 — 스킵")
        continue
    fixed = wre(frm).sub(to, span, count=1)
    plan.append((rec, span, fixed, frm, to))
    print(f"✓ {cid}: …{span}… → …{fixed}…")

if not plan:
    raise SystemExit("적용 대상 없음")

shutil.copyfile(CORPUS, os.path.join(HERE, "passages.json.backup-anchored"))
for rec, span, fixed, frm, to in plan:
    rec["text"] = rec["text"].replace(span, fixed, 1)
    rec["plantedError"] = {
        "planted": frm, "original": to,
        "verifiedBy": "official-solution(EBSi 해설지)+span-anchored",
        "restoredAt": "2026-07-22",
    }
    rec["hasDeliberateError"] = False
json.dump(corpus, open(CORPUS, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

re_c = json.load(open(CORPUS, encoding="utf-8"))
rb = {c["id"]: c for c in re_c}
for rec, span, fixed, frm, to in plan:
    ok = fixed in rb[rec["id"]]["text"]
    print(("✓ 검증 " if ok else "✗ 검증실패 ") + rec["id"])
print("레코드 수:", len(re_c))
