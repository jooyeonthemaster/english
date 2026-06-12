import csv
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ANALYSIS_DIR = ROOT / "docs" / "grammar_1000_analysis"
OUT_DIR = ANALYSIS_DIR / "exhaustive_audit"

CIRCLED_PRIMARY = ["①", "②", "③", "④", "⑤"]
CIRCLED_ALT = ["➀", "➁", "➂", "➃", "➄"]
CIRCLED = CIRCLED_PRIMARY + CIRCLED_ALT
CIRCLED_TO_NUM = {
    **{mark: str(i + 1) for i, mark in enumerate(CIRCLED_PRIMARY)},
    **{mark: str(i + 1) for i, mark in enumerate(CIRCLED_ALT)},
}
NUM_TO_CIRCLED = {str(i + 1): mark for i, mark in enumerate(CIRCLED_PRIMARY)}
MARKER_RE = re.compile("|".join(re.escape(mark) for mark in CIRCLED))
OCR_CANDIDATE_REPAIRS = {
    "Reasonabe": "Reasonable",
    "Reasonaby": "Reasonably",
    "h instructing": "instructing",
}
KNOWN_OPTION_ASSIGNMENTS = {
    37: {
        "1": {"A": "watching", "B": "Seeing", "C": "exciting"},
        "2": {"A": "to watch", "B": "Seeing", "C": "exciting"},
        "3": {"A": "watching", "B": "Seeing", "C": "excitingly"},
        "4": {"A": "to watch", "B": "Seen", "C": "excitingly"},
        "5": {"A": "watching", "B": "Seen", "C": "excitingly"},
    },
    335: {
        "1": {"A": "that", "B": "live", "C": "encountered"},
        "2": {"A": "that", "B": "to live", "C": "encountering"},
        "3": {"A": "which", "B": "live", "C": "encountering"},
        "4": {"A": "which", "B": "to live", "C": "encountering"},
        "5": {"A": "which", "B": "live", "C": "encountered"},
    }
}


def read_json(name):
    return json.loads((ANALYSIS_DIR / name).read_text(encoding="utf-8"))


def clean_text(text):
    text = (text or "").replace("\uffff", "")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def repair_candidate(text):
    text = clean_text(text)
    return OCR_CANDIDATE_REPAIRS.get(text, text)


def compact_token(text):
    text = clean_text(text).lower()
    return re.sub(r"[\s\W_]+", "", text, flags=re.UNICODE)


def english_tokens(text):
    return re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?|\d+", clean_text(text).lower())


def has_subsequence(tokens, candidate_tokens):
    if not candidate_tokens:
        return False
    size = len(candidate_tokens)
    for idx in range(0, len(tokens) - size + 1):
        if tokens[idx : idx + size] == candidate_tokens:
            return True
    return False


def candidate_in_block(candidate, block):
    candidate = clean_text(candidate)
    block = clean_text(block)
    if not candidate or not block:
        return False
    candidate_tokens = english_tokens(candidate)
    if candidate_tokens:
        return has_subsequence(english_tokens(block), candidate_tokens)
    return compact_token(candidate) in compact_token(block)


def extract_slot_pairs(raw):
    pairs = []
    for match in re.finditer(r"\((A|B|C)\)\s*\[([^\[\]\uff3d]+?)\s*/\s*([^\[\]\uff3d]+?)[\]\uff3d]", raw, re.S):
        left = repair_candidate(match.group(2))
        right = repair_candidate(match.group(3))
        suffix = re.match(r"[A-Za-z]+", raw[match.end() : match.end() + 12])
        if suffix and right and re.fullmatch(r"[A-Za-z]+", right):
            right = right + suffix.group(0)
        if left == "hem":
            left = "them"
        pairs.append(
            {
                "slot": match.group(1),
                "left": left,
                "right": right,
                "start": match.start(),
                "end": match.end(),
            }
        )
    return pairs


