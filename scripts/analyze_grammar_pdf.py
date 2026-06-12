import csv
import json
import os
import re
import statistics
from collections import Counter, defaultdict
from pathlib import Path

import fitz


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "docs" / "grammar_1000_analysis"
PDF_NAME_HINT = "1000"


QUESTION_START_RE = re.compile(r"(?m)^(?P<num>\d{1,4})\.\s")
ANSWER_START_RE = re.compile(r"(?m)^(?P<num>\d{1,4})\)\s")
ANSWER_CHOICE_RE = re.compile(r"(?<!\d)([①②③④⑤]|[1-5])(?!\d)")
ANSWER_EXPLICIT_RE = re.compile(r"\[정답\]\s*([①②③④⑤]|[1-5])")
CHOICE_MAP = {
    "①": "1",
    "②": "2",
    "③": "3",
    "④": "4",
    "⑤": "5",
    "1": "1",
    "2": "2",
    "3": "3",
    "4": "4",
    "5": "5",
}


POINT_PATTERNS = [
    (
        "수일치",
        [
            "수일치",
            "주어 동사 일치",
            "주어와 동사",
            "주어가 단수",
            "주어가 복수",
            "주어는 단수",
            "주어는 복수",
            "단수 동사",
            "복수 동사",
            "동사는 단수",
            "동사는 복수",
            "동사도 단수",
            "동사도 복수",
            "has / have",
            "is / are",
            "was / were",
            "make / makes",
            "go / goes",
            "depend는",
        ],
    ),
    (
        "시제·상",
        [
            "시제",
            "현재완료",
            "과거완료",
            "완료",
            "과거시제",
            "현재시제",
            "주절의 시제",
            "had p.p",
            "has taken",
            "have been",
            "가정법 과거완료",
        ],
    ),
    (
        "태·분사",
        [
            "현재분사",
            "과거분사",
            "분사",
            "분사구문",
            "능동",
            "수동",
            "수동태",
            "능동태",
            "수동의 의미",
            "감정동사",
            "be p.p",
            "p.p",
        ],
    ),
    (
        "to부정사·동명사",
        [
            "to부정사",
            "부정사",
            "동명사",
            "원형부정사",
            "동사원형",
            "사역동사",
            "지각동사",
            "전치사 뒤",
            "전치사 다음",
            "목적보어",
            "remember",
            "avoid",
            "contribute to",
            "object to",
            "stop＋",
            "stop+",
            "help`+`목적어",
        ],
    ),
    (
        "관계사",
        [
            "관계대명사",
            "관계부사",
            "선행사",
            "목적격 관계대명사",
            "주격 관계대명사",
            "소유격 관계대명사",
            "which[that]",
            "what은",
            "what으로",
            "where로",
            "in which",
        ],
    ),
    (
        "접속사·전치사",
        [
            "접속사",
            "전치사",
            "부사절",
            "명사절",
            "because of",
            "while / during",
            "although / despite",
            "in that",
            "depending on",
            "means of",
            "object of",
            "due to",
        ],
    ),
    (
        "대명사·지시어",
        [
            "대명사",
            "재귀대명사",
            "지시대명사",
            "소유격대명사",
            "itself",
            "themselves",
            "대명사는",
            "받는 대명사",
        ],
    ),
    (
        "형용사·부사",
        [
            "형용사",
            "부사",
            "보어",
            "수식",
            "비교급",
            "최상급",
            "형용사의 형태",
            "부사의 형태",
            "부사가 필요",
            "형용사가 필요",
            "형용사인",
            "부사인",
        ],
    ),
    (
        "병렬·구조",
        [
            "병렬",
            "병렬 구조",
            "연결",
            "상응",
            "비교 대상",
            "동일한 형태",
            "not only",
            "both A and B",
            "either A or B",
            "neither A nor B",
        ],
    ),
    (
        "명사·관사·수량",
        [
            "명사",
            "관사",
            "셀 수",
            "복수형",
            "수량",
            "명사형",
            "단수형을 사용",
            "number of",
            "amount of",
            "ten-dollar",
            "shortage",
        ],
    ),
    (
        "어순·도치·강조",
        [
            "어순",
            "도치",
            "강조",
            "평서문 어순",
            "간접의문문",
            "감탄문",
            "Only then",
            "Never가",
            "the+비교급",
        ],
    ),
    (
        "가정법·법",
        [
            "가정법",
            "should",
            "suggest",
            "require",
            "recommend",
            "demand",
            "insist",
            "would rather",
        ],
    ),
    (
        "완전타동사·어법성 동사",
        [
            "타동사",
            "자동사",
            "목적어가 없",
            "목적어 역할",
            "전치사를 필요로 하지",
            "discuss",
            "marry",
            "reach",
            "enter",
            "approach",
            "attend",
            "raise",
            "lie",
            "lay",
        ],
    ),
]

