from __future__ import annotations

import json
import re
import textwrap
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import fitz


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = next((ROOT / "public").glob("2027*.pdf"))
OUT_DIR = ROOT / "out" / "2027-suneung-english-webtoon-direct"

CODE_RE = re.compile(r"26005-\d{4}")
LONG_GROUP_RE = re.compile(r"(\d{2})~(\d{2})\s+다음 글을 읽고")
SECTION_NOISE_RE = re.compile(
    r"^(Part|I|II|III|유형편|주제·소재편|테스트편|Solving Strategies|정답과 해설|Words & Phrases in Use)\b"
)


@dataclass
class Block:
    page: int
    block_no: int
    x0: float
    y0: float
    x1: float
    y1: float
    text: str

    @property
    def clean(self) -> str:
        return clean_text(self.text)


def clean_text(value: str) -> str:
    value = value.replace("\u0003", "")
    value = value.replace("\u0007", "")
    value = value.replace("\ufeff", "")
    value = value.replace("\u200c", "")
    value = value.replace("\u00a0", " ")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def normalize_for_prompt(value: str) -> str:
    value = clean_text(value)
    value = value.replace("\n", " ")
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def load_pages() -> dict[int, list[Block]]:
    doc = fitz.open(PDF_PATH)
    pages: dict[int, list[Block]] = {}
    for page_no in range(10, 240):
        blocks: list[Block] = []
        for raw in doc[page_no - 1].get_text("blocks"):
            x0, y0, x1, y1, text, block_no, block_type = raw[:7]
            if block_type != 0:
                continue
            block = Block(
                page=page_no,
                block_no=int(block_no),
                x0=float(x0),
                y0=float(y0),
                x1=float(x1),
                y1=float(y1),
                text=text,
            )
            if not is_noise_block(block):
                blocks.append(block)
        pages[page_no] = sorted(blocks, key=lambda b: (b.y0, b.x0))
    return pages


def is_noise_block(block: Block) -> bool:
    text = block.clean
    if not text:
        return True
    if block.y0 > 688:
        return True
    if block.x0 > 548:
        return True
    if re.fullmatch(r"\d+\s+2027학년도 EBS 수능특강 영어", text):
        return True
    if re.fullmatch(r"(?:\d+•.+|Test\s+\d+\s+\d+)", text):
        return True
    if SECTION_NOISE_RE.match(text) and len(text) < 80:
        return True
    return False


def code_blocks(blocks: list[Block]) -> list[Block]:
    return [b for b in blocks if CODE_RE.search(b.clean)]


def block_codes(block: Block) -> list[str]:
    return CODE_RE.findall(block.clean)


def blocks_to_text(blocks: list[Block]) -> str:
    return clean_text("\n".join(b.clean for b in blocks if b.clean))


def is_likely_passage_block(block: Block) -> bool:
    text = block.clean
    if not text or CODE_RE.search(text):
        return False
    if re.match(r"^[①②③④⑤]", text):
        return False
    if re.match(r"^\d{2}(?:~\d{2})?\s+", text):
        return False
    if "다음 글" in text or "밑줄 친" in text or "윗글" in text:
        return False
    if "가장 적절한 것은" in text or "적절하지 않은 것은" in text:
        return False
    if "정답과 해설" in text:
        return False
    if re.fullmatch(r"\([A-D]\)", text):
        return True
    letters = sum(1 for ch in text if ("A" <= ch <= "Z") or ("a" <= ch <= "z"))
    return letters >= max(12, len(text) * 0.25)


def extract_passage_text(blocks: list[Block]) -> str:
    selected: list[str] = []
    pending_marker: str | None = None
    for block in blocks:
        text = block.clean
        if re.fullmatch(r"\([A-D]\)", text):
            pending_marker = text
            continue
        if is_likely_passage_block(block):
            if pending_marker:
                selected.append(pending_marker)
                pending_marker = None
            selected.append(text)
    return blocks_to_plain(selected)


def extract_glossary(blocks: list[Block]) -> str:
    selected = []
    for block in blocks:
        text = block.clean
        if "" in text or "≄" in text:
            selected.append(text)
    return blocks_to_plain(selected)


def extract_question_text(blocks: list[Block]) -> str:
    selected = []
    for block in blocks:
        text = block.clean
        if CODE_RE.search(text):
            text = CODE_RE.sub("", text)
            text = re.sub(r"^\d{1,2}\s*", "", text).strip()
        if not text:
            continue
        if is_likely_passage_block(block):
            continue
        if "" in text or "≄" in text:
            continue
        selected.append(text)
    return blocks_to_plain(selected)