def split_choice_blocks(raw, start_at=0):
    matches = [m for m in MARKER_RE.finditer(raw) if m.start() >= start_at]
    blocks = {}
    for idx, match in enumerate(matches):
        mark = match.group(0)
        if mark in blocks:
            continue
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(raw)
        blocks[CIRCLED_TO_NUM[mark]] = raw[match.end() : end].strip()
        if len(blocks) == 5:
            break
    return blocks


def assignment_from_value(pair, value):
    candidates = sorted(
        [pair["left"], pair["right"]],
        key=lambda candidate: (len(english_tokens(candidate)), len(clean_text(candidate))),
        reverse=True,
    )
    for candidate in candidates:
        if candidate_in_block(candidate, value):
            return candidate
    return clean_text(value)


def parse_option_assignments(choice_blocks, slot_pairs):
    parsed = {}
    for num, block in choice_blocks.items():
        assignments = {}
        window = block[:500]
        for pair in slot_pairs:
            hits = []
            for side in ["left", "right"]:
                if candidate_in_block(pair[side], window):
                    hits.append(pair[side])
            if len(hits) == 1:
                assignments[pair["slot"]] = hits[0]
            elif len(hits) > 1:
                assignments[pair["slot"]] = sorted(
                    hits,
                    key=lambda candidate: (len(english_tokens(candidate)), len(clean_text(candidate))),
                    reverse=True,
                )[0]
        parsed[num] = {
            "raw": clean_text(block[:300]),
            "assignments": assignments,
        }
    return parsed


def assignment_count(parsed_options):
    return sum(len(option.get("assignments", {})) for option in parsed_options.values())


def parse_vertical_option_table(raw, start_at, slot_pairs):
    segment = raw[start_at : start_at + 1800]
    option_values = {str(i): [] for i in range(1, 6)}
    value_stream = []
    seen_markers = []
    for original_line in segment.splitlines():
        line = clean_text(original_line)
        if not line:
            continue
        if re.fullmatch(r"\(?[ABC]\)?", line):
            continue
        if re.fullmatch(r"[-–—―]+", line):
            continue
        marker_match = MARKER_RE.match(line)
        if marker_match:
            num = CIRCLED_TO_NUM[marker_match.group(0)]
            seen_markers.append(num)
            tail = clean_text(line[marker_match.end() :])
            if tail:
                option_values[num].append(tail)
            continue
        if seen_markers:
            value_stream.append(line)
        if len(value_stream) >= len(slot_pairs) * 5:
            break

    if len(set(seen_markers)) < 5:
        return {}

    start_slot_index = 0
    if all(option_values[str(i)] for i in range(1, 6)):
        first_pair = slot_pairs[0]
        for num in range(1, 6):
            option_values[str(num)] = [
                assignment_from_value(first_pair, option_values[str(num)][0])
            ]
        start_slot_index = 1

    offset = 0
    for slot_index in range(start_slot_index, len(slot_pairs)):
        chunk = value_stream[offset : offset + 5]
        if len(chunk) < 5:
            break
        pair = slot_pairs[slot_index]
        for idx, raw_value in enumerate(chunk, start=1):
            option_values[str(idx)].append(assignment_from_value(pair, raw_value))
        offset += 5

    parsed = {}
    for num in range(1, 6):
        assignments = {}
        values = option_values[str(num)]
        for pair, value in zip(slot_pairs, values):
            assignments[pair["slot"]] = value
        if assignments:
            parsed[str(num)] = {
                "raw": ", ".join(values),
                "assignments": assignments,
            }
    return parsed


def infer_correct_assignments(answer, slot_pairs):
    explanation = answer.get("explanation", "") + "\n" + answer.get("raw", "")
    inferred = {}
    for pair in slot_pairs:
        hits = []
        for side in ["left", "right"]:
            if candidate_in_block(pair[side], explanation):
                hits.append(pair[side])
        if hits:
            inferred[pair["slot"]] = hits[-1]
    return inferred


