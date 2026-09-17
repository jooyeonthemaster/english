# 기출 시험지 PDF → 문항 원형 JSON (결정론 추출기, PyMuPDF)
#
# 산출: <out>/<examId>.json
#   { examId, sourcePdf, pages, questions: { "29": { qNum, page, col, text(열 정렬·하이픈 결합·리가처 해제),
#       lines[{page,col,y,text}], underlines[{page,col,y,words,prev}], blanks[{page,col,y,after,before}],
#       boxes[{page,col,y0,text}], point, footnotes[] } } }
#
# 설계 근거: .tmp-trend-v2/extract-origin.py(2026/2027 KICE 검증) 를 전 회차·학평으로 일반화.
#   · 2단 조판: 블록을 (page, col, y0, x0) 로 정렬해 읽기 순서를 복원(열 폭 기준 = 페이지 폭/2).
#   · 밑줄: get_drawings() 의 수평 선분/얇은 rect → 바로 위 단어와 매핑(어법·어휘·함축·지칭·장문 (a)~(e)).
#   · 빈칸: 단어가 안 걸린 긴 수평선 → 좌우 이웃 단어 기록(빈칸 위치 확정용).
#   · 박스: 큰 rect 안의 단어들(주어진 문장·요약문).
#   · 문항 절단: 행 머리 "NN." 단조 증가 필터(본문의 "14. After that" 오탐 방지 — parse_exam_pdf.py:44-53 선례).
# 사용: python scripts/gichul-bank/extract-forms.py <pdf> <examId> <outDir>
#       python scripts/gichul-bank/extract-forms.py --batch <manifest.json> <outDir>   # [{pdf, examId}]
import fitz, json, re, sys, os

# U+00AD(soft hyphen) 은 학평 PDF 가 일반 하이픈 대신 쓰는 글리프다("below-zero"→"below­zero") — 버리면 복합어가 붙는다. 하이픈으로 살린다.
LIG = {"ﬀ": "ff", "ﬁ": "fi", "ﬂ": "fl", "ﬃ": "ffi", "ﬄ": "ffl", "­": "-", "‐": "-", "‑": "-", "－": "-"}


def delig(t):
    for k, v in LIG.items():
        t = t.replace(k, v)
    return t


def col_of(x0, w, gutter=None):
    # gutter=None 이면 기존 동작(페이지 폭 절반). 일부 학평 PDF 는 오른쪽 단이 절반보다 **왼쪽**에서
    # 시작해(예: w=595 인데 우단 x0=286.4) 두 단이 통째로 col 0 으로 뭉개진다 — 그 경우만 실측 여백을 준다.
    return 0 if x0 < (w * 0.5 if gutter is None else gutter) else 1


# 문항 번호 행 머리 — "36." 처럼 번호만 단독 줄인 경우(순서·삽입 문항은 발문이 세트 머리에 있음)도 잡는다.
QNUM_RE = re.compile(r"^\s*(1[89]|2\d|3\d|4\d|50)\s*[.．](?:\s+(?=\S)|\s*$)")
# 완화형(tune["relax"] 전용) — 마침표 글리프가 통째로 빠진 PDF("40 다음글의…", 2012 9월 고2 B형)와
# 두 자리 숫자가 커닝으로 쪼개진 PDF("2 1. Possibly…", 2005 수능) 를 **결손 번호 보충에만** 쓴다.
QNUM_RELAX_RE = re.compile(r"^\s*([1-5])\s?(\d)\s*[.．]?(?:\s+(?=\S)|\s*$)")


def _mode_x(xs):
    # 1pt 창 안에 가장 많이 몰린 x 값(단 왼쪽 여백) — 본문 줄은 전부 단 여백에서 시작하므로 최빈값이 곧 여백이다.
    xs = sorted(xs)
    best, bestc = None, 0
    for i, x in enumerate(xs):
        j = i
        while j < len(xs) and xs[j] <= x + 1.0:
            j += 1
        if j - i > bestc:
            bestc, best = j - i, (x + xs[j - 1]) / 2.0
    return best, bestc


