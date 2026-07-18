# -*- coding: utf-8 -*-
"""배치 items.jsonl → 블라인드/풀 평가 패킷 생성.

- blind/<pid>.md : 지문(렌더)+발문+선지만. 정답/해설/arm/plan/난이도/수락여부 은닉.
- full/<pid>.md  : 전체(정답·해설·오답해설·keyPoints·markedExpressions·요청 난이도·원지문).
- key.json       : pid → 메타(정답, arm, 수락여부, 게이트코드 등) — 평가자 비공개, 채점용.

수락 문항과 게이트 반려 후보(첫 번째)를 모두 포함하며, pid 는 순서 셔플된 익명 ID.
사용: python build-eval-packets.py <batchDir>
"""
import json, os, sys, hashlib, random

batch_dir = sys.argv[1]
items_path = os.path.join(batch_dir, "items.jsonl")
out_dir = os.path.join(batch_dir, "eval")
os.makedirs(os.path.join(out_dir, "blind"), exist_ok=True)
os.makedirs(os.path.join(out_dir, "full"), exist_ok=True)

RENDER_FIELDS = ["passageWithMarkers", "passageWithBlank", "passageWithUnderline", "passageWithNumbers", "passage"]

def rendered_passage(q):
    for f in RENDER_FIELDS:
        v = q.get(f)
        if isinstance(v, str) and v.strip():
            return v
    return None

def fmt_options(q):
    opts = q.get("options") or []
    return "\n".join(f"{o.get('label')} {o.get('text')}" for o in opts if isinstance(o, dict))

def type_display_sections(q, blind):
    """유형 특이 표시 필드 렌더 (26-07-18 수정: 요약/순서/삽입의 핵심 표시 필드를
    패킷에서 누락시켜 채점자가 '풀 수 없음'으로 오판하던 평가 장비 결함 교정)."""
    parts = []
    if isinstance(q.get("givenSentence"), str) and q["givenSentence"].strip():
        parts.append("## 주어진 문장/글\n" + q["givenSentence"])
    if isinstance(q.get("paragraphs"), list) and q["paragraphs"]:
        chunks = "\n\n".join(
            f"{p.get('label')} {p.get('text')}" for p in q["paragraphs"] if isinstance(p, dict)
        )
        parts.append("## 단락 (순서 배열 대상)\n" + chunks)
    if isinstance(q.get("summaryWithBlanks"), str) and q["summaryWithBlanks"].strip():
        parts.append("## 요약문 (빈칸 포함)\n" + q["summaryWithBlanks"])
    if isinstance(q.get("sentenceWithBlank"), str) and q["sentenceWithBlank"].strip():
        parts.append("## 빈칸 문장\n" + q["sentenceWithBlank"])
    if isinstance(q.get("scrambledWords"), list) and q["scrambledWords"]:
        words = list(q["scrambledWords"]) + [w for w in (q.get("wordBankDistractors") or []) if isinstance(w, str)]
        parts.append("## 배열 대상 단어\n" + " / ".join(str(w) for w in words))
    if isinstance(q.get("contextHint"), str) and q["contextHint"].strip():
        parts.append("## 힌트\n" + q["contextHint"])
    if isinstance(q.get("referenceSentence"), str) and q["referenceSentence"].strip():
        parts.append("## 참조 문장\n" + q["referenceSentence"])
    if isinstance(q.get("conditions"), list) and q["conditions"]:
        parts.append("## 작성 조건\n" + "\n".join(f"- {c}" for c in q["conditions"]))
    if not blind:
        if isinstance(q.get("blanks"), list) and q["blanks"]:
            parts.append("## blanks (정답 포함 — 감사용)\n" + json.dumps(q["blanks"], ensure_ascii=False, indent=1))
        for key, label in [("modelAnswer", "모범답안"), ("answer", "정답(서술형)"), ("scoringCriteria", "채점 기준"), ("markedWords", "markedWords"), ("underlinedSegments", "underlinedSegments")]:
            v = q.get(key)
            if v:
                parts.append(f"## {label} (감사용)\n" + (v if isinstance(v, str) else json.dumps(v, ensure_ascii=False, indent=1)))
    return ("\n\n" + "\n\n".join(parts)) if parts else ""

