# 영어 기출 시험지 PDF → 문항 구조화 (국어 problems.json 수준)
#
# 산출: { examId, questions: [ {qNum, stem, choices[], markers{①:word}, point, passageText} ] }
# 핵심 목표는 어법(29)·어휘(30)·장문 어휘(42)의 **밑줄 단어**를 마커째 확보하는 것.
#
# 사용: python parse_exam_pdf.py <pdf> [--json out.json]
import re, sys, json, os
import fitz

CIRCLED = "①②③④⑤"
CIRCLED_RE = r"[①-⑤]"

def page_texts(path):
    doc = fitz.open(path)
    return [p.get_text("text") for p in doc]

def normalize(t):
    # 하이픈 줄바꿈 결합, 다중 공백 정리 (단, 문항 경계 개행은 유지)
    t = t.replace("­", "")
    t = re.sub(r"([A-Za-z])-\n([a-z])", r"\1\2", t)
    return t

def strip_header_footer(pages):
    """페이지 머리말/꼬리말(영어 영역, 페이지번호 등) 제거."""
    out = []
    for p in pages:
        lines = p.split("\n")
        keep = []
        for ln in lines:
            s = ln.strip()
            if not s:
                continue
            if re.fullmatch(r"\d{1,2}", s):            # 페이지 번호
                continue
            if re.fullmatch(r"[가-힣]{0,3}\s*영어\s*영역", s):
                continue
            if "이 문제지에 관한" in s or "저작권" in s:
                continue
            keep.append(ln)
        out.append("\n".join(keep))
    return out

QSTART = re.compile(r"(?m)^\s*(\d{1,2})\s*[.．]\s*(?=[^\d])")
# 장문 세트 헤더: [41~42] 다음 글을 읽고, 물음에 답하시오.
SETHDR = re.compile(r"\[\s*(\d{1,2})\s*[~～－-]\s*(\d{1,2})\s*\]")

def split_questions(full):
    """문항 번호로 본문을 분할. 장문 세트 헤더는 앞선 문항에 붙지 않도록 경계 처리."""
    marks = [(m.start(), int(m.group(1))) for m in QSTART.finditer(full)]
    # 번호가 단조 증가하는 것만 채택(오탐 제거: 본문 중 "1. " 같은 것)
    seq = []
    last = 0
    for pos, num in marks:
        if num >= last and num - last <= 6:
            seq.append((pos, num))
            last = num
    out = []
    for i, (pos, num) in enumerate(seq):
        end = seq[i + 1][0] if i + 1 < len(seq) else len(full)
        out.append({"qNum": num, "raw": full[pos:end]})
    return out

CHOICE_SPLIT = re.compile(r"(?=[①-⑤])")

def classify(stem):
    """발문으로 문항 유형 판정 — 밑줄형은 마커가 곧 선지라 선지 블록이 없다."""
    s = stem.replace(" ", "")
    # (a)~(e) 문자 마커가 먼저 — 발문에 "밑줄 친"도 같이 들어가므로 순서가 중요하다
    if re.search(r"\(a\)\s*[~～∼-]\s*\(e\)", stem) or "(a)~(e)" in s:
        return "vocab_letter"
    if "밑줄친" in s and "어법" in s:
        return "grammar_underline"
    if "밑줄친" in s and ("낱말" in s or "어휘" in s):
        return "vocab_underline"
    if "네모" in s or "[A]" in stem:
        return "box_choice"
    return "mc"

def parse_choices(seg, kind):
    """일반 객관식만 선지 블록을 갖는다. 밑줄형은 마커=선지."""
    if kind in ("grammar_underline", "vocab_underline", "vocab_letter"):
        return [], None
    idxs = [m.start() for m in re.finditer(CIRCLED_RE, seg)]
    if len(idxs) < 5:
        return [], None
    for start in range(len(idxs) - 5, -1, -1):
        window = [seg[i] for i in idxs[start:start + 5]]
        if window == list(CIRCLED):
            block = seg[idxs[start]:]
            parts = [p.strip() for p in CHOICE_SPLIT.split(block) if p.strip()]
            if len(parts) >= 5:
                ch = [re.sub(r"^[①-⑤]\s*", "", p).strip() for p in parts[:5]]
                return ch, idxs[start]
    return [], None