def split_slot_reasons(explanation):
    explanation = clean_text(explanation)
    positions = []
    for match in re.finditer(r"(?:^|\s|▷)\(?([ABC])\)", explanation):
        positions.append((match.start(), match.group(1)))
    reasons = {}
    for idx, (start, slot) in enumerate(positions):
        end = positions[idx + 1][0] if idx + 1 < len(positions) else len(explanation)
        snippet = clean_text(explanation[start:end])
        if snippet:
            reasons[slot] = snippet[:450]
    return reasons


def abc_audit(question, answer, classified):
    slot_pairs = extract_slot_pairs(question["raw"])
    last_pair_end = max((pair["end"] for pair in slot_pairs), default=0)
    choice_blocks = split_choice_blocks(question["raw"], start_at=last_pair_end)
    parsed_options = parse_option_assignments(choice_blocks, slot_pairs)
    vertical_options = parse_vertical_option_table(question["raw"], last_pair_end, slot_pairs)
    if assignment_count(vertical_options) > assignment_count(parsed_options):
        parsed_options = vertical_options
    if question["number"] in KNOWN_OPTION_ASSIGNMENTS:
        parsed_options = {
            num: {
                "raw": format_assignments(assignments),
                "assignments": assignments,
            }
            for num, assignments in KNOWN_OPTION_ASSIGNMENTS[question["number"]].items()
        }
    answer_num = str(classified.get("answer_num") or answer.get("answer_num") or "")
    correct_assignments = {}
    if answer_num in parsed_options:
        correct_assignments = parsed_options[answer_num]["assignments"]
    if len(correct_assignments) < len(slot_pairs):
        correct_assignments.update(infer_correct_assignments(answer, slot_pairs))

    slot_reason_map = split_slot_reasons(answer.get("explanation", ""))
    correct_core_parts = []
    for pair in slot_pairs:
        slot = pair["slot"]
        value = correct_assignments.get(slot, "")
        correct_core_parts.append(f"{slot}={value or '?'}")
    correct_core = ", ".join(correct_core_parts)

    option_traps = []
    for num in ["1", "2", "3", "4", "5"]:
        option = parsed_options.get(num, {"raw": "", "assignments": {}})
        assignments = option["assignments"]
        mark = NUM_TO_CIRCLED[num]
        if num == answer_num:
            option_traps.append(f"{mark} 정답 조합: {format_assignments(assignments)}")
            continue
        wrongs = []
        for pair in slot_pairs:
            slot = pair["slot"]
            picked = assignments.get(slot)
            correct = correct_assignments.get(slot)
            if picked and correct and picked != correct:
                wrongs.append(f"{slot} {picked}→{correct}")
            elif not picked and correct:
                wrongs.append(f"{slot} 판독불완전→{correct}")
        if wrongs:
            option_traps.append(f"{mark} 오답: " + "; ".join(wrongs))
        else:
            option_traps.append(f"{mark} 오답 원인 자동분해 불완전: {option['raw'][:120]}")

    reasons = []
    for pair in slot_pairs:
        slot = pair["slot"]
        if slot in slot_reason_map:
            reasons.append(slot_reason_map[slot])
    if not reasons:
        reasons.append(clean_text(answer.get("explanation", ""))[:700])

    confidence = "high"
    if len(correct_assignments) < len(slot_pairs) or len(parsed_options) < 5:
        confidence = "medium"
    if not slot_pairs:
        confidence = "low"

    return {
        "audit_kind": "ABC_OPTIONS",
        "correct_core": correct_core,
        "correct_reason": " / ".join(reasons)[:1200],
        "wrong_choice_traps": " | ".join(option_traps),
        "option_1": option_summary(parsed_options.get("1")),
        "option_2": option_summary(parsed_options.get("2")),
        "option_3": option_summary(parsed_options.get("3")),
        "option_4": option_summary(parsed_options.get("4")),
        "option_5": option_summary(parsed_options.get("5")),
        "confidence": confidence,
        "notes": f"slots={len(slot_pairs)}, parsed_options={len(parsed_options)}",
        "structured": {
            "slots": slot_pairs,
            "options": parsed_options,
            "correct_assignments": correct_assignments,
            "slot_reasons": slot_reason_map,
        },
    }