def _layout(xs, w):
    # (좌단 문항번호 x, 우단 문항번호 x) 실측 — 표본은 **본문 줄이 아니라 "NN." 줄** 이어야 한다.
    # 본문은 번호보다 8pt 안쪽으로 들여쓰기 때문에, 전체 줄의 최빈 x 를 쓰면 들여쓰기 위치를 집어
    # 진짜 번호 자리를 놓친다(2013 7월 고3: 번호 411.4 vs 본문 421.7 — 1차 구현 실패 지점).
    xl, cl = _mode_x([x for x in xs if x < w * 0.35])
    xr, cr = _mode_x([x for x in xs if w * 0.35 <= x < w * 0.78])
    if xl is None or xr is None or cl < 4 or cr < 4:
        return None, None
    return xl, xr


def extract(pdf_path, exam_id, tune=None):
    tune = tune or {}
    d = fitz.open(pdf_path)
    pages_out = []
    # 전역 스트림: 줄 단위 (page, col, y, text) — 읽기 순서
    stream = []  # {page, col, y, x, text}
    wstream = []  # 단어 띠 텍스트 줄 {page, col, y, y1, text}
    underlines = []
    blanks = []
    boxes = []
    # 평가원 PDF 는 대개 홀수형 8쪽 + 짝수형 8쪽이 한 파일이다 — 두 형이 공존하면 짝수형 쪽을 버린다.
    # 2016~2021 수능 PDF 는 짝수형만 있는 파일(8쪽)이라, 홀수형 페이지가 하나도 없으면 전 페이지를 쓴다(form="even").
    texts = [d[pi].get_text("text") for pi in range(len(d))]
    has_odd = any("홀수형" in t for t in texts)
    has_even = any("짝수형" in t for t in texts)
    if has_odd and has_even:
        page_ids = [pi for pi in range(len(d)) if "짝수형" not in texts[pi]]
        form = "odd"
    else:
        page_ids = list(range(len(d)))
        form = "even" if has_even else "single"
    # ── 튜닝 전 사전 실측(기본 경로에서는 실행되지 않는다 — 기존 산출 바이트 동일 보장) ──
    anchors = None
    gutter = None
    if tune and page_ids:
        w0 = d[page_ids[0]].rect.width
        qxs = []
        for pi in page_ids:
            for b in d[pi].get_text("dict")["blocks"]:
                if b.get("type", 0) != 0:
                    continue
                for ln in b.get("lines", []):
                    t = delig("".join(s.get("text", "") for s in ln.get("spans", []))).strip()
                    if t and QNUM_RE.match(t):
                        qxs.append(ln["bbox"][0])
        xl, xr = _layout(qxs, w0)
        if xl is not None:
            anchors = (xl, xr)
            # 우단 번호가 페이지 절반보다 **왼쪽**일 때만 여백을 갈아끼운다 — 정상 조판은 손대지 않는다.
            if tune.get("gutter") and xr < w0 * 0.5:
                gutter = xr - 8.0
    for pi in page_ids:
        pg = d[pi]
        w = pg.rect.width
        gut = gutter
        pnum = pi + 1
        # ── 텍스트: dict 로 줄 단위(스팬 결합) ──
        dd = pg.get_text("dict")
        lines = []
        for b in dd["blocks"]:
            if b.get("type", 0) != 0:
                continue
            for ln in b.get("lines", []):
                txt = "".join(s.get("text", "") for s in ln.get("spans", []))
                txt = delig(txt).strip()
                if not txt:
                    continue
                x0, y0, x1, y1 = ln["bbox"]
                # 전폭 줄(2단 가로지르는 헤더·세트 머리)은 col 0 로 두되 폭이 페이지의 60% 이상이면 표식
                lines.append({"page": pnum, "col": col_of(x0, w, gut), "y": round(y0, 1), "y1": round(y1, 1),
                              "x": round(x0, 1), "x1": round(x1, 1), "text": txt,
                              "wide": (x1 - x0) > w * 0.6})
        # 같은 줄이 여러 스팬 블록으로 쪼개진 경우(y 거의 같음·같은 col) — y 띠(2.5pt)로 묶고 x 순으로 이어 붙인다.
        # (요약문 "(A)" 라벨처럼 살짝 위에 앉은 조각이 줄 앞으로 튀는 것을 막는다 — 2024 수능 40 실측)
        lines.sort(key=lambda l: (l["col"], l["y"]))
        bands = []
        for l in lines:
            if bands and bands[-1][0]["col"] == l["col"] and abs(bands[-1][0]["y"] - l["y"]) < 2.5:
                bands[-1].append(l)
            else:
                bands.append([l])
        merged = []
        for band in bands:
            band.sort(key=lambda l: l["x"])
            m = dict(band[0])
            m["text"] = " ".join(x["text"] for x in band)
            m["x1"] = max(x["x1"] for x in band)
            m["y"] = min(x["y"] for x in band)
            m["y1"] = max(x["y1"] for x in band)
            merged.append(m)
        for l in merged:
            l["page"] = pnum
        stream.extend(merged)
        # ── 단어 박스(밑줄·빈칸·박스 매핑용) ──
        words = pg.get_text("words")
        # 단어 띠 텍스트(wtext): 단어를 (col, y 띠 3pt) 로 묶고 x 순 결합 — 선지 격자(요약문 (A)/(B) 2열)·라벨 위치를 원래 어순으로 복원
        wbands = {}
        for wd in words:
            key = (col_of(wd[0], w, gut), int(round(wd[3] / 3.0)))
            wbands.setdefault(key, []).append(wd)
        wlines = []
        for (c, yb), ws in wbands.items():
            ws.sort(key=lambda x: x[0])
            wlines.append({"page": pnum, "col": c, "y": round(min(x[1] for x in ws), 1), "y1": round(max(x[3] for x in ws), 1),
                           "text": delig(" ".join(x[4] for x in ws))})
        wlines.sort(key=lambda l: (l["col"], l["y"]))
        wstream.extend(wlines)
        segs = []  # (x0, x1, y)
        rects = []
        vlines = []  # (x, y0, y1) — 박스는 rect 가 아니라 세로선 2개 + 가로선 2개로 그려진다(2024 수능·학평 실측)
        for dr in pg.get_drawings():
            for it in dr["items"]:
                if it[0] == "l":
                    p1, p2 = it[1], it[2]
                    if abs(p1.y - p2.y) < 0.8 and abs(p1.x - p2.x) > 3:
                        segs.append((min(p1.x, p2.x), max(p1.x, p2.x), (p1.y + p2.y) / 2))
                    elif abs(p1.x - p2.x) < 0.8 and abs(p1.y - p2.y) > 12:
                        vlines.append((round((p1.x + p2.x) / 2, 1), min(p1.y, p2.y), max(p1.y, p2.y)))
                elif it[0] == "re":
                    r = it[1]
                    if r.height < 1.6 and r.width > 3:
                        segs.append((r.x0, r.x1, (r.y0 + r.y1) / 2))
                    elif r.height > 18 and r.width > 120:
                        rects.append(r)
        # 세로선 쌍 → 박스 rect (같은 y0·y1, x 간격 120 이상, 열 폭 이하). 페이지 중앙 분할선(높이 900+)은 제외.
        vlines = [v for v in vlines if (v[2] - v[1]) < 600]
        vlines.sort()
        used = set()
        for i, a in enumerate(vlines):
            if i in used:
                continue
            for j in range(i + 1, len(vlines)):
                b = vlines[j]
                if j in used:
                    continue
                if abs(a[1] - b[1]) < 2.5 and abs(a[2] - b[2]) < 2.5 and 120 < b[0] - a[0] < w * 0.55:
                    rects.append(fitz.Rect(a[0], a[1], b[0], a[2]))
                    used.add(i); used.add(j)
                    break
        # 박스 안 가로선(윗변·아랫변)은 밑줄 후보에서 제외 — 박스 y0/y1 과 1.5pt 이내 수평 선분
        if rects:
            segs = [s for s in segs if not any(abs(s[2] - r.y0) < 1.5 or abs(s[2] - r.y1) < 1.5 for r in rects)]
        # 같은 y 의 인접 선분 병합
        segs.sort(key=lambda s: (round(s[2], 1), s[0]))
        msegs = []
        for s in segs:
            # 같은 y 띠의 **오른쪽으로 이어지는** 조각만 병합한다(간격 -1~8pt). 반대 열의 선(예: 표 괘선)이 같은 y 에 있으면
            # 왼쪽 밑줄이 통째로 먹히던 결함(2025 6월 30번 ④ 실측) — 열이 다르거나 왼쪽으로 되돌아가면 별개 선분.
            if msegs and abs(msegs[-1][2] - s[2]) < 1.2 and -1.0 <= s[0] - msegs[-1][1] < 8 \
                    and col_of(s[0], w, gut) == col_of(msegs[-1][0], w, gut):
                msegs[-1] = (msegs[-1][0], max(msegs[-1][1], s[1]), msegs[-1][2])
            else:
                msegs.append(s)
        def ul_hit(wd, sx, ex, sy):
            if not (wd[3] - 2.5 <= sy <= wd[3] + 3.5):
                return False
            # "③it" 처럼 원문자/라벨이 단어 상자에 붙어 있으면 그 글리프 폭(~11pt)을 빼고 겹침 비율을 잰다
            # (짧은 단어의 밑줄이 40% 문턱에 못 미쳐 통째로 빠지던 결함 — 2026 5월 고3 29 ③ 실측)
            x0 = wd[0]
            t = wd[4]
            if t[:1] in "①②③④⑤⑥⑦⑧" or (len(t) > 3 and t[0] == "(" and t[2] == ")"):
                x0 = wd[0] + (11.0 if t[:1] in "①②③④⑤⑥⑦⑧" else 16.0)
            width = max(1.0, wd[2] - x0)
            return min(ex, wd[2]) - max(sx, x0) > width * 0.4
        for (sx, ex, sy) in msegs:
            hit = [wd for wd in words if ul_hit(wd, sx, ex, sy)]
            if hit:
                hit.sort(key=lambda wd: (round(wd[1], 1), wd[0]))
                # 직전 단어(마커 ①/(a) 등) — 같은 줄에서 왼쪽 가장 가까운 단어
                line_words = [wd for wd in words if abs(wd[3] - hit[0][3]) < 3.0 and wd[2] <= hit[0][0] + 0.5]
                line_words.sort(key=lambda wd: wd[2])
                prev = delig(line_words[-1][4]) if line_words else None
                underlines.append({"page": pnum, "col": col_of(sx, w, gut), "y": round(sy, 1),
                                   "x0": round(sx, 1), "x1": round(ex, 1),
                                   "words": delig(" ".join(wd[4] for wd in hit)), "prev": prev})
            elif ex - sx > 30:
                bcol = col_of(sx, w, gut)
                line_words = [wd for wd in words if wd[3] - 3.0 <= sy <= wd[3] + 4.0 and col_of(wd[0], w, gut) == bcol]
                left = sorted([wd for wd in line_words if sx - 220 <= wd[2] <= sx + 3], key=lambda x: x[2])
                right = sorted([wd for wd in line_words if ex - 3 <= wd[0] <= ex + 220], key=lambda x: x[0])
                prev_words = sorted([wd for wd in words if sy - 18 <= wd[3] <= sy - 5 and col_of(wd[0], w, gut) == bcol],
                                    key=lambda x: (x[3], x[0]))
                blanks.append({"page": pnum, "col": bcol, "y": round(sy, 1), "x0": round(sx, 1), "x1": round(ex, 1),
                               "after": delig(" ".join(x[4] for x in left[-3:])) if left else None,
                               "afterPrev": delig(" ".join(x[4] for x in prev_words[-3:])) if prev_words else None,
                               "before": delig(" ".join(x[4] for x in right[:3])) if right else None})
        for r in rects:
            # 박스 본문은 단어 정렬이 아니라 **줄 스트림**으로 조립한다 — 단어 (y,x) 정렬은 요약문의
            # "(A)" 라벨(빈칸선 위에 작은 글자)이 줄 앞으로 튀어 "(A) Exploring one …" 처럼 어순이 깨진다(2024 수능 40 실측).
            in_lines = [l for l in merged if l["col"] == col_of(r.x0, w, gut) and r.y0 - 2 <= l["y"] and l["y1"] <= r.y1 + 3
                        and l["x"] >= r.x0 - 4 and l["x1"] <= r.x1 + 4]
            if len(in_lines) >= 1 and sum(len(l["text"]) for l in in_lines) >= 12:
                tl = []
                for l in in_lines:
                    t = l["text"]
                    if tl and tl[-1].endswith("-") and t[:1].islower():
                        tl[-1] = tl[-1][:-1] + t
                    else:
                        tl.append(t)
                b = {"page": pnum, "col": col_of(r.x0, w, gut), "y0": round(r.y0, 1), "y1": round(r.y1, 1), "h": round(r.height, 1),
                     "x0": round(r.x0, 1), "x1": round(r.x1, 1), "text": " ".join(tl)}
                if not any(x["page"] == b["page"] and abs(x["y0"] - b["y0"]) < 3 and abs(x["h"] - b["h"]) < 3 for x in boxes):
                    boxes.append(b)
        pages_out.append({"page": pnum, "width": round(w, 1), "height": round(pg.rect.height, 1)})

    # ── 문항 절단: 스트림에서 행 머리 NN. (단조 증가·점프 ≤ 6) ──
    def at_anchor(l):
        # 문항 번호는 반드시 단 왼쪽 여백에서 시작한다 — 본문 안의 "20. The rental fee is $50."(2024 3월 고2)
        # 처럼 들여쓴 줄머리 숫자를 거른다. anchors 실측 실패 시엔 필터하지 않는다.
        return anchors is None or min(abs(l["x"] - a) for a in anchors) <= 1.5

    marks = []
    for i, l in enumerate(stream):
        m = QNUM_RE.match(l["text"])
        if m:
            if tune.get("anchor") and not at_anchor(l):
                continue
            marks.append((i, int(m.group(1))))

    def monotone(ms):
        out, last = [], None
        for i, n in ms:
            if n < 18:
                continue
            if last is None or (n >= last and n - last <= 6):
                out.append((i, n))
                last = n
        return out

    seq = monotone(marks)
    # 완화 보충: 확정 구간(lo~hi) 안에서 **빠진 번호만**, 앵커 x 에서 시작하고 앞뒤 확정 문항 사이 위치에
    # 유일하게 등장하는 줄을 문항 머리로 인정한다(마침표 소실·숫자 커닝 분리 PDF 구제).
    if tune.get("relax") and seq:
        lo, hi = seq[0][1], seq[-1][1]
        have = {n for _, n in seq}
        cand = {}
        for i, l in enumerate(stream):
            m2 = QNUM_RELAX_RE.match(l["text"])
            if not m2:
                continue
            v = int(m2.group(1) + m2.group(2))
            if v in have or not (lo <= v <= hi) or not at_anchor(l):
                continue
            prev_i = max([j for j, n in seq if n < v], default=-1)
            next_i = min([j for j, n in seq if n > v], default=len(stream))
            if prev_i < i < next_i:
                cand.setdefault(v, []).append(i)
        add = [(v[0], n) for n, v in cand.items() if len(v) == 1]
        if add:
            marks = sorted(marks + add)
            seq = monotone(marks)
    questions = {}
    for k, (i, n) in enumerate(seq):
        end = seq[k + 1][0] if k + 1 < len(seq) else len(stream)
        ls = stream[i:end]
        # 하이픈 결합 + 줄 결합
        text_lines = []
        for l in ls:
            t = l["text"]
            if text_lines and text_lines[-1].endswith("-") and t[:1].islower():
                text_lines[-1] = text_lines[-1][:-1] + t
            else:
                text_lines.append(t)
        text = "\n".join(text_lines)
        pt = re.search(r"\[(\d)\s*점\]", text)
        foot = [x.strip() for x in re.findall(r"(?m)^\s*(\*{1,3}\s*[A-Za-z][^\n]*?:[^\n]*)$", text)]
        # 공간 범위 — (page, col) 별 y 구간
        span = {}
        for l in ls:
            key = (l["page"], l["col"])
            y0, y1 = span.get(key, (l["y"], l["y1"]))
            span[key] = (min(y0, l["y"]), max(y1, l["y1"]))
        def inside(o):
            key = (o["page"], o["col"])
            if key not in span:
                return False
            y0, y1 = span[key]
            oy = o.get("y", o.get("y0"))
            return y0 - 4 <= oy <= y1 + 6
        wtext = "\n".join(l["text"] for l in wstream if inside(l))
        questions[str(n)] = {
            "qNum": n, "page": ls[0]["page"], "col": ls[0]["col"], "text": text, "wtext": wtext,
            "lines": [{"page": l["page"], "col": l["col"], "y": l["y"], "text": l["text"]} for l in ls],
            "underlines": [u for u in underlines if inside(u)],
            "blanks": [b for b in blanks if inside(b)],
            "boxes": [b for b in boxes if inside(b)],
            "point": int(pt.group(1)) if pt else None,
            "footnotes": foot,
        }
    res = {"examId": exam_id, "sourcePdf": os.path.basename(pdf_path), "form": form, "pages": pages_out,
           "questionCount": len(questions), "questions": questions}
    if tune:
        res["tuning"] = {k: v for k, v in sorted(tune.items())}
        if anchors:
            res["tuning"]["anchorsX"] = [round(anchors[0], 1), round(anchors[1], 1)]
    return res