TRAP_PATTERNS = [
    (
        "긴 주어-동사 거리",
        ["주어와 동사", "주어가 단수", "주어가 복수", "전치사구", "관계절", "삽입", "number of"],
    ),
    (
        "능동/수동 의미관계 혼동",
        ["능동", "수동", "현재분사", "과거분사", "분사구문", "대상", "수반"],
    ),
    (
        "전치사 뒤 동명사",
        ["전치사", "동명사", "object to", "contribute to", "look forward to", "due to"],
    ),
    (
        "관계사 격·선행사 혼동",
        ["선행사", "관계대명사", "관계부사", "소유격", "목적격", "what은", "what으로", "where로"],
    ),
    (
        "형용사/부사 자리 혼동",
        ["형용사", "부사", "보어", "수식", "서술적용법"],
    ),
    (
        "병렬 형태 불일치",
        ["병렬", "병렬 구조", "상응", "동일한 형태", "both A and B", "either A or B", "neither A nor B"],
    ),
    (
        "문맥 시제·완료 함정",
        ["시제", "현재완료", "과거완료", "완료", "과거시제", "현재시제"],
    ),
    (
        "준동사 목적어 선택",
        ["부정사", "동명사", "동사원형", "사역동사", "지각동사"],
    ),
    (
        "대명사 지시대상/수 일치",
        ["대명사", "재귀대명사", "지시대명사", "itself", "themselves"],
    ),
    (
        "숙어처럼 보이는 구조",
        ["구문", "표현", "no matter", "the+비교급", "less from", "so ~ that", "too ~ to"],
    ),
]


def find_pdf() -> Path:
    matches = [
        p
        for p in ROOT.glob("*.pdf")
        if PDF_NAME_HINT in p.name and "어법" in p.name
    ]
    if not matches:
        matches = [p for p in ROOT.glob("*.pdf") if PDF_NAME_HINT in p.name]
    if not matches:
        raise FileNotFoundError("Could not find target PDF")
    return matches[0]