def blocks_to_plain(lines: list[str]) -> str:
    text = "\n".join(clean_text(line) for line in lines if clean_text(line))
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def find_long_group_starts(pages: dict[int, list[Block]]) -> set[int]:
    starts: set[int] = set()
    for page, blocks in pages.items():
        if code_blocks(blocks):
            continue
        text = blocks_to_text(blocks)
        if LONG_GROUP_RE.search(text):
            starts.add(page)
    return starts


def find_same_page_shared_pages(pages: dict[int, list[Block]]) -> set[int]:
    shared: set[int] = set()
    for page, blocks in pages.items():
        codes = code_blocks(blocks)
        if len(codes) < 2:
            continue
        text = blocks_to_text(blocks)
        if LONG_GROUP_RE.search(text):
            shared.add(page)
    return shared


def first_code_y(blocks: list[Block]) -> float | None:
    codes = code_blocks(blocks)
    if not codes:
        return None
    return min(b.y0 for b in codes)


def make_long_group_unit(
    start_page: int,
    pages: dict[int, list[Block]],
    consumed_codes: set[str],
) -> dict[str, Any]:
    first_page_blocks = pages[start_page]
    second_page_blocks = pages.get(start_page + 1, [])
    cutoff = first_code_y(second_page_blocks)
    if cutoff is None:
        second_story_blocks: list[Block] = []
        question_page_blocks: list[Block] = []
    else:
        second_story_blocks = [b for b in second_page_blocks if b.y0 < cutoff - 8]
        question_page_blocks = [b for b in second_page_blocks if b.y0 >= cutoff - 8]

    story_blocks = first_page_blocks + second_story_blocks
    question_blocks = question_page_blocks
    codes = []
    for b in code_blocks(second_page_blocks):
        for code in block_codes(b):
            codes.append(code)
            consumed_codes.add(code)

    preamble = ""
    for b in story_blocks:
        match = LONG_GROUP_RE.search(b.clean)
        if match:
            preamble = b.clean
            break

    full_source = blocks_to_text(story_blocks + question_blocks)
    passage = extract_passage_text(story_blocks)
    questions = extract_question_text(question_blocks)
    glossary = extract_glossary(story_blocks + question_blocks)

    return make_unit(
        unit_id="+".join(codes),
        codes=codes,
        pages=sorted({start_page, start_page + 1}),
        preamble=preamble,
        passage=passage,
        questions=questions,
        glossary=glossary,
        full_source=full_source,
        kind="shared_long_reading",
    )


def make_same_page_shared_unit(
    page: int,
    pages: dict[int, list[Block]],
    consumed_codes: set[str],
) -> dict[str, Any] | None:
    blocks = pages[page]
    codes_on_page = []
    for b in code_blocks(blocks):
        for code in block_codes(b):
            if code not in consumed_codes:
                codes_on_page.append(code)
    if not codes_on_page:
        return None

    full_source = blocks_to_text(blocks)
    passage = extract_passage_text(blocks)
    questions = extract_question_text(blocks)
    glossary = extract_glossary(blocks)
    preamble = ""
    for b in blocks:
        if LONG_GROUP_RE.search(b.clean):
            preamble = b.clean
            break
    consumed_codes.update(codes_on_page)
    return make_unit(
        unit_id="+".join(codes_on_page),
        codes=codes_on_page,
        pages=[page],
        preamble=preamble,
        passage=passage,
        questions=questions,
        glossary=glossary,
        full_source=full_source,
        kind="shared_same_page",
    )


def make_normal_units(
    page: int,
    pages: dict[int, list[Block]],
    consumed_codes: set[str],
) -> list[dict[str, Any]]:
    blocks = pages[page]
    codes = code_blocks(blocks)
    if not codes:
        return []

    sorted_codes = sorted(codes, key=lambda b: (b.y0, b.x0))
    units: list[dict[str, Any]] = []
    for idx, code_block in enumerate(sorted_codes):
        codes_here = [c for c in block_codes(code_block) if c not in consumed_codes]
        if not codes_here:
            continue
        start = code_block.y0 - 12
        if idx == 0 and code_block.y0 > 105:
            start = max(0.0, code_block.y0 - 70)
        end = sorted_codes[idx + 1].y0 - 14 if idx + 1 < len(sorted_codes) else 688.0
        region = [b for b in blocks if start <= b.y0 < end and b not in sorted_codes[idx + 1 :]]
        if code_block not in region:
            region.append(code_block)
        region = sorted(region, key=lambda b: (b.y0, b.x0))

        full_source = blocks_to_text(region)
        passage = extract_passage_text(region)
        questions = extract_question_text(region)
        glossary = extract_glossary(region)
        unit = make_unit(
            unit_id=codes_here[0],
            codes=codes_here,
            pages=[page],
            preamble="",
            passage=passage,
            questions=questions,
            glossary=glossary,
            full_source=full_source,
            kind="single_question",
        )
        units.append(unit)
        consumed_codes.update(codes_here)
    return units