# 시험지 한 벌의 독해 영역은 18~45(2014 이후) 또는 18~50(2013 이전) 로 **연속**이다 — 이게 완결 판정 기준.
def _score(res):
    ns = sorted(int(k) for k in res["questions"])
    if not ns:
        return (0, 0, 0)
    run = 0
    if ns[0] == 18:
        run = 1
        for a, b in zip(ns, ns[1:]):
            if b == a + 1:
                run += 1
            else:
                break
    done = 1 if (ns[0] == 18 and run == len(ns) and ns[-1] in (45, 50)) else 0
    return (done, run, len(ns))


# 기본 경로가 완결이면 **그대로 반환**한다(기존 211 회차 산출 바이트 동일). 결손일 때만 실측 튜닝을 차례로 시도.
TUNINGS = [
    {"anchor": True},
    {"anchor": True, "relax": True},
    {"gutter": True},
    {"gutter": True, "anchor": True},
    {"gutter": True, "anchor": True, "relax": True},
]


def extract_best(pdf_path, exam_id):
    base = extract(pdf_path, exam_id)
    if _score(base)[0] == 1 or not base["questions"]:
        return base
    best = base
    for t in TUNINGS:
        try:
            r = extract(pdf_path, exam_id, t)
        except Exception:  # noqa
            continue
        if _score(r) > _score(best):
            best = r
        if _score(best)[0] == 1:
            break
    return best