def format_assignments(assignments):
    if not assignments:
        return "조합 판독불완전"
    return ", ".join(f"{slot}={value}" for slot, value in sorted(assignments.items()))


def option_summary(option):
    if not option:
        return ""
    return format_assignments(option.get("assignments", {})) or option.get("raw", "")


def trim_choice_text(block):
    kept = []
    for line in (block or "").splitlines():
        text = clean_text(line)
        if not text:
            continue
        if "[[PAGE" in text or "해설및" in text:
            break
        korean_count = len(re.findall(r"[가-힣]", text))
        latin_count = len(re.findall(r"[A-Za-z]", text))
        if kept and korean_count >= 3 and korean_count > latin_count:
            break
        kept.append(text)
    return clean_text(" ".join(kept))


def extract_underlined_phrases(raw):
    blocks = split_choice_blocks(raw)
    phrases = {}
    for num, block in blocks.items():
        text = clean_text(block)
        text = re.split(r"(?<=[.!?])\s|[,;:]\s|\n", text)[0]
        phrases[num] = text[:100]
    return phrases


def split_circled_reasons(answer_raw):
    if "[해설]" in answer_raw:
        source = answer_raw.split("[해설]", 1)[1]
    else:
        source = answer_raw
    positions = []
    for match in re.finditer("|".join(re.escape(mark) for mark in CIRCLED), source):
        positions.append((match.start(), CIRCLED_TO_NUM[match.group(0)]))
    snippets = {}
    for idx, (start, num) in enumerate(positions):
        end = positions[idx + 1][0] if idx + 1 < len(positions) else len(source)
        snippet = clean_text(source[start:end])
        if snippet:
            snippets[num] = snippet[:500]
    return snippets


def underline_audit(question, answer, classified):
    answer_num = str(classified.get("answer_num") or answer.get("answer_num") or "")
    phrases = extract_underlined_phrases(question["raw"])
    reason_map = split_circled_reasons(answer.get("raw", ""))
    answer_mark = NUM_TO_CIRCLED.get(answer_num, answer.get("answer_choice", ""))

    correct_phrase = phrases.get(answer_num, "")
    correct_reason = reason_map.get(answer_num) or clean_text(answer.get("explanation", ""))[:900]
    correct_core = f"{answer_mark} {correct_phrase}".strip()

    trap_parts = []
    for num in ["1", "2", "3", "4", "5"]:
        mark = NUM_TO_CIRCLED[num]
        phrase = phrases.get(num, "")
        reason = reason_map.get(num, "")
        if num == answer_num:
            trap_parts.append(f"{mark} 정답 오류: {clean_text(reason or correct_reason)[:260]}")
        else:
            if reason:
                trap_parts.append(f"{mark} 맞는 표현/함정: {reason[:260]}")
            elif phrase:
                trap_parts.append(f"{mark} 함정 밑줄: {phrase}")
            else:
                trap_parts.append(f"{mark} 해설 미분리")

    confidence = "high" if correct_reason else "medium"
    if not answer_num:
        confidence = "low"

    return {
        "audit_kind": "UNDERLINE_ERROR",
        "correct_core": correct_core,
        "correct_reason": correct_reason,
        "wrong_choice_traps": " | ".join(trap_parts),
        "option_1": phrases.get("1", ""),
        "option_2": phrases.get("2", ""),
        "option_3": phrases.get("3", ""),
        "option_4": phrases.get("4", ""),
        "option_5": phrases.get("5", ""),
        "confidence": confidence,
        "notes": f"phrases={len(phrases)}, reason_snippets={len(reason_map)}",
        "structured": {
            "underlined_phrases": phrases,
            "circled_reasons": reason_map,
        },
    }