def blind_md(pid, q, passage_text):
    rp = rendered_passage(q) or passage_text
    return f"""# 문항 {pid}

## 지문
{rp}{type_display_sections(q, blind=True)}

## 발문
{q.get('direction') or '(발문 없음)'}

## 선택지
{fmt_options(q) or '(선지 없음 — 서술형이면 요구 답안을 직접 작성)'}
"""

def full_md(pid, q, it, source_kind):
    rp = rendered_passage(q) or "(렌더 지문 없음)"
    woe = q.get("wrongOptionExplanations")
    me = q.get("markedExpressions")
    return f"""# 문항 {pid} — 전체 정보 (validity/craft 감사용)

## 요청 난이도
{it['difficulty']}

## 유형
{it['subType']}

## 원지문 (변형 전)
{it.get('passageText','(별도 파일 참조)')}

## 렌더된 지문 (학생에게 보이는 형태)
{rp}{type_display_sections(q, blind=False)}

## 발문
{q.get('direction')}

## 선택지
{fmt_options(q)}

## 선언된 정답
{q.get('correctAnswer')}

## 해설
{q.get('explanation')}

## 오답 해설
{json.dumps(woe, ensure_ascii=False, indent=1) if woe else '(없음)'}

## keyPoints
{json.dumps(q.get('keyPoints'), ensure_ascii=False) if q.get('keyPoints') else '(없음)'}

## markedExpressions / 구조 필드
{json.dumps(me, ensure_ascii=False, indent=1) if me else '(없음)'}

## 후보 출처(참고)
{source_kind}
"""

def main():
    items = [json.loads(l) for l in open(items_path, encoding="utf-8")]
    corpus = json.load(open(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(items_path))), "private", "corpus-joined.private.json"), encoding="utf-8"))
    text_by_frame = {r["frameId"]: r["passageText"] for r in corpus["rows"]}
    rows = []
    for it in items:
        passage_text = text_by_frame.get(it["frameId"], "")
        it["passageText"] = passage_text
        if it.get("accepted"):
            rows.append((it, it["accepted"], "accepted"))
        elif it.get("rejectedCandidates"):
            rc = it["rejectedCandidates"][0]
            if rc.get("question"):
                rows.append((it, rc["question"], "gate_rejected:" + ",".join(rc.get("blockingCodes") or [])))
    rng = random.Random(20260716)
    rng.shuffle(rows)
    key = {}
    for i, (it, q, kind) in enumerate(rows, 1):
        pid = f"P{i:03d}"
        with open(os.path.join(out_dir, "blind", f"{pid}.md"), "w", encoding="utf-8") as f:
            f.write(blind_md(pid, q, it["passageText"]))
        with open(os.path.join(out_dir, "full", f"{pid}.md"), "w", encoding="utf-8") as f:
            f.write(full_md(pid, q, it, "(비공개)"))
        key[pid] = {
            "itemId": it["itemId"], "armId": it["armId"], "frameId": it["frameId"],
            "subType": it["subType"], "difficulty": it["difficulty"], "plan": it["plan"],
            "profile": it.get("profile"), "sourceKind": kind,
            "correctAnswer": q.get("correctAnswer"),
            "gateIssues": it.get("acceptedGateIssues") if kind == "accepted" else None,
        }
    with open(os.path.join(out_dir, "key.json"), "w", encoding="utf-8") as f:
        json.dump(key, f, ensure_ascii=False, indent=1)
    print(f"packets: {len(rows)} (accepted={sum(1 for _,_,k in rows if k=='accepted')}, rejected={sum(1 for _,_,k in rows if k.startswith('gate_rejected'))})")
    print("out:", out_dir)

main()