def run_one(pdf, exam_id, out_dir):
    os.makedirs(out_dir, exist_ok=True)
    res = extract_best(pdf, exam_id)
    with open(os.path.join(out_dir, f"{exam_id}.json"), "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    qs = res["questions"]
    ul = sum(len(q["underlines"]) for q in qs.values())
    bl = sum(len(q["blanks"]) for q in qs.values())
    bx = sum(len(q["boxes"]) for q in qs.values())
    tag = "" if "tuning" not in res else f"  tuned={ {k: v for k, v in res['tuning'].items() if k != 'anchorsX'} }"
    print(f"{exam_id}: q {len(qs)} [{min(map(int, qs)) if qs else '-'}~{max(map(int, qs)) if qs else '-'}] underlines {ul} blanks {bl} boxes {bx}{tag}")
    return res


if __name__ == "__main__":
    if sys.argv[1] == "--batch":
        man = json.load(open(sys.argv[2], encoding="utf-8"))
        out_dir = sys.argv[3]
        fails = []
        for m in man:
            try:
                run_one(m["pdf"], m["examId"], out_dir)
            except Exception as e:  # noqa
                fails.append((m["examId"], str(e)))
                print("FAIL", m["examId"], e)
        print("done; fails", len(fails))
    else:
        run_one(sys.argv[1], sys.argv[2], sys.argv[3])