def generic_audit(question, answer, classified):
    choice_blocks = split_choice_blocks(question.get("raw", ""))
    answer_num = str(classified.get("answer_num") or answer.get("answer_num") or "")
    if len(choice_blocks) >= 5 and answer_num:
        trimmed_choices = {
            num: trim_choice_text(text) for num, text in choice_blocks.items()
        }
        correct_choice = trimmed_choices.get(answer_num, "")
        reason = clean_text(answer.get("explanation", ""))[:1200]
        trap_parts = []
        for num in ["1", "2", "3", "4", "5"]:
            mark = NUM_TO_CIRCLED[num]
            choice_text = trimmed_choices.get(num, "")
            if num == answer_num:
                trap_parts.append(f"{mark} 정답 선택지: {choice_text[:350]}")
            else:
                trap_parts.append(f"{mark} 오답/함정 선택지: {choice_text[:280]}")
        return {
            "audit_kind": "GENERIC_CHOICES",
            "correct_core": f"{NUM_TO_CIRCLED.get(answer_num, answer_num)} {correct_choice}".strip(),
            "correct_reason": reason,
            "wrong_choice_traps": " | ".join(trap_parts),
            "option_1": trimmed_choices.get("1", "")[:500],
            "option_2": trimmed_choices.get("2", "")[:500],
            "option_3": trimmed_choices.get("3", "")[:500],
            "option_4": trimmed_choices.get("4", "")[:500],
            "option_5": trimmed_choices.get("5", "")[:500],
            "confidence": "high",
            "notes": f"generic choices parsed={len(choice_blocks)}",
            "structured": {
                "choices": trimmed_choices,
            },
        }
    return {
        "audit_kind": "GENERIC",
        "correct_core": f"{answer.get('answer_choice') or classified.get('answer_choice')}",
        "correct_reason": clean_text(answer.get("explanation", ""))[:1200],
        "wrong_choice_traps": "형식이 혼합형이라 해설 중심으로 보존",
        "option_1": "",
        "option_2": "",
        "option_3": "",
        "option_4": "",
        "option_5": "",
        "confidence": "medium",
        "notes": "generic fallback",
        "structured": {},
    }


def build_rows():
    questions = {item["number"]: item for item in read_json("questions.json")}
    answers = {int(key): value for key, value in read_json("answers.json").items()}
    classified_rows = read_json("classified_questions.json")
    output_rows = []
    structured_rows = []
    for row in classified_rows:
        number = row["number"]
        question = questions[number]
        answer = answers[number]
        if question.get("bracket_pair_count", 0) > 0:
            audit = abc_audit(question, answer, row)
        elif row.get("form_type") == "밑줄 오류 찾기":
            audit = underline_audit(question, answer, row)
        else:
            audit = generic_audit(question, answer, row)

        flat = {
            "number": number,
            "question_page": row.get("question_page", ""),
            "answer_page": row.get("answer_page", ""),
            "form_type": row.get("form_type", ""),
            "task_polarity": row.get("task_polarity", ""),
            "answer_choice": row.get("answer_choice", ""),
            "answer_num": row.get("answer_num", ""),
            "difficulty": row.get("difficulty", ""),
            "difficulty_score": row.get("difficulty_score", ""),
            "primary_points": row.get("primary_points", ""),
            "trap_patterns": row.get("trap_patterns", ""),
            "prompt": clean_text(row.get("prompt", "")),
            "audit_kind": audit["audit_kind"],
            "correct_core": audit["correct_core"],
            "correct_reason": audit["correct_reason"],
            "wrong_choice_traps": audit["wrong_choice_traps"],
            "option_1": audit["option_1"],
            "option_2": audit["option_2"],
            "option_3": audit["option_3"],
            "option_4": audit["option_4"],
            "option_5": audit["option_5"],
            "confidence": audit["confidence"],
            "notes": audit["notes"],
        }
        output_rows.append(flat)
        structured = dict(flat)
        structured["structured"] = audit["structured"]
        structured_rows.append(structured)
    return output_rows, structured_rows