def normalize_text(text: str) -> str:
    text = text.replace("\x00", " ")
    text = text.replace("\ufeff", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_pages(pdf_path: Path):
    doc = fitz.open(pdf_path)
    pages = []
    for i, page in enumerate(doc, start=1):
        text = normalize_text(page.get_text("text"))
        pages.append(
            {
                "page": i,
                "chars": len(text),
                "text": text,
                "has_question_start": bool(QUESTION_START_RE.search(text)),
                "has_answer_start": bool(ANSWER_START_RE.search(text)),
                "has_explanation": "[해설]" in text or "☞" in text,
            }
        )
    return doc, pages


def section_boundaries(pages):
    first_answer_like = None
    for page in pages:
        if page["page"] > 100 and page["has_explanation"] and page["has_answer_start"]:
            first_answer_like = page["page"]
            break
    if first_answer_like is None:
        first_answer_like = len(pages) + 1
    return first_answer_like


def split_numbered_blocks(text: str, pattern: re.Pattern, start_key: str):
    matches = list(pattern.finditer(text))
    blocks = []
    for i, match in enumerate(matches):
        num = int(match.group("num"))
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        block = text[start:end].strip()
        blocks.append({"number": num, start_key: start, "text": block})
    return blocks


def parse_questions(question_pages):
    combined_parts = []
    offset_pages = []
    current_len = 0
    for page in question_pages:
        page_marker = f"\n\n[[PAGE {page['page']}]]\n"
        combined_parts.append(page_marker)
        current_len += len(page_marker)
        offset_pages.append((current_len, page["page"]))
        combined_parts.append(page["text"])
        current_len += len(page["text"])
    combined = "\n".join(combined_parts)
    matches = sequential_matches(QUESTION_START_RE.finditer(combined), 1, 1570)
    questions = []
    for i, match in enumerate(matches):
        num = int(match.group("num"))
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(combined)
        block = combined[start:end].strip()
        page_match = list(re.finditer(r"\[\[PAGE (\d+)\]\]", combined[:start]))
        page = int(page_match[-1].group(1)) if page_match else None
        questions.append(parse_question_block(num, page, block))
    return questions


def parse_question_block(num: int, page: int, block: str):
    first_line = block.splitlines()[0] if block.splitlines() else ""
    prompt = re.sub(rf"^{num}\.\s*", "", first_line).strip()
    lower_block = block.lower()
    bracket_pairs = re.findall(r"\[[^\[\]]+?/[^]]+?\]", block)
    option_count = len(re.findall(r"(?<!\d)[①②③④⑤]", block))
    underlined = "밑줄" in block or "①" in block and "어법상 틀" in block
    if bracket_pairs:
        form_type = "A/B/C 선택형" if re.search(r"\(A\)|\(B\)|\(C\)", block) else "괄호 선택형"
    elif underlined:
        form_type = "밑줄 오류 찾기"
    elif "어법상" in block and "틀린" in block:
        form_type = "어법 오류 찾기"
    else:
        form_type = "기타"
    if "맞는 표현" in block or "어법에 맞는" in block:
        task_polarity = "정답 선택"
    elif "틀린" in block or "잘못" in block or "어색" in block:
        task_polarity = "오류 선택"
    elif "옳은" in block:
        task_polarity = "옳은 것 선택"
    else:
        task_polarity = "기타"
    englishish = re.sub(r"[가-힣ㄱ-ㅎㅏ-ㅣ]", " ", block)
    avg_sentence_len = average_sentence_length(englishish)
    return {
        "number": num,
        "page": page,
        "prompt": prompt[:220],
        "form_type": form_type,
        "task_polarity": task_polarity,
        "bracket_pair_count": len(bracket_pairs),
        "option_count": option_count,
        "char_count": len(block),
        "avg_sentence_len": round(avg_sentence_len, 1),
        "has_translation": "[해석]" in block or re.search(r"[가-힣]{10,}", block) is not None,
        "raw": block,
    }


def average_sentence_length(text: str) -> float:
    sentences = [s.strip() for s in re.split(r"[.!?]\s+", text) if s.strip()]
    lengths = []
    for sentence in sentences:
        words = re.findall(r"[A-Za-z']+", sentence)
        if words:
            lengths.append(len(words))
    return statistics.mean(lengths) if lengths else 0.0


def parse_answers(answer_pages):
    combined_parts = []
    for page in answer_pages:
        combined_parts.append(f"\n\n[[PAGE {page['page']}]]\n")
        combined_parts.append(page["text"])
    combined = "\n".join(combined_parts)
    matches = ranged_matches(ANSWER_START_RE.finditer(combined), 1, 1570)
    answers = {}
    for i, match in enumerate(matches):
        num = int(match.group("num"))
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(combined)
        block = combined[start:end].strip()
        page_match = list(re.finditer(r"\[\[PAGE (\d+)\]\]", combined[:start]))
        page = int(page_match[-1].group(1)) if page_match else None
        if num not in answers:
            answers[num] = parse_answer_block(num, page, block)
    repair_known_answer_extraction_issues(answers)
    return answers


def repair_known_answer_extraction_issues(answers):
    # PyMuPDF extracts the answer marker for 181 as the stray text "183 182) ②"
    # inside the 180 block. The explanation clearly belongs to question 181.
    if 181 in answers or 180 not in answers:
        pass
    else:
        raw = answers[180]["raw"]
        marker = "\n183 182) ②"
        if marker in raw:
            left, right = raw.split(marker, 1)
            page = answers[180].get("answer_page", "")
            answers[180] = parse_answer_block(180, page, left.strip())
            repaired_raw = "181) ②" + right
            answers[181] = parse_answer_block(181, page, repaired_raw.strip())

    if 1258 in answers and not answers[1258].get("answer_choice"):
        answers[1258]["answer_choice"] = "④"
        answers[1258]["answer_num"] = "4"
        answers[1258]["head"] = (answers[1258].get("head") or "1258)") + " ④"


def sequential_matches(matches, start_number: int, end_number: int):
    accepted = []
    expected = start_number
    for match in matches:
        num = int(match.group("num"))
        if num == expected:
            accepted.append(match)
            expected += 1
            if expected > end_number:
                break
    return accepted


def ranged_matches(matches, start_number: int, end_number: int):
    return [
        match
        for match in matches
        if start_number <= int(match.group("num")) <= end_number
    ]


def parse_answer_block(num: int, page: int, block: str):
    head = block.splitlines()[0] if block.splitlines() else ""
    choice = None
    m = ANSWER_CHOICE_RE.search(head)
    if not m:
        m = ANSWER_CHOICE_RE.search(block[:300])
    if not m:
        m = ANSWER_EXPLICIT_RE.search(block)
    if m:
        choice = m.group(1)
    explanation = block
    if "[해설]" in block:
        explanation = block.split("[해설]", 1)[1]
    elif "☞" in block:
        explanation = block.split("☞", 1)[1]
    return {
        "number": num,
        "answer_page": page,
        "answer_choice": choice,
        "answer_num": CHOICE_MAP.get(choice, ""),
        "head": head[:180],
        "explanation": explanation.strip(),
        "raw": block,
    }


def classify_text(text: str, patterns):
    scores = []
    folded = text.lower()
    for label, keys in patterns:
        score = 0
        hits = []
        for key in keys:
            key_folded = key.lower()
            count = folded.count(key_folded)
            if count:
                score += count
                hits.append(key)
        if score:
            scores.append((label, score, hits[:8]))
    scores.sort(key=lambda item: (-item[1], item[0]))
    return scores


def difficulty_for(question, point_labels, trap_labels, answer):
    score = 0
    reasons = []
    if question["form_type"] == "밑줄 오류 찾기":
        score += 2
        reasons.append("밑줄 5지선다 오류판정")
    if question["bracket_pair_count"] >= 3:
        score += 1
        reasons.append("세 지점 동시 판단")
    elif question["bracket_pair_count"] >= 1:
        score += 0
        reasons.append("괄호 선택")
    if question["avg_sentence_len"] >= 22:
        score += 2
        reasons.append("평균 문장 길이 김")
    elif question["avg_sentence_len"] >= 16:
        score += 1
        reasons.append("문장 길이 보통 이상")
    if question["char_count"] >= 1900:
        score += 2
        reasons.append("지문/해설량 많음")
    elif question["char_count"] >= 1200:
        score += 1
        reasons.append("지문량 보통 이상")
    advanced_points = {"관계사", "태·분사", "병렬·구조", "가정법·법", "어순·도치·강조", "완전타동사·어법성 동사"}
    unique_points = len(set(point_labels))
    if unique_points >= 3:
        score += 2
    elif unique_points == 2:
        score += 1
    if set(point_labels) & advanced_points:
        score += 1
        reasons.append("고난도 빈출 포인트 포함")
    if len(trap_labels) >= 2:
        score += 1
        reasons.append("함정 패턴 복합")
    explanation = answer.get("explanation", "") if answer else ""
    if any(token in explanation for token in ["생략", "삽입", "도치", "병렬", "가정법", "관계부사", "완전타동사"]):
        score += 1
        reasons.append("해설상 구조 판단 필요")
    if score <= 4:
        level = "하"
    elif score <= 7:
        level = "중"
    else:
        level = "상"
    return level, score, "; ".join(reasons)


def classify_questions(questions, answers):
    rows = []
    for question in questions:
        answer = answers.get(question["number"], {})
        joined = "\n".join(
            [
                question.get("raw", ""),
                answer.get("head", ""),
                answer.get("explanation", ""),
            ]
        )
        points = classify_text(joined, POINT_PATTERNS)
        traps = classify_text(joined, TRAP_PATTERNS)
        point_labels = [label for label, _, _ in points[:3]]
        trap_labels = [label for label, _, _ in traps[:3]]
        level, score, reason = difficulty_for(question, point_labels, trap_labels, answer)
        rows.append(
            {
                "number": question["number"],
                "question_page": question["page"],
                "answer_page": answer.get("answer_page", ""),
                "answer_choice": answer.get("answer_choice", ""),
                "answer_num": answer.get("answer_num", ""),
                "form_type": question["form_type"],
                "task_polarity": question["task_polarity"],
                "difficulty": level,
                "difficulty_score": score,
                "difficulty_reason": reason,
                "primary_points": "; ".join(point_labels) if point_labels else "미분류",
                "trap_patterns": "; ".join(trap_labels) if trap_labels else "미분류",
                "prompt": question["prompt"],
                "bracket_pair_count": question["bracket_pair_count"],
                "avg_sentence_len": question["avg_sentence_len"],
                "char_count": question["char_count"],
                "answer_head": answer.get("head", ""),
                "explanation_excerpt": answer.get("explanation", "")[:500].replace("\n", " "),
            }
        )
    return rows


def write_csv(path: Path, rows, fieldnames):
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def summarize(rows, pages, first_answer_page):
    by_form = Counter(row["form_type"] for row in rows)
    by_level = Counter(row["difficulty"] for row in rows)
    by_point = Counter()
    by_trap = Counter()
    point_by_level = defaultdict(Counter)
    trap_by_level = defaultdict(Counter)
    form_by_level = defaultdict(Counter)
    for row in rows:
        level = row["difficulty"]
        form_by_level[level][row["form_type"]] += 1
        for point in row["primary_points"].split("; "):
            if point and point != "미분류":
                by_point[point] += 1
                point_by_level[level][point] += 1
        for trap in row["trap_patterns"].split("; "):
            if trap and trap != "미분류":
                by_trap[trap] += 1
                trap_by_level[level][trap] += 1
    summary = {
        "page_count": len(pages),
        "first_answer_page": first_answer_page,
        "question_count": len(rows),
        "forms": by_form,
        "difficulties": by_level,
        "points": by_point,
        "traps": by_trap,
        "point_by_level": {k: v for k, v in point_by_level.items()},
        "trap_by_level": {k: v for k, v in trap_by_level.items()},
        "form_by_level": {k: v for k, v in form_by_level.items()},
    }
    return summary


def counter_table(counter, limit=None):
    items = counter.most_common(limit)
    return "\n".join(f"| {name} | {count} |" for name, count in items)


def write_markdown(summary, rows):
    out = []
    out.append("# 어법 초중고 1000 PDF 구조 분석\n")
    out.append("## 기본 구조\n")
    out.append(f"- 전체 페이지: {summary['page_count']}")
    out.append(f"- 정답/해설 시작 추정 페이지: {summary['first_answer_page']}")
    out.append(f"- 파싱된 문항 수: {summary['question_count']}")
    out.append("\n## 문항 형식 분포\n")
    out.append("| 형식 | 문항 수 |\n|---|---:|")
    out.append(counter_table(summary["forms"]))
    out.append("\n## 난이도 분포\n")
    out.append("| 난이도 | 문항 수 |\n|---|---:|")
    out.append(counter_table(summary["difficulties"]))
    out.append("\n## 주요 어법 포인트 빈도\n")
    out.append("| 포인트 | 출현 문항 수 |\n|---|---:|")
    out.append(counter_table(summary["points"]))
    out.append("\n## 주요 함정 패턴 빈도\n")
    out.append("| 함정 | 출현 문항 수 |\n|---|---:|")
    out.append(counter_table(summary["traps"]))
    out.append("\n## 난이도별 상위 포인트\n")
    for level in ["하", "중", "상"]:
        out.append(f"\n### {level}\n")
        out.append("| 포인트 | 문항 수 |\n|---|---:|")
        out.append(counter_table(summary["point_by_level"].get(level, Counter()), 12))
    out.append("\n## 난이도별 대표 문항\n")
    for level in ["하", "중", "상"]:
        samples = [r for r in rows if r["difficulty"] == level][:12]
        out.append(f"\n### {level}\n")
        out.append("| 번호 | 형식 | 포인트 | 함정 | 정답 |")
        out.append("|---:|---|---|---|---|")
        for r in samples:
            out.append(
                f"| {r['number']} | {r['form_type']} | {r['primary_points']} | {r['trap_patterns']} | {r['answer_choice']} |"
            )
    return "\n".join(out) + "\n"


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    pdf_path = find_pdf()
    doc, pages = extract_pages(pdf_path)
    first_answer_page = section_boundaries(pages)
    question_pages = [p for p in pages if p["page"] < first_answer_page]
    answer_pages = [p for p in pages if p["page"] >= first_answer_page]

    questions = parse_questions(question_pages)
    answers = parse_answers(answer_pages)
    rows = classify_questions(questions, answers)
    summary = summarize(rows, pages, first_answer_page)

    pages_jsonl = OUT_DIR / "pages.jsonl"
    with pages_jsonl.open("w", encoding="utf-8") as f:
        for page in pages:
            f.write(json.dumps(page, ensure_ascii=False) + "\n")

    questions_json = OUT_DIR / "questions.json"
    questions_json.write_text(json.dumps(questions, ensure_ascii=False, indent=2), encoding="utf-8")

    answers_json = OUT_DIR / "answers.json"
    answers_json.write_text(json.dumps(answers, ensure_ascii=False, indent=2), encoding="utf-8")

    classified_json = OUT_DIR / "classified_questions.json"
    classified_json.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    write_csv(
        OUT_DIR / "classified_questions.csv",
        rows,
        [
            "number",
            "question_page",
            "answer_page",
            "answer_choice",
            "answer_num",
            "form_type",
            "task_polarity",
            "difficulty",
            "difficulty_score",
            "difficulty_reason",
            "primary_points",
            "trap_patterns",
            "prompt",
            "bracket_pair_count",
            "avg_sentence_len",
            "char_count",
            "answer_head",
            "explanation_excerpt",
        ],
    )

    serializable_summary = {
        key: dict(value) if isinstance(value, Counter) else value
        for key, value in summary.items()
        if key not in {"point_by_level", "trap_by_level", "form_by_level"}
    }
    for key in ["point_by_level", "trap_by_level", "form_by_level"]:
        serializable_summary[key] = {k: dict(v) for k, v in summary[key].items()}
    (OUT_DIR / "summary.json").write_text(
        json.dumps(serializable_summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (OUT_DIR / "summary.md").write_text(write_markdown(summary, rows), encoding="utf-8")

    missing_answers = [q["number"] for q in questions if q["number"] not in answers]
    duplicate_questions = [
        number
        for number, count in Counter(q["number"] for q in questions).items()
        if count > 1
    ]
    print(json.dumps(
        {
            "pdf": str(pdf_path),
            "pages": doc.page_count,
            "first_answer_page": first_answer_page,
            "questions": len(questions),
            "answers": len(answers),
            "missing_answers": missing_answers[:30],
            "missing_answer_count": len(missing_answers),
            "duplicate_questions": duplicate_questions[:30],
            "output_dir": str(OUT_DIR),
            "difficulty": dict(summary["difficulties"]),
            "forms": dict(summary["forms"]),
            "top_points": summary["points"].most_common(10),
            "top_traps": summary["traps"].most_common(10),
        },
        ensure_ascii=False,
        indent=2,
    ))


if __name__ == "__main__":
    main()