def make_unit(
    unit_id: str,
    codes: list[str],
    pages: list[int],
    preamble: str,
    passage: str,
    questions: str,
    glossary: str,
    full_source: str,
    kind: str,
) -> dict[str, Any]:
    title = codes[0] if len(codes) == 1 else f"{codes[0]}~{codes[-1]}"
    character_hint = infer_character_hint(passage)
    return {
        "unitId": unit_id,
        "title": title,
        "problemCodes": codes,
        "pdfPages": pages,
        "kind": kind,
        "preamble": preamble,
        "passageText": passage,
        "questionAndChoices": questions,
        "glossary": glossary,
        "fullSourceText": full_source,
        "characterHint": character_hint,
        "webtoonPrompt": build_webtoon_prompt(
            title=title,
            codes=codes,
            passage=passage,
            questions=questions,
            glossary=glossary,
            character_hint=character_hint,
        ),
    }


def infer_character_hint(passage: str) -> str:
    names = re.findall(r"\b[A-Z][a-z]{2,}\b", passage)
    skip = {
        "The",
        "This",
        "That",
        "However",
        "Although",
        "When",
        "One",
        "For",
        "In",
        "At",
        "Dear",
        "Best",
        "Warm",
        "Sincerely",
        "Over",
        "Students",
        "Please",
        "Regards",
        "For",
        "Therefore",
        "However",
        "Although",
        "Since",
        "During",
        "People",
        "Some",
        "Many",
        "Most",
    }
    filtered = []
    for name in names:
        if name in skip:
            continue
        if name not in filtered:
            filtered.append(name)
    if filtered:
        return ", ".join(filtered[:4])
    return "beautiful, expressive original characters matched to the passage"


def build_webtoon_prompt(
    title: str,
    codes: list[str],
    passage: str,
    questions: str,
    glossary: str,
    character_hint: str,
) -> str:
    passage_compact = normalize_for_prompt(passage)
    questions_compact = normalize_for_prompt(questions)
    glossary_compact = normalize_for_prompt(glossary)
    visible_text = build_visible_text_script(passage_compact, questions_compact)
    return textwrap.dedent(
        f"""
        Use case: illustration-story
        Asset type: one tall 9:16 educational webtoon page generated directly by the image model
        Primary request: Create a dreamy, beautiful Korean webtoon adaptation of EBS 2027 Suneung English passage {title}. Use the provided reference image only for mood, cinematic black gutters, layered panels, and poetic text-box integration; do not copy its exact content.
        Critical text rule: all visible text must be generated inside the image by the image model from this prompt. Do not leave empty boxes. Do not rely on post-processing, overlays, HTML, SVG, or later text compositing.
        Format: vertical scroll webtoon, 12 to 16 natural panels, varied close-ups and wide shots, black panel gutters, paper-like caption boxes, dense but readable bilingual study captions. Important points must appear first in English, immediately followed by Korean meaning/interpretation.
        Style/medium: ultra-dreamlike Korean manhwa, cinematic watercolor and ink, ethereal dusk light, elegant faces, handsome and beautiful protagonists, expressive eyes, soft mist, subtle grain, high detail, polished commercial webtoon finish.
        Main characters: {character_hint}.
        Story fidelity: include every important event, relationship, cause, contrast, and conclusion from the source passage. If the source is expository, personify the key ideas as beautiful symbolic characters and visual metaphors while preserving the logical flow.
        Source passage to adapt, all meaning must be represented: "{passage_compact}"
        Question context and choices to include in study-note captions where space allows: "{questions_compact}"
        Glossary or footnotes to include as small margin notes only when present: "{glossary_compact}"
        Required bilingual text behavior: for every important plot beat or logical point, render an English key point and a Korean meaning line together, for example "Key Point: <English phrase>" and "해석: <natural Korean meaning>". Keep the English key point exact or very close to the source sentence.
        Visible bilingual study script to follow inside caption boxes. Render the English key points exactly; render the Korean meaning as a natural translation/interpretation under each English line:
        "{visible_text}"
        Composition: first panel establishes the central conflict; middle panels show each sentence-level beat; final panel shows the conclusion or emotional lesson. Keep text boxes integrated into the art, like printed captions on paper.
        Text design: readable printed serif/gothic mix, black or dark gray letters on warm off-white paper boxes, no gibberish, no misspelled Korean, no random extra words. English key points should be short and exact; Korean interpretation should appear directly below each English point.
        Constraints: no post-added text, no watermark, no UI, no speech bubbles outside panel art, no low-detail faces, no chibi style, no flat vector art, no empty caption boxes.
        """
    ).strip()