def parse_inline_markers(seg, upto=None):
    """지문 본문에 박힌 ①~⑤ 밑줄 단어 추출 (선지 블록 앞부분만 대상)."""
    body = seg[:upto] if upto else seg
    res = {}
    for m in re.finditer(r"([①-⑤])\s*([A-Za-z][A-Za-z'’\-]*(?:\s+[A-Za-z'’\-]+){0,4})", body):
        mk, word = m.group(1), " ".join(m.group(2).split())
        if mk not in res:
            res[mk] = word
    return res

def parse_letter_markers(seg):
    """장문 어휘 42번 계열: (a)~(e) 밑줄 단어."""
    res = {}
    for m in re.finditer(r"\(([a-e])\)\s*([A-Za-z][A-Za-z'’\-]*(?:\s+[A-Za-z'’\-]+){0,3})", seg):
        k, w = m.group(1), " ".join(m.group(2).split())
        if k not in res:
            res[k] = w
    return res

def parse_bracket_choices(seg):
    """구형식 네모 선택. 두 표기 모두 지원:
       (A)[shocked / shocking]   ← 대괄호형
       (A)was/were               ← 대괄호 없는 구형(HWP 추출본)"""
    res = {}
    for m in re.finditer(r"\(([A-C])\)\s*\[([^\]]{2,60})\]", seg):
        res[m.group(1)] = [x.strip() for x in m.group(2).split("/")]
    for m in re.finditer(r"\(([A-C])\)\s*([A-Za-z][A-Za-z'’-]{1,20})\s*/\s*([A-Za-z][A-Za-z'’-]{1,20})", seg):
        res.setdefault(m.group(1), [m.group(2).strip(), m.group(3).strip()])
    return res

POINT = re.compile(r"\[(\d)\s*점\]")

def parse_text(full_text, exam_id=None, source=""):
    """PDF 가 아니라 이미 추출된 텍스트(HWP 등)로 파싱."""
    qs = split_questions(normalize(full_text))
    return _build(qs, exam_id or source, source)

def parse_pdf(path, exam_id=None):
    pages = strip_header_footer(page_texts(path))
    full = normalize("\n".join(pages))
    qs = split_questions(full)
    return _build(qs, exam_id or os.path.basename(path), os.path.basename(path))

def _build(qs, exam_id, source):
    out = []
    for q in qs:
        seg = q["raw"]
        # 발문은 첫 줄(물음표까지) — 선지 위치와 무관하게 먼저 뽑는다
        head = " ".join(seg[:400].split())
        mq = re.search(r"[?？]", head)
        stem = head[: mq.end()] if mq else head[:160]
        kind = classify(stem)
        choices, cidx = parse_choices(seg, kind)
        pt = POINT.search(seg)
        # 밑줄형은 지문 전체가 마커 탐색 대상
        markers = parse_inline_markers(seg, cidx) if kind != "mc" else {}
        rec = {
            "qNum": q["qNum"],
            "kind": kind,
            "stem": stem,
            "choices": choices,
            "point": int(pt.group(1)) if pt else None,
            "markers": markers,
            "letterMarkers": parse_letter_markers(seg) if kind == "vocab_letter" else {},
            "bracketChoices": parse_bracket_choices(seg),
            "charLen": len(seg),
        }
        out.append(rec)
    return {"examId": exam_id, "source": source, "questions": out}

if __name__ == "__main__":
    pdf = sys.argv[1]
    res = parse_pdf(pdf)
    outp = None
    if "--json" in sys.argv:
        outp = sys.argv[sys.argv.index("--json") + 1]
    if outp:
        json.dump(res, open(outp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("written", outp)
    qs = res["questions"]
    print(f"{res['source']} | 문항 {len(qs)}개")
    interesting = [q for q in qs if q["markers"] or q["letterMarkers"] or q["bracketChoices"]]
    print(f"밑줄/선택 마커 보유 문항: {len(interesting)}")
    for q in interesting:
        mk = q["markers"] or q["letterMarkers"] or q["bracketChoices"]
        print(f"\n[{q['qNum']}] {q['stem'][:60]}")
        for k, v in mk.items():
            print(f"     {k} {v}")