def write_csv(rows):
    fieldnames = list(rows[0].keys())
    with (OUT_DIR / "exhaustive_question_audit.csv").open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_markdown_chunks(rows):
    chunk_size = 100
    index_lines = [
        "# 1570문항 문항별 강박 해부 인덱스",
        "",
        "각 파일은 번호, 정답, 핵심 문법 포인트, 정답 근거, ①-⑤ 오답/함정 분해를 담는다.",
        "",
    ]
    for start in range(1, len(rows) + 1, chunk_size):
        end = min(start + chunk_size - 1, len(rows))
        chunk = rows[start - 1 : end]
        filename = f"audit_{start:04d}_{end:04d}.md"
        index_lines.append(f"- [{start:04d}-{end:04d}]({filename})")
        lines = [f"# 문항별 해부 {start:04d}-{end:04d}", ""]
        for row in chunk:
            lines.append(f"## {row['number']}번")
            lines.append("")
            lines.append(f"- 형식: {row['form_type']} / 난이도: {row['difficulty']}({row['difficulty_score']}) / 정답: {row['answer_choice']}")
            lines.append(f"- 포인트: {row['primary_points']}")
            lines.append(f"- 함정: {row['trap_patterns']}")
            lines.append(f"- 정답 핵심: {row['correct_core']}")
            lines.append(f"- 정답 근거: {row['correct_reason']}")
            lines.append(f"- 오답 선지/함정: {row['wrong_choice_traps']}")
            lines.append(f"- 판독 신뢰도: {row['confidence']} ({row['notes']})")
            lines.append("")
        (OUT_DIR / filename).write_text("\n".join(lines), encoding="utf-8")
    (OUT_DIR / "INDEX.md").write_text("\n".join(index_lines) + "\n", encoding="utf-8")


def write_summary(rows):
    total = len(rows)
    by_kind = {}
    by_conf = {}
    for row in rows:
        by_kind[row["audit_kind"]] = by_kind.get(row["audit_kind"], 0) + 1
        by_conf[row["confidence"]] = by_conf.get(row["confidence"], 0) + 1
    lines = [
        "# 문항별 해부 생성 요약",
        "",
        f"- 총 문항: {total}",
        f"- 해부 형식 분포: {by_kind}",
        f"- 판독 신뢰도 분포: {by_conf}",
        "",
        "이 파일군은 이전 요약 리포트와 달리 ①-⑤ 선택지를 문항별로 분해해 보존한다.",
        "A/B/C형은 정답 조합 대비 각 오답 선택지가 어느 칸에서 틀렸는지 계산했고, 밑줄형은 정답 밑줄과 나머지 밑줄의 해설 단서를 분리했다.",
    ]
    (OUT_DIR / "EXHAUSTIVE_SUMMARY.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    rows, structured_rows = build_rows()
    write_csv(rows)
    (OUT_DIR / "exhaustive_question_audit.json").write_text(
        json.dumps(structured_rows, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    write_markdown_chunks(rows)
    write_summary(rows)
    print(
        json.dumps(
            {
                "rows": len(rows),
                "output_dir": str(OUT_DIR),
                "confidence": {key: sum(1 for row in rows if row["confidence"] == key) for key in ["high", "medium", "low"]},
                "kinds": {key: sum(1 for row in rows if row["audit_kind"] == key) for key in ["ABC_OPTIONS", "UNDERLINE_ERROR", "GENERIC"]},
                "csv": str(OUT_DIR / "exhaustive_question_audit.csv"),
                "index": str(OUT_DIR / "INDEX.md"),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