def build_visible_text_script(passage: str, questions: str) -> str:
    sentences = split_sentences(passage)
    selected = sentences[:12]
    if len(sentences) > 12:
        selected.append(sentences[-1])
    korean_lines = []
    korean_lines.append("Bilingual Study Webtoon: 영어 핵심 포인트와 한국어 해석을 함께 읽는다.")
    for idx, sentence in enumerate(selected, start=1):
        shortened = sentence
        if len(shortened) > 145:
            shortened = shortened[:142].rstrip() + "..."
        korean_lines.append(
            f"{idx}. Key Point: {shortened} / 해석: 이 문장의 핵심 의미를 자연스러운 한국어로 설명한다."
        )
    if questions:
        q = questions
        if len(q) > 260:
            q = q[:257].rstrip() + "..."
        korean_lines.append(f"Answer Clue: {q} / 해석: 문항이 묻는 목적, 주제, 순서, 어휘 단서를 확인한다.")
    korean_lines.append("Vocabulary: 중요한 단어는 영어와 한국어 뜻을 함께 적는다.")
    korean_lines.append("Core Memory: 글의 흐름, 원인과 결과, 감정 변화를 그림으로 기억한다.")
    return " / ".join(korean_lines)


def split_sentences(text: str) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z“\"(])", text)
    return [p.strip() for p in parts if p.strip()]


def main() -> None:
    pages = load_pages()
    long_starts = find_long_group_starts(pages)
    same_page_shared = find_same_page_shared_pages(pages)
    consumed_codes: set[str] = set()
    units: list[dict[str, Any]] = []

    for page in sorted(long_starts):
        units.append(make_long_group_unit(page, pages, consumed_codes))

    for page in sorted(same_page_shared):
        unit = make_same_page_shared_unit(page, pages, consumed_codes)
        if unit:
            units.append(unit)

    for page in range(10, 240):
        if page in long_starts or page in same_page_shared:
            continue
        units.extend(make_normal_units(page, pages, consumed_codes))

    units.sort(key=lambda u: int(u["problemCodes"][0].split("-")[-1]))
    all_codes = [code for unit in units for code in unit["problemCodes"]]
    unique_codes = sorted(set(all_codes))
    expected = [f"26005-{i:04d}" for i in range(1, 244)]
    missing = [code for code in expected if code not in unique_codes]
    duplicates = sorted({code for code in all_codes if all_codes.count(code) > 1})

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "passage-units.json").write_text(
        json.dumps(units, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    with (OUT_DIR / "webtoon-prompts.jsonl").open("w", encoding="utf-8") as f:
        for unit in units:
            f.write(
                json.dumps(
                    {
                        "unitId": unit["unitId"],
                        "title": unit["title"],
                        "problemCodes": unit["problemCodes"],
                        "pdfPages": unit["pdfPages"],
                        "prompt": unit["webtoonPrompt"],
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )

    sample = next((u for u in units if u["problemCodes"][0] == "26005-0001"), units[0])
    (OUT_DIR / "sample-26005-0001-prompt.md").write_text(
        f"# {sample['title']}\n\n```text\n{sample['webtoonPrompt']}\n```\n",
        encoding="utf-8",
    )
    (OUT_DIR / "extraction-report.json").write_text(
        json.dumps(
            {
                "pdf": str(PDF_PATH),
                "unitCount": len(units),
                "problemCodeCount": len(all_codes),
                "uniqueProblemCodeCount": len(unique_codes),
                "missingProblemCodes": missing,
                "duplicateProblemCodes": duplicates,
                "sharedLongReadingUnits": [
                    {
                        "unitId": u["unitId"],
                        "problemCodes": u["problemCodes"],
                        "pdfPages": u["pdfPages"],
                    }
                    for u in units
                    if u["kind"].startswith("shared_")
                ],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "outDir": str(OUT_DIR),
                "unitCount": len(units),
                "problemCodeCount": len(all_codes),
                "uniqueProblemCodeCount": len(unique_codes),
                "missing": missing,
                "duplicates": duplicates,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
