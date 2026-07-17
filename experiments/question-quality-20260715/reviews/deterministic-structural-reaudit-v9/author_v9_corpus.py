#!/usr/bin/env python3
"""Build, verify, and seal an independently authored structural holdout."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


BASE = Path(__file__).resolve().parent
CORPUS_ID = "deterministic-structural-reaudit-v9-blind-holdout"
SCHEMA_VERSION = "1.0.0"
SEALED_AT = "2026-07-15T00:00:00+09:00"

CASES_NAME = "cases.json"
MANIFEST_NAME = "PRE_INSPECTION_MANIFEST.json"
SEAL_NAME = "PRE_INSPECTION_SEAL.sha256"
HASHED_FILES = (
    "author_v9_corpus.py",
    "PROTOCOL.md",
    CASES_NAME,
    "IMMUTABILITY.md",
)
ALLOWED_FILES = frozenset((*HASHED_FILES, MANIFEST_NAME, SEAL_NAME))

F1 = "F1_SUMMARY_KEY_OPTION_COHESION"
F2 = "F2_GRAMMAR_RENDERED_LABEL_REFERENCE"
F3 = "F3_SENTENCE_ORDER_STRUCTURAL_LABEL_POSITION"
F4 = "F4_FRAGMENT_COMPLETE_SENTENCE_BOUNDARY"


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def write_bytes(path: Path, payload: bytes) -> None:
    temporary = path.with_name(".v9-authoring-write.tmp")
    temporary.write_bytes(payload)
    os.replace(temporary, path)


def write_json(path: Path, value: Any) -> None:
    payload = json.dumps(
        value,
        ensure_ascii=False,
        indent=2,
        sort_keys=False,
    ).encode("utf-8") + b"\n"
    write_bytes(path, payload)


def make_case(
    *,
    case_id: str,
    pair_id: str,
    family_id: str,
    oracle: str,
    question_type: str,
    surface: dict[str, Any],
    rationale: str,
    evidence: dict[str, Any],
    tags: list[str],
) -> dict[str, Any]:
    return {
        "case_id": case_id,
        "pair_id": pair_id,
        "family_id": family_id,
        "oracle": oracle,
        "question_type": question_type,
        "surface": surface,
        "oracle_detail": {
            "is_structural_defect": oracle == "defect",
            "rationale": rationale,
            "evidence": evidence,
            "tags": tags,
        },
    }


def build_f1_cases() -> list[dict[str, Any]]:
    specs = [
        {
            "context": "도시 생태 복원 요약",
            "labels": ["A", "B", "C", "D"],
            "options": [
                "seed dispersal declined after the fence was built.",
                "pollinators shifted their visits toward native flowers.",
                "soil moisture rose beneath the restored canopy.",
                "night temperatures stayed stable across both plots.",
            ],
            "target": 1,
            "mismatch": 3,
            "channel": "explanation",
            "carrier": "해설은 완성 문장을 “{surface}”로 확정한다.",
            "topic_tag": "ecology",
        },
        {
            "context": "기록물 보존 절차 요약",
            "labels": ["①", "②", "③", "④"],
            "options": [
                "the folders were frozen before the mold was removed.",
                "the catalog was copied after every box was relabeled.",
                "humidity was lowered before the photographs were rehoused.",
                "the damaged maps were scanned without being unfolded.",
            ],
            "target": 2,
            "mismatch": 0,
            "channel": "stem",
            "carrier": "요약문의 빈칸에는 다음 전체 문장이 들어가야 한다: {surface}",
            "topic_tag": "archives",
        },
        {
            "context": "교실 발아 실험 요약",
            "labels": ["ㄱ", "ㄴ", "ㄷ", "ㄹ"],
            "options": [
                "the shaded seeds sprouted earlier but grew shorter stems.",
                "the heated seeds absorbed less water during the first hour.",
                "the control tray produced no measurable roots.",
                "the largest seeds were removed before the trial began.",
            ],
            "target": 0,
            "mismatch": 1,
            "channel": "explanation",
            "carrier": "채점 해설의 최종 완성문은 ‘{surface}’이다.",
            "topic_tag": "classroom_science",
        },
        {
            "context": "대중교통 배차 연구 요약",
            "labels": ["I", "II", "III", "IV"],
            "options": [
                "shorter routes attracted riders only on weekends.",
                "real-time signs reduced uncertainty more than extra buses did.",
                "ticket prices determined every reported delay.",
                "drivers ignored the revised departure schedule.",
            ],
            "target": 1,
            "mismatch": 2,
            "channel": "stem",
            "carrier": "편집자가 요구한 정확한 빈칸 표면은 “{surface}”이다.",
            "topic_tag": "transit",
        },
        {
            "context": "해양 음향 관찰 요약",
            "labels": ["(a)", "(b)", "(c)", "(d)"],
            "options": [
                "boat noise masked the lowest-frequency calls near the harbor.",
                "the whales stopped calling throughout the entire season.",
                "water temperature alone explained the change in call length.",
                "recorders offshore captured no biological sounds.",
            ],
            "target": 0,
            "mismatch": 3,
            "channel": "explanation",
            "carrier": "설명의 결론은 옵션의 전체 문구 “{surface}”를 선택한다.",
            "topic_tag": "marine_acoustics",
        },
        {
            "context": "공동체 텃밭 운영 요약",
            "labels": ["가", "나", "다", "라"],
            "options": [
                "shared tools increased harvests in every garden bed.",
                "rotating the watering duty improved participation but not yield.",
                "new signs eliminated all conflicts over plot boundaries.",
                "weekend workshops replaced the need for written schedules.",
            ],
            "target": 1,
            "mismatch": 0,
            "channel": "stem",
            "carrier": "다음 문장을 한 글자도 생략하지 않고 빈칸에 넣는다: {surface}",
            "topic_tag": "community_garden",
        },
        {
            "context": "충전지 내구성 시험 요약",
            "labels": ["[A]", "[B]", "[C]", "[D]"],
            "options": [
                "rapid charging preserved capacity at every tested temperature.",
                "the oldest cells delivered the highest peak current.",
                "moderate charging reduced heat without extending cycle life.",
                "cooler storage slowed capacity loss between test rounds.",
            ],
            "target": 3,
            "mismatch": 2,
            "channel": "explanation",
            "carrier": "검토 메모는 정답 표면을 [{surface}]로 명시한다.",
            "topic_tag": "battery_testing",
        },
        {
            "context": "박물관 조명 조정 요약",
            "labels": ["A.", "B.", "C.", "D."],
            "options": [
                "visitors spent longer at displays with warmer, lower lighting.",
                "brighter lamps prevented pigments from fading.",
                "every gallery produced the same viewing pattern.",
                "labels became unnecessary after the lights were replaced.",
            ],
            "target": 0,
            "mismatch": 1,
            "channel": "stem",
            "carrier": "발문이 지정하는 완전한 선택지 문장은 다음과 같다 — {surface}",
            "topic_tag": "museum_lighting",
        },
        {
            "context": "유역 토사 조사 요약",
            "labels": ["㉠", "㉡", "㉢", "㉣"],
            "options": [
                "upstream samples contained less silt after heavy rain.",
                "vegetated banks trapped sediment before it reached the channel.",
                "all downstream sites shared an identical mineral profile.",
                "sampling depth had no influence on the reported values.",
            ],
            "target": 1,
            "mismatch": 3,
            "channel": "explanation",
            "carrier": "해설에서 실제로 완성된 요약은 “{surface}”라고 적혀 있다.",
            "topic_tag": "watershed",
        },
        {
            "context": "번역 기억 실험 요약",
            "labels": ["Ⓐ", "Ⓑ", "Ⓒ", "Ⓓ"],
            "options": [
                "literal translations were recalled more accurately in every condition.",
                "rhyming phrases slowed recognition of familiar words.",
                "meaningful paraphrases were retained better after the longer delay.",
                "bilingual readers rejected all figurative expressions.",
            ],
            "target": 2,
            "mismatch": 0,
            "channel": "stem",
            "carrier": "요약 완성 지시가 직접 인용한 선택지는 “{surface}”이다.",
            "topic_tag": "translation_memory",
        },
        {
            "context": "도서관 좌석 관찰 요약",
            "labels": ["1)", "2)", "3)", "4)"],
            "options": [
                "students chose window seats only when the library was empty.",
                "movable chairs encouraged groups to reconfigure the shared tables.",
                "quiet zones attracted more phone conversations than open areas.",
                "seat reservations shortened every visit.",
            ],
            "target": 1,
            "mismatch": 2,
            "channel": "explanation",
            "carrier": "정답 해설은 전체 선택지 {surface} 를 그대로 채택한다.",
            "topic_tag": "library_space",
        },
        {
            "context": "재사용 포장 조사 요약",
            "labels": ["α", "β", "γ", "δ"],
            "options": [
                "customers returned containers more often when deposits were visible.",
                "larger containers were always returned sooner.",
                "printed reminders reduced awareness of the return policy.",
                "collection points mattered less than container color.",
            ],
            "target": 0,
            "mismatch": 3,
            "channel": "stem",
            "carrier": "빈칸의 확정 표면: “{surface}”",
            "topic_tag": "reuse_packaging",
        },
        {
            "context": "야간 곤충 관측 요약",
            "labels": ["(Ⅰ)", "(Ⅱ)", "(Ⅲ)", "(Ⅳ)"],
            "options": [
                "blue lamps attracted fewer moths than amber lamps.",
                "cloud cover amplified every difference among the lamps.",
                "amber lamps attracted fewer moths while preserving walkway visibility.",
                "the unlit path contained no insects.",
            ],
            "target": 2,
            "mismatch": 0,
            "channel": "explanation",
            "carrier": "설명란의 최종 문장 전체는 ‘{surface}’로 고정된다.",
            "topic_tag": "night_insects",
        },
        {
            "context": "합창 연습 일정 요약",
            "labels": ["A)", "B)", "C)", "D)"],
            "options": [
                "short daily rehearsals improved timing more than one long session.",
                "sectional practice reduced the singers' pitch range.",
                "the conductor removed every difficult passage.",
                "weekend rehearsals produced identical attendance.",
            ],
            "target": 0,
            "mismatch": 1,
            "channel": "stem",
            "carrier": "발문은 아래 완성문을 정확히 요구한다: {surface}",
            "topic_tag": "choir_rehearsal",
        },
        {
            "context": "보행 지도 설계 요약",
            "labels": ["[1]", "[2]", "[3]", "[4]"],
            "options": [
                "color alone helped users estimate walking time.",
                "landmarks made unfamiliar routes easier to remember.",
                "north arrows confused every first-time visitor.",
                "simplified maps required more written directions.",
            ],
            "target": 1,
            "mismatch": 3,
            "channel": "explanation",
            "carrier": "해설자가 선택한 온전한 문구는 다음 한 문장이다: {surface}",
            "topic_tag": "pedestrian_maps",
        },
        {
            "context": "빗물 저장 장치 요약",
            "labels": ["①번", "②번", "③번", "④번"],
            "options": [
                "larger tanks eliminated overflow during every storm.",
                "first-flush filters increased the amount of roof debris.",
                "linked barrels captured more water during moderate storms.",
                "paint color determined the stored water's volume.",
            ],
            "target": 2,
            "mismatch": 1,
            "channel": "stem",
            "carrier": "빈칸에는 따옴표 안의 전체 선택지를 쓴다: “{surface}”",
            "topic_tag": "rainwater",
        },
        {
            "context": "수면 일지 분석 요약",
            "labels": ["P", "Q", "R", "S"],
            "options": [
                "consistent wake times predicted steadier alertness the next morning.",
                "longer naps guaranteed earlier sleep onset.",
                "screen use had the same effect for every participant.",
                "weekend schedules erased all weekday differences.",
            ],
            "target": 0,
            "mismatch": 2,
            "channel": "explanation",
            "carrier": "채점 근거가 인용하는 완전한 답은 “{surface}”이다.",
            "topic_tag": "sleep_diary",
        },
        {
            "context": "도예 가마 기록 요약",
            "labels": ["ⅰ", "ⅱ", "ⅲ", "ⅳ"],
            "options": [
                "slower cooling reduced cracks in the thinner bowls.",
                "higher shelves produced identical glaze colors.",
                "clay thickness had no relation to cooling damage.",
                "opening the kiln early strengthened every piece.",
            ],
            "target": 0,
            "mismatch": 3,
            "channel": "stem",
            "carrier": "문항 지시는 이 전체 문장으로 요약을 끝낸다 — {surface}",
            "topic_tag": "ceramics",
        },
        {
            "context": "공원 소음 표지 실험 요약",
            "labels": ["{A}", "{B}", "{C}", "{D}"],
            "options": [
                "larger signs lowered measured sound levels.",
                "polite reminders reduced loud conversations near the pond.",
                "red lettering worked equally well at every location.",
                "visitors ignored signs placed beside benches.",
            ],
            "target": 1,
            "mismatch": 0,
            "channel": "explanation",
            "carrier": "해설의 선택은 문장 전체 “{surface}”와 정확히 일치한다.",
            "topic_tag": "park_signage",
        },
        {
            "context": "종이 다리 제작 요약",
            "labels": ["W", "X", "Y", "Z"],
            "options": [
                "additional folds increased strength until the paper began to tear.",
                "wider spans supported more weight without reinforcement.",
                "tape placement never changed the bridge's capacity.",
                "the lightest design used the greatest amount of paper.",
            ],
            "target": 0,
            "mismatch": 2,
            "channel": "stem",
            "carrier": "요구되는 최종 표면을 그대로 제시하면 다음과 같다: “{surface}”",
            "topic_tag": "paper_bridge",
        },
    ]

    cases: list[dict[str, Any]] = []
    for number, spec in enumerate(specs, start=1):
        pair_id = f"v9-f1-p{number:02d}"
        options = [
            {"label": label, "text": text}
            for label, text in zip(spec["labels"], spec["options"], strict=True)
        ]
        selected_label = spec["labels"][spec["target"]]
        mismatch_label = spec["labels"][spec["mismatch"]]
        selected_surface = spec["options"][spec["target"]]
        carrier_text = spec["carrier"].format(surface=selected_surface)
        for oracle, keyed_label in (
            ("normal", selected_label),
            ("defect", mismatch_label),
        ):
            stem = (
                carrier_text
                if spec["channel"] == "stem"
                else "다음 요약문의 빈칸을 가장 알맞게 완성하시오."
            )
            explanation = (
                carrier_text
                if spec["channel"] == "explanation"
                else "선택지의 일부가 아니라 지시된 전체 문장 표면을 기준으로 채점한다."
            )
            surface = {
                "context": spec["context"],
                "instruction": "Choose the option that exactly completes the summary.",
                "stem": stem,
                "explanation": explanation,
                "options": options,
                "keyed_option": keyed_label,
                "authoritative_selection_channel": spec["channel"],
            }
            aligned = oracle == "normal"
            rationale = (
                f"The {spec['channel']} quotes the complete surface of option "
                f"{selected_label}; the key {'matches' if aligned else 'instead names ' + mismatch_label + ', so it does not match'} "
                f"that explicitly selected option."
            )
            evidence = {
                "selected_full_surface": selected_surface,
                "selected_option_label": selected_label,
                "keyed_option_label": keyed_label,
                "full_surface_is_verbatim": True,
                "key_matches_selected_option": aligned,
            }
            tags = [
                "summary_complete_mc",
                "full_option_surface",
                f"selection_in_{spec['channel']}",
                "key_alignment" if aligned else "cross_option_key_mismatch",
                spec["topic_tag"],
            ]
            cases.append(
                make_case(
                    case_id=f"{pair_id}-{oracle}",
                    pair_id=pair_id,
                    family_id=F1,
                    oracle=oracle,
                    question_type="SUMMARY_COMPLETE_MC",
                    surface=surface,
                    rationale=rationale,
                    evidence=evidence,
                    tags=tags,
                )
            )
    return cases


def build_f2_cases() -> list[dict[str, Any]]:
    specs = [
        {
            "context": "circled numeral rendered span versus aria-only attribute",
            "reference": "①",
            "key_point": "①의 동사 형태를 기준으로 시제 일치를 판단한다.",
            "normal_raw": "<p><span>①</span> Neither answer fits the context.</p>",
            "normal_rendered": "① Neither answer fits the context.",
            "normal_inventory": ["①"],
            "defect_raw": '<p><span aria-label="①"></span> Neither answer fits the context.</p>',
            "defect_rendered": "Neither answer fits the context.",
            "defect_inventory": [],
            "variant_tag": "html_attribute_only",
        },
        {
            "context": "decoded numeric entity versus escaped entity text",
            "reference": "②",
            "key_point": "②의 수 일치가 문장의 핵심 문법 포인트이다.",
            "normal_raw": "<p>&#9313; The results remain uncertain.</p>",
            "normal_rendered": "② The results remain uncertain.",
            "normal_inventory": ["②"],
            "defect_raw": "<p>&amp;#9313; The results remain uncertain.</p>",
            "defect_rendered": "&#9313; The results remain uncertain.",
            "defect_inventory": ["&#9313;"],
            "variant_tag": "double_escaped_entity",
        },
        {
            "context": "square bracket label versus parenthesis label",
            "reference": "[A]",
            "key_point": "[A]의 완료 시제가 기준 시점보다 앞선다.",
            "normal_raw": "<p>[A] She had left before noon.</p>",
            "normal_rendered": "[A] She had left before noon.",
            "normal_inventory": ["[A]"],
            "defect_raw": "<p>(A) She had left before noon.</p>",
            "defect_rendered": "(A) She had left before noon.",
            "defect_inventory": ["(A)"],
            "variant_tag": "bracket_substitution",
        },
        {
            "context": "fullwidth Latin label versus ASCII Latin label",
            "reference": "Ａ",
            "key_point": "Ａ의 관계대명사가 선행사를 받는다.",
            "normal_raw": "<p>Ａ The book that arrived is mine.</p>",
            "normal_rendered": "Ａ The book that arrived is mine.",
            "normal_inventory": ["Ａ"],
            "defect_raw": "<p>A The book that arrived is mine.</p>",
            "defect_rendered": "A The book that arrived is mine.",
            "defect_inventory": ["A"],
            "variant_tag": "unicode_fullwidth_lookalike",
        },
        {
            "context": "Roman numeral glyph versus Latin capital letter",
            "reference": "Ⅰ",
            "key_point": "Ⅰ의 조동사 뒤에는 동사원형이 온다.",
            "normal_raw": "<p>Ⅰ They might return tonight.</p>",
            "normal_rendered": "Ⅰ They might return tonight.",
            "normal_inventory": ["Ⅰ"],
            "defect_raw": "<p>I They might return tonight.</p>",
            "defect_rendered": "I They might return tonight.",
            "defect_inventory": ["I"],
            "variant_tag": "unicode_roman_lookalike",
        },
        {
            "context": "parenthesized digit versus circled digit",
            "reference": "⑴",
            "key_point": "⑴의 분사구문은 주절의 주어와 의미상 일치한다.",
            "normal_raw": "<p>⑴ Turning the corner, Mina waved.</p>",
            "normal_rendered": "⑴ Turning the corner, Mina waved.",
            "normal_inventory": ["⑴"],
            "defect_raw": "<p>① Turning the corner, Mina waved.</p>",
            "defect_rendered": "① Turning the corner, Mina waved.",
            "defect_inventory": ["①"],
            "variant_tag": "unicode_enclosure_change",
        },
        {
            "context": "circled uppercase versus circled lowercase label",
            "reference": "Ⓐ",
            "key_point": "Ⓐ의 가정법 동사가 현재 사실의 반대를 나타낸다.",
            "normal_raw": "<p>Ⓐ If I were ready, I would leave.</p>",
            "normal_rendered": "Ⓐ If I were ready, I would leave.",
            "normal_inventory": ["Ⓐ"],
            "defect_raw": "<p>ⓐ If I were ready, I would leave.</p>",
            "defect_rendered": "ⓐ If I were ready, I would leave.",
            "defect_inventory": ["ⓐ"],
            "variant_tag": "unicode_case_enclosure",
        },
        {
            "context": "circled number versus superscript decoration",
            "reference": "③",
            "key_point": "③의 목적격 보어로 쓰인 동사원형을 확인한다.",
            "normal_raw": "<p><sup>③</sup> We saw them cross the road.</p>",
            "normal_rendered": "③ We saw them cross the road.",
            "normal_inventory": ["③"],
            "defect_raw": "<p><sup>3</sup> We saw them cross the road.</p>",
            "defect_rendered": "³ We saw them cross the road.",
            "defect_inventory": ["³"],
            "variant_tag": "superscript_decoration_change",
        },
        {
            "context": "ordered list marker versus unordered bullet",
            "reference": "B.",
            "key_point": "B. 항목의 병렬 구조가 앞 절과 균형을 이룬다.",
            "normal_raw": '<ol type="A" start="2"><li>to read and to annotate</li></ol>',
            "normal_rendered": "B. to read and to annotate",
            "normal_inventory": ["B."],
            "defect_raw": "<ul><li>to read and to annotate</li></ul>",
            "defect_rendered": "• to read and to annotate",
            "defect_inventory": ["•"],
            "variant_tag": "list_marker_type_change",
        },
        {
            "context": "CJK lenticular brackets versus ASCII square brackets",
            "reference": "【나】",
            "key_point": "【나】의 접속사가 양보 관계를 만든다.",
            "normal_raw": "<p>【나】 Although it rained, we left.</p>",
            "normal_rendered": "【나】 Although it rained, we left.",
            "normal_inventory": ["【나】"],
            "defect_raw": "<p>[나] Although it rained, we left.</p>",
            "defect_rendered": "[나] Although it rained, we left.",
            "defect_inventory": ["[나]"],
            "variant_tag": "cjk_bracket_change",
        },
        {
            "context": "ASCII parentheses versus fullwidth parentheses",
            "reference": "(B)",
            "key_point": "(B)의 선행사와 관계절 동사의 수를 맞춘다.",
            "normal_raw": "<p>(B) The players who train daily improve.</p>",
            "normal_rendered": "(B) The players who train daily improve.",
            "normal_inventory": ["(B)"],
            "defect_raw": "<p>（B） The players who train daily improve.</p>",
            "defect_rendered": "（B） The players who train daily improve.",
            "defect_inventory": ["（B）"],
            "variant_tag": "fullwidth_parentheses",
        },
        {
            "context": "visible lowercase list label versus italic tag name",
            "reference": "i.",
            "key_point": "i. 항목의 도치가 부정어 선행 때문에 일어난다.",
            "normal_raw": "<p><span>i.</span> Never had we seen it.</p>",
            "normal_rendered": "i. Never had we seen it.",
            "normal_inventory": ["i."],
            "defect_raw": "<p><i>Never</i> had we seen it.</p>",
            "defect_rendered": "Never had we seen it.",
            "defect_inventory": [],
            "variant_tag": "html_tag_name_not_label",
        },
        {
            "context": "visible circled marker versus stripped HTML comment",
            "reference": "④",
            "key_point": "④의 수동태가 행위의 대상을 주어로 둔다.",
            "normal_raw": "<p>④ The window was repaired.</p>",
            "normal_rendered": "④ The window was repaired.",
            "normal_inventory": ["④"],
            "defect_raw": "<p><!-- ④ -->The window was repaired.</p>",
            "defect_rendered": "The window was repaired.",
            "defect_inventory": [],
            "variant_tag": "html_comment_stripped",
        },
        {
            "context": "visible data token versus data-label metadata",
            "reference": "[K]",
            "key_point": "[K]의 동명사가 전치사의 목적어로 쓰였다.",
            "normal_raw": "<p><span>[K]</span> by working together</p>",
            "normal_rendered": "[K] by working together",
            "normal_inventory": ["[K]"],
            "defect_raw": '<p data-label="[K]">by working together</p>',
            "defect_rendered": "by working together",
            "defect_inventory": [],
            "variant_tag": "html_data_attribute_only",
        },
        {
            "context": "visible class-like token versus CSS class metadata",
            "reference": "V.",
            "key_point": "V. 항목의 과거분사가 명사를 뒤에서 수식한다.",
            "normal_raw": "<p><span>V.</span> the files stored outside</p>",
            "normal_rendered": "V. the files stored outside",
            "normal_inventory": ["V."],
            "defect_raw": '<p class="V">the files stored outside</p>',
            "defect_rendered": "the files stored outside",
            "defect_inventory": [],
            "variant_tag": "css_class_not_rendered",
        },
        {
            "context": "literal angle-bracket label versus HTML element removal",
            "reference": "〈C〉",
            "key_point": "〈C〉의 비교급이 두 대상을 직접 비교한다.",
            "normal_raw": "<p>&lang;C&rang; This route is shorter.</p>",
            "normal_rendered": "〈C〉 This route is shorter.",
            "normal_inventory": ["〈C〉"],
            "defect_raw": "<p><C>This route is shorter.</C></p>",
            "defect_rendered": "This route is shorter.",
            "defect_inventory": [],
            "variant_tag": "element_name_not_rendered",
        },
        {
            "context": "parenthesized list number versus dotted list number",
            "reference": "2)",
            "key_point": "2) 항목의 부정사는 목적을 나타낸다.",
            "normal_raw": '<ol style="list-style-type: decimal"><li value="2">to save time</li></ol>',
            "normal_rendered": "2) to save time",
            "normal_inventory": ["2)"],
            "defect_raw": '<ol style="list-style-type: decimal"><li value="2">to save time</li></ol>',
            "defect_rendered": "2. to save time",
            "defect_inventory": ["2."],
            "variant_tag": "list_delimiter_change",
        },
        {
            "context": "en dash inside label versus ASCII hyphen",
            "reference": "[X–1]",
            "key_point": "[X–1]의 대명사가 앞 문장의 단수 명사를 가리킨다.",
            "normal_raw": "<p>[X–1] It was missing.</p>",
            "normal_rendered": "[X–1] It was missing.",
            "normal_inventory": ["[X–1]"],
            "defect_raw": "<p>[X-1] It was missing.</p>",
            "defect_rendered": "[X-1] It was missing.",
            "defect_inventory": ["[X-1]"],
            "variant_tag": "dash_codepoint_change",
        },
        {
            "context": "Greek capital alpha versus Latin capital A",
            "reference": "Α",
            "key_point": "Α의 현재분사가 동시에 일어난 동작을 덧붙인다.",
            "normal_raw": "<p>Α Smiling, she opened the door.</p>",
            "normal_rendered": "Α Smiling, she opened the door.",
            "normal_inventory": ["Α"],
            "defect_raw": "<p>A Smiling, she opened the door.</p>",
            "defect_rendered": "A Smiling, she opened the door.",
            "defect_inventory": ["A"],
            "variant_tag": "greek_latin_lookalike",
        },
        {
            "context": "keycap digit label versus plain dotted digit",
            "reference": "1️⃣",
            "key_point": "1️⃣의 접속사 뒤에는 완전한 절이 이어진다.",
            "normal_raw": "<p>1️⃣ Because it was late, we stopped.</p>",
            "normal_rendered": "1️⃣ Because it was late, we stopped.",
            "normal_inventory": ["1️⃣"],
            "defect_raw": "<p>1. Because it was late, we stopped.</p>",
            "defect_rendered": "1. Because it was late, we stopped.",
            "defect_inventory": ["1."],
            "variant_tag": "emoji_keycap_change",
        },
    ]

    cases: list[dict[str, Any]] = []
    for number, spec in enumerate(specs, start=1):
        pair_id = f"v9-f2-p{number:02d}"
        for oracle in ("normal", "defect"):
            rendered = spec[f"{oracle}_rendered"]
            inventory = spec[f"{oracle}_inventory"]
            raw = spec[f"{oracle}_raw"]
            present = spec["reference"] in inventory
            surface = {
                "context": spec["context"],
                "raw_markup": raw,
                "rendered_text": rendered,
                "grammar_key_point": spec["key_point"],
                "referenced_label": spec["reference"],
                "rendered_label_inventory": inventory,
            }
            rationale = (
                f"The grammar key point begins with {spec['reference']!r}; that exact "
                f"label is {'present in' if present else 'absent from'} the rendered-label inventory. "
                "Raw markup and lookalike decoration do not substitute for the rendered label."
            )
            evidence = {
                "reference_is_leading": True,
                "referenced_label": spec["reference"],
                "reference_present_in_rendered_inventory": present,
                "rendered_label_inventory": inventory,
            }
            cases.append(
                make_case(
                    case_id=f"{pair_id}-{oracle}",
                    pair_id=pair_id,
                    family_id=F2,
                    oracle=oracle,
                    question_type="GRAMMAR_KEY_POINT",
                    surface=surface,
                    rationale=rationale,
                    evidence=evidence,
                    tags=[
                        "grammar_key_point",
                        "leading_label_reference",
                        "rendered_label_present" if present else "rendered_label_missing",
                        spec["variant_tag"],
                    ],
                )
            )
    return cases


def leading_labels(body: str, expected: list[str]) -> list[str]:
    found: list[str] = []
    for line in body.splitlines():
        stripped = line.lstrip()
        for label in expected:
            if stripped == label or stripped.startswith(label + " "):
                found.append(label)
                break
    return found


def has_terminal_punctuation(candidate: str) -> bool:
    return candidate.rstrip("”’\"')]}）】」』").endswith((".", "?", "!"))


def build_f3_cases() -> list[dict[str, Any]]:
    specs = [
        {
            "context": "연구 기록의 인용문",
            "labels": ["(A)", "(B)", "(C)"],
            "segments": [
                "The team first calibrated the sensor.",
                "They then collected readings at noon.",
                "Finally, they compared the two sites.",
            ],
            "defect_body": "(A) The team first calibrated the sensor.\n(B) The log says “(C) remains provisional” after the noon reading.",
            "missing": "(C)",
            "phantom": "“(C) remains provisional”",
            "kind": "quotation",
        },
        {
            "context": "목록 문자를 본문에서 언급",
            "labels": ["[A]", "[B]", "[C]"],
            "segments": [
                "The catalog assigns a shelf to each draft.",
                "The second draft receives a new cover.",
                "The final copy moves to the archive.",
            ],
            "defect_body": "[A] The catalog calls the second draft [B] in its prose.\n[C] The final copy moves to the archive.",
            "missing": "[B]",
            "phantom": "draft [B] in its prose",
            "kind": "mid_sentence",
        },
        {
            "context": "숫자 표지가 명사 수식어로 사용됨",
            "labels": ["①", "②", "③"],
            "segments": [
                "The first edition introduced the diagram.",
                "The revised edition corrected its scale.",
                "The class tested the corrected version.",
            ],
            "defect_body": "① The ② edition corrected the scale after class.\n③ The class tested the corrected version.",
            "missing": "②",
            "phantom": "The ② edition",
            "kind": "modifier",
        },
        {
            "context": "로마 숫자가 명령 예시에 포함됨",
            "labels": ["I.", "II.", "III."],
            "segments": [
                "The operator opens the console.",
                "The operator retries the transfer.",
                "The operator verifies the checksum.",
            ],
            "defect_body": "I. The console prints code(II. --retry) as an example.\nIII. The operator verifies the checksum.",
            "missing": "II.",
            "phantom": "code(II. --retry)",
            "kind": "inline_code",
        },
        {
            "context": "한글 표지가 파일명으로 인용됨",
            "labels": ["(가)", "(나)", "(다)"],
            "segments": [
                "자료를 날짜별로 정리한다.",
                "중복된 파일을 별도 폴더로 옮긴다.",
                "최종 목록을 다시 확인한다.",
            ],
            "defect_body": "(가) 담당자는 파일명 “(나)”를 예시로 기록했다.\n(다) 최종 목록을 다시 확인한다.",
            "missing": "(나)",
            "phantom": "파일명 “(나)”",
            "kind": "lexical_mention",
        },
        {
            "context": "선택지 모양이 대화 속 이름으로 쓰임",
            "labels": ["A)", "B)", "C)"],
            "segments": [
                "The guide names the first route.",
                "The group checks the weather.",
                "They leave by the safer path.",
            ],
            "defect_body": "B) The guide says “A) is merely the route's nickname.”\nC) They leave by the safer path.",
            "missing": "A)",
            "phantom": "“A) is merely the route's nickname.”",
            "kind": "quotation",
        },
        {
            "context": "중괄호 표지가 설정값으로 등장",
            "labels": ["{1}", "{2}", "{3}"],
            "segments": [
                "The program loads the defaults.",
                "It applies the user's theme.",
                "It saves the resulting profile.",
            ],
            "defect_body": "{1} The program loads the defaults.\n{2} The example assigns slot = \"{3}\" inside the configuration.",
            "missing": "{3}",
            "phantom": "slot = \"{3}\"",
            "kind": "inline_code",
        },
        {
            "context": "각괄호형 토큰이 템플릿 값으로 등장",
            "labels": ["<A>", "<B>", "<C>"],
            "segments": [
                "The template reserves a title field.",
                "The editor inserts the author name.",
                "The renderer produces the final card.",
            ],
            "defect_body": "<A> The template reserves a title field.\n<B> The editor types placeholder = \"<C>\" in the example.",
            "missing": "<C>",
            "phantom": "placeholder = \"<C>\"",
            "kind": "inline_code",
        },
        {
            "context": "단계 라벨이 문장 속 제품명으로 인용됨",
            "labels": ["Step-A:", "Step-B:", "Step-C:"],
            "segments": [
                "The sample is rinsed with water.",
                "The sample dries in filtered air.",
                "The mass is recorded on the sheet.",
            ],
            "defect_body": "Step-A: The sample is rinsed with water.\nStep-C: The manual calls the old dryer “Step-B:” in a historical note.",
            "missing": "Step-B:",
            "phantom": "“Step-B:”",
            "kind": "quotation",
        },
        {
            "context": "원문자 표지가 모양 수식으로 쓰임",
            "labels": ["㉠", "㉡", "㉢"],
            "segments": [
                "첫 표본을 투명 봉투에 넣는다.",
                "둘째 표본에 파란 스티커를 붙인다.",
                "마지막 표본의 무게를 잰다.",
            ],
            "defect_body": "㉠ 연구자는 ㉡ 모양의 아이콘을 봉투에 그렸다.\n㉢ 마지막 표본의 무게를 잰다.",
            "missing": "㉡",
            "phantom": "㉡ 모양의 아이콘",
            "kind": "modifier",
        },
        {
            "context": "대괄호 로마 표지가 서가 기호로 언급됨",
            "labels": ["[Ⅰ]", "[Ⅱ]", "[Ⅲ]"],
            "segments": [
                "The oldest ledger stays in the cabinet.",
                "The index is copied for daily use.",
                "The copy is returned before closing.",
            ],
            "defect_body": "[Ⅱ] The note cites “[Ⅰ]” only as a shelf mark.\n[Ⅲ] The copy is returned before closing.",
            "missing": "[Ⅰ]",
            "phantom": "“[Ⅰ]” only as a shelf mark",
            "kind": "lexical_mention",
        },
        {
            "context": "괄호 숫자가 표의 셀 좌표로 쓰임",
            "labels": ["(1)", "(2)", "(3)"],
            "segments": [
                "The survey records each response.",
                "The analyst removes duplicate rows.",
                "The totals are checked independently.",
            ],
            "defect_body": "(1) The survey records each response in cell (2) of the table.\n(3) The totals are checked independently.",
            "missing": "(2)",
            "phantom": "cell (2) of the table",
            "kind": "mid_sentence",
        },
        {
            "context": "원문자 영문이 코드 상수로 사용됨",
            "labels": ["ⓐ", "ⓑ", "ⓒ"],
            "segments": [
                "The parser reads the header.",
                "It normalizes the spacing.",
                "It emits the cleaned record.",
            ],
            "defect_body": "ⓐ The parser reads the header.\nⓑ The example sets marker = \"ⓒ\" before cleanup.",
            "missing": "ⓒ",
            "phantom": "marker = \"ⓒ\"",
            "kind": "inline_code",
        },
        {
            "context": "한글 점 표지가 별칭으로 인용됨",
            "labels": ["가.", "나.", "다."],
            "segments": [
                "작업자는 첫 상자를 연다.",
                "내용물을 종류별로 나눈다.",
                "빈 상자를 접어 보관한다.",
            ],
            "defect_body": "가. 작업자는 첫 상자를 연다.\n다. 메모에는 별칭 “나.”가 본문 어휘로만 쓰였다.",
            "missing": "나.",
            "phantom": "별칭 “나.”",
            "kind": "lexical_mention",
        },
        {
            "context": "콜론 라벨이 인용된 표제에 포함됨",
            "labels": ["A:", "B:", "C:"],
            "segments": [
                "The host welcomes the guests.",
                "A speaker presents the proposal.",
                "The group records its questions.",
            ],
            "defect_body": "A: The host welcomes the guests.\nB: A poster quotes the heading “C: Questions” within the room description.",
            "missing": "C:",
            "phantom": "“C: Questions”",
            "kind": "quotation",
        },
        {
            "context": "절 기호가 형용사적 수식에 포함됨",
            "labels": ["§A", "§B", "§C"],
            "segments": [
                "The policy defines the eligible items.",
                "The appendix lists the exceptions.",
                "The notice gives the effective date.",
            ],
            "defect_body": "§A The policy defines the eligible items.\n§C The editor removed the §B-style indentation from the appendix.",
            "missing": "§B",
            "phantom": "§B-style indentation",
            "kind": "modifier",
        },
        {
            "context": "서수 표지가 문서 제목으로 언급됨",
            "labels": ["[첫째]", "[둘째]", "[셋째]"],
            "segments": [
                "관찰자는 입구의 인원을 센다.",
                "관찰자는 대기 시간을 기록한다.",
                "관찰자는 출구의 흐름을 비교한다.",
            ],
            "defect_body": "[첫째] 관찰자는 입구의 인원을 센다.\n[셋째] 안내문은 “[둘째]”를 예전 문서 제목으로 언급한다.",
            "missing": "[둘째]",
            "phantom": "“[둘째]”를 예전 문서 제목",
            "kind": "quotation",
        },
        {
            "context": "소문자 로마 표지가 분류명으로 쓰임",
            "labels": ["(i)", "(ii)", "(iii)"],
            "segments": [
                "The reviewer identifies the claim.",
                "The reviewer checks its evidence.",
                "The reviewer records a decision.",
            ],
            "defect_body": "(i) The reviewer identifies the claim as category (ii) in the sentence.\n(iii) The reviewer records a decision.",
            "missing": "(ii)",
            "phantom": "category (ii) in the sentence",
            "kind": "mid_sentence",
        },
        {
            "context": "그리스 라벨이 수식 코드로 등장",
            "labels": ["α)", "β)", "γ)"],
            "segments": [
                "The model reads the initial value.",
                "The model updates the coefficient.",
                "The model prints the prediction.",
            ],
            "defect_body": "α) The sample expression uses token \"β)\" as a literal string.\nγ) The model prints the prediction.",
            "missing": "β)",
            "phantom": "token \"β)\" as a literal string",
            "kind": "inline_code",
        },
        {
            "context": "질문 번호가 로그 메시지에 포함됨",
            "labels": ["Q1.", "Q2.", "Q3."],
            "segments": [
                "The form asks about prior experience.",
                "It asks which tools were available.",
                "It asks for one final comment.",
            ],
            "defect_body": "Q1. The form asks about prior experience.\nQ3. The log prints message = \"Q2. skipped\" during a dry run.",
            "missing": "Q2.",
            "phantom": "message = \"Q2. skipped\"",
            "kind": "inline_code",
        },
    ]

    cases: list[dict[str, Any]] = []
    for number, spec in enumerate(specs, start=1):
        pair_id = f"v9-f3-p{number:02d}"
        normal_body = "\n".join(
            f"{label} {segment}"
            for label, segment in zip(spec["labels"], spec["segments"], strict=True)
        )
        for oracle, body in (("normal", normal_body), ("defect", spec["defect_body"])):
            observed = leading_labels(body, spec["labels"])
            is_defect = oracle == "defect"
            surface = {
                "context": spec["context"],
                "instruction": "Arrange the three labeled blocks into the most coherent order.",
                "expected_structural_labels": spec["labels"],
                "rendered_body": body,
                "observed_leading_block_labels": observed,
            }
            rationale = (
                "Every expected label introduces a separate rendered line, so the three "
                "structural blocks are complete."
                if not is_defect
                else f"{spec['missing']} occurs only in {spec['kind'].replace('_', ' ')} context "
                "and never introduces a rendered line; lexical presence cannot replace the missing block."
            )
            evidence = {
                "expected_labels": spec["labels"],
                "observed_leading_labels": observed,
                "missing_leading_label": spec["missing"] if is_defect else None,
                "phantom_label": spec["missing"] if is_defect else None,
                "phantom_surface": spec["phantom"] if is_defect else None,
                "phantom_context_kind": spec["kind"] if is_defect else None,
            }
            cases.append(
                make_case(
                    case_id=f"{pair_id}-{oracle}",
                    pair_id=pair_id,
                    family_id=F3,
                    oracle=oracle,
                    question_type="SENTENCE_ORDER",
                    surface=surface,
                    rationale=rationale,
                    evidence=evidence,
                    tags=[
                        "sentence_order",
                        "leading_structural_label",
                        "complete_block_inventory" if not is_defect else "phantom_nonleading_label",
                        "true_delimiter" if not is_defect else spec["kind"],
                    ],
                )
            )
    return cases


def build_f4_cases() -> list[dict[str, Any]]:
    specs = [
        {
            "context": "직함 약어 뒤 마침표",
            "normal": "Dr. Rivera arrived before noon.",
            "defect": "After Dr. Rivera arrived before noon.",
            "normal_analysis": "The abbreviation period does not end the sentence early; arrived supplies the independent predicate.",
            "defect_analysis": "After subordinates the only finite clause, leaving no independent clause.",
            "kind": "abbreviation_and_adverbial_opener",
        },
        {
            "context": "예시 약어와 분사구",
            "normal": "The kit includes three adapters, e.g., a USB-C coupler.",
            "defect": "Including three adapters, e.g., a USB-C coupler.",
            "normal_analysis": "The kit is the subject and includes is a finite independent predicate.",
            "defect_analysis": "Including heads a participial phrase with no finite independent predicate.",
            "kind": "abbreviation_and_participial_phrase",
        },
        {
            "context": "인용문 내부 종속 접속사",
            "normal": "“Leave the gate open,” the curator whispered.",
            "defect": "“Because the curator whispered, ‘Leave the gate open.’”",
            "normal_analysis": "The reporting clause the curator whispered is independent despite the leading quotation.",
            "defect_analysis": "The entire quoted material is a because-clause with no independent completion.",
            "kind": "quotation_and_subordination",
        },
        {
            "context": "직접 의문문과 내포 의문절",
            "normal": "Why did the signal fade?",
            "defect": "Why the signal faded?",
            "normal_analysis": "Auxiliary inversion creates a complete direct interrogative.",
            "defect_analysis": "The non-inverted why-clause has embedded-question order and lacks a matrix clause.",
            "kind": "question_mark_and_embedded_interrogative",
        },
        {
            "context": "목적 부정사 도입부",
            "normal": "To finish before dusk, the crew shortened the route.",
            "defect": "To finish before dusk.",
            "normal_analysis": "The purpose infinitive is followed by the independent clause the crew shortened the route.",
            "defect_analysis": "The purpose infinitive stands alone without a finite independent predicate.",
            "kind": "to_infinitive_purpose",
        },
        {
            "context": "관계절을 포함한 명사구",
            "normal": "The courier who reached the desk first signed the log.",
            "defect": "The courier who reached the desk first.",
            "normal_analysis": "Signed supplies a matrix predicate outside the relative clause.",
            "defect_analysis": "The noun phrase and its relative clause have no matrix predicate.",
            "kind": "relative_clause_noun_phrase",
        },
        {
            "context": "양보 부사절 도입부",
            "normal": "Although the forecast changed, the hikers continued.",
            "defect": "Although the forecast changed.",
            "normal_analysis": "The subordinate although-clause is completed by the independent clause the hikers continued.",
            "defect_analysis": "Although makes the only finite clause dependent.",
            "kind": "adverbial_opener",
        },
        {
            "context": "세미콜론과 비정형 술어",
            "normal": "The lights dimmed; the audience fell silent.",
            "defect": "The lights dimming; the audience silent.",
            "normal_analysis": "Both sides of the semicolon contain finite independent predicates.",
            "defect_analysis": "Dimming is nonfinite and audience silent is verbless; punctuation cannot supply predicates.",
            "kind": "semicolon_boundary",
        },
        {
            "context": "콜론 뒤 보충 성분",
            "normal": "Only one task remained: lock the archive.",
            "defect": "Because only one task remained: locking the archive.",
            "normal_analysis": "Only one task remained is an independent clause; the colon adds a specification.",
            "defect_analysis": "Because subordinates the finite clause, and the colon's gerund phrase does not restore independence.",
            "kind": "colon_and_subordination",
        },
        {
            "context": "대시 삽입 수식어",
            "normal": "The final train—already delayed—arrived at midnight.",
            "defect": "The final train—already delayed—at midnight.",
            "normal_analysis": "Arrived is the matrix finite predicate around the parenthetical modifier.",
            "defect_analysis": "The dashed modifier and final prepositional phrase leave the noun phrase without a predicate.",
            "kind": "dash_parenthetical",
        },
        {
            "context": "국가 약어와 시간 부사절",
            "normal": "The U.S. delegation approved the draft.",
            "defect": "After the U.S. delegation approved the draft.",
            "normal_analysis": "Approved is the independent finite predicate; periods inside U.S. are abbreviation marks.",
            "defect_analysis": "After turns the otherwise finite clause into a dependent adverbial clause.",
            "kind": "multi_period_abbreviation",
        },
        {
            "context": "인용된 질문과 보고절",
            "normal": "“Are we early?” Mina asked.",
            "defect": "Whether Mina asked, “Are we early?”",
            "normal_analysis": "Mina asked is a complete reporting clause paired with the quoted question.",
            "defect_analysis": "Whether introduces a dependent clause and no matrix predicate follows it.",
            "kind": "quoted_question",
        },
        {
            "context": "명령 인용문과 분사 수식",
            "normal": "The sign read, “Do not enter.”",
            "defect": "A sign reading, “Do not enter.”",
            "normal_analysis": "The sign is the subject and read is a finite matrix predicate.",
            "defect_analysis": "Reading is participial and merely modifies sign; there is no finite predicate.",
            "kind": "quotation_and_participle",
        },
        {
            "context": "조동사 의문문과 whether절",
            "normal": "Can the backup battery power the lift?",
            "defect": "Whether the backup battery can power the lift?",
            "normal_analysis": "Can-subject inversion marks a complete direct question.",
            "defect_analysis": "Whether creates an embedded interrogative that needs a matrix clause despite the question mark.",
            "kind": "modal_question",
        },
        {
            "context": "부정사 주어와 독립 술어",
            "normal": "To apologize now would help.",
            "defect": "To apologize now.",
            "normal_analysis": "The infinitival subject is licensed by the finite modal predicate would help.",
            "defect_analysis": "The infinitival phrase has no finite predicate.",
            "kind": "to_infinitive_subject",
        },
        {
            "context": "문장 안 부정사와 독립 부정사",
            "normal": "The analyst paused to verify the total.",
            "defect": "To verify the total before publication.",
            "normal_analysis": "Paused supplies the independent finite spine and the infinitive expresses purpose.",
            "defect_analysis": "The infinitival phrase is not attached to any independent finite clause.",
            "kind": "to_infinitive_attachment",
        },
        {
            "context": "관계절 이후 주절 술어 경계",
            "normal": "The editor who found the error corrected it.",
            "defect": "The editor who found the error before publication.",
            "normal_analysis": "Corrected is the matrix predicate outside the who-relative clause.",
            "defect_analysis": "The editor plus its who-relative clause remains a noun phrase without a matrix predicate.",
            "kind": "relative_clause_matrix_predicate",
        },
        {
            "context": "융합 관계절의 주어 기능",
            "normal": "What the witness remembered changed the timeline.",
            "defect": "What the witness remembered before dawn.",
            "normal_analysis": "The fused relative clause is the subject of the finite matrix predicate changed.",
            "defect_analysis": "The fused relative clause stands as a nominal constituent without a matrix predicate.",
            "kind": "fused_relative",
        },
        {
            "context": "조건 부사절 도입부",
            "normal": "If the valve opens, the pressure will fall.",
            "defect": "If the valve opens.",
            "normal_analysis": "The if-clause is completed by the independent clause the pressure will fall.",
            "defect_analysis": "If subordinates the only finite clause.",
            "kind": "conditional_opener",
        },
        {
            "context": "시간 부사절 도입부",
            "normal": "Whenever the bell rings, the doors unlock.",
            "defect": "Whenever the bell rings.",
            "normal_analysis": "The whenever-clause modifies the independent clause the doors unlock.",
            "defect_analysis": "Whenever leaves the only finite clause dependent.",
            "kind": "temporal_opener",
        },
    ]

    cases: list[dict[str, Any]] = []
    for number, spec in enumerate(specs, start=1):
        pair_id = f"v9-f4-p{number:02d}"
        for oracle in ("normal", "defect"):
            complete = oracle == "normal"
            candidate = spec[oracle]
            analysis = spec[f"{oracle}_analysis"]
            surface = {
                "context": spec["context"],
                "instruction": "Classify the candidate as a complete sentence or a dependent fragment.",
                "candidate": candidate,
            }
            evidence = {
                "has_independent_finite_clause_spine": complete,
                "terminal_punctuation_present": has_terminal_punctuation(candidate),
                "boundary_kind": spec["kind"],
                "clause_analysis": analysis,
            }
            rationale = (
                f"{analysis} Therefore the candidate is "
                f"{'structurally complete' if complete else 'a dependent fragment despite its surface punctuation'}."
            )
            cases.append(
                make_case(
                    case_id=f"{pair_id}-{oracle}",
                    pair_id=pair_id,
                    family_id=F4,
                    oracle=oracle,
                    question_type="SENTENCE_COMPLETENESS",
                    surface=surface,
                    rationale=rationale,
                    evidence=evidence,
                    tags=[
                        "sentence_completeness",
                        "independent_finite_spine" if complete else "dependent_fragment",
                        "terminal_punctuation",
                        spec["kind"],
                    ],
                )
            )
    return cases


def family_descriptors() -> list[dict[str, Any]]:
    return [
        {
            "family_id": F1,
            "title": "SUMMARY_COMPLETE_MC full-option/key cohesion",
            "pair_count": 20,
            "case_count": 40,
            "normal_count": 20,
            "defect_count": 20,
            "contract": "A verbatim full-option selection and the keyed option label must name the same option.",
        },
        {
            "family_id": F2,
            "title": "GRAMMAR_KEY_POINT rendered-label existence",
            "pair_count": 20,
            "case_count": 40,
            "normal_count": 20,
            "defect_count": 20,
            "contract": "The exact leading key-point label must exist in the rendered-label inventory.",
        },
        {
            "family_id": F3,
            "title": "SENTENCE_ORDER structural-label position",
            "pair_count": 20,
            "case_count": 40,
            "normal_count": 20,
            "defect_count": 20,
            "contract": "Every expected label must introduce a rendered line; lexical occurrences are not delimiters.",
        },
        {
            "family_id": F4,
            "title": "dependent fragment versus complete sentence",
            "pair_count": 20,
            "case_count": 40,
            "normal_count": 20,
            "defect_count": 20,
            "contract": "A complete sentence requires an independent finite-clause spine, not merely punctuation.",
        },
    ]


def build_corpus() -> dict[str, Any]:
    cases = (
        build_f1_cases()
        + build_f2_cases()
        + build_f3_cases()
        + build_f4_cases()
    )
    return {
        "schema_version": SCHEMA_VERSION,
        "corpus_id": CORPUS_ID,
        "authored_on": "2026-07-15",
        "authoring_mode": "blind_pre_inspection",
        "scope_guard": {
            "production_source_inspected": False,
            "tests_inspected": False,
            "prior_v7_v8_material_inspected": False,
            "research_note_inspected": False,
            "passage_or_database_ids_used": False,
            "secrets_or_external_services_used": False,
        },
        "oracle_labels": ["normal", "defect"],
        "families": family_descriptors(),
        "cases": cases,
    }


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def validate_common(case: dict[str, Any]) -> None:
    required_case_keys = {
        "case_id",
        "pair_id",
        "family_id",
        "oracle",
        "question_type",
        "surface",
        "oracle_detail",
    }
    require(set(case) == required_case_keys, f"case schema mismatch: {case.get('case_id')}")
    require(case["oracle"] in {"normal", "defect"}, f"bad oracle: {case['case_id']}")
    require(isinstance(case["surface"], dict) and case["surface"], f"empty surface: {case['case_id']}")
    detail = case["oracle_detail"]
    require(
        set(detail) == {"is_structural_defect", "rationale", "evidence", "tags"},
        f"oracle detail schema mismatch: {case['case_id']}",
    )
    require(
        detail["is_structural_defect"] == (case["oracle"] == "defect"),
        f"defect boolean mismatch: {case['case_id']}",
    )
    require(
        isinstance(detail["rationale"], str) and len(detail["rationale"]) >= 40,
        f"rationale too short: {case['case_id']}",
    )
    require(isinstance(detail["evidence"], dict) and detail["evidence"], f"missing evidence: {case['case_id']}")
    tags = detail["tags"]
    require(isinstance(tags, list) and len(tags) >= 3, f"missing tags: {case['case_id']}")
    require(len(tags) == len(set(tags)), f"duplicate tags: {case['case_id']}")


def validate_f1(case: dict[str, Any]) -> None:
    surface = case["surface"]
    evidence = case["oracle_detail"]["evidence"]
    require(case["question_type"] == "SUMMARY_COMPLETE_MC", f"F1 type: {case['case_id']}")
    require(len(surface["options"]) == 4, f"F1 option count: {case['case_id']}")
    labels = [option["label"] for option in surface["options"]]
    require(len(labels) == len(set(labels)), f"F1 duplicate option labels: {case['case_id']}")
    require(surface["keyed_option"] in labels, f"F1 missing key label: {case['case_id']}")
    selected = [
        option
        for option in surface["options"]
        if option["label"] == evidence["selected_option_label"]
    ]
    require(len(selected) == 1, f"F1 selected label absent: {case['case_id']}")
    require(
        selected[0]["text"] == evidence["selected_full_surface"],
        f"F1 full surface mismatch: {case['case_id']}",
    )
    channel = surface["authoritative_selection_channel"]
    require(channel in {"stem", "explanation"}, f"F1 bad channel: {case['case_id']}")
    require(
        evidence["selected_full_surface"] in surface[channel],
        f"F1 selected surface not verbatim in carrier: {case['case_id']}",
    )
    aligned = surface["keyed_option"] == evidence["selected_option_label"]
    require(evidence["keyed_option_label"] == surface["keyed_option"], f"F1 key evidence: {case['case_id']}")
    require(evidence["full_surface_is_verbatim"] is True, f"F1 verbatim flag: {case['case_id']}")
    require(evidence["key_matches_selected_option"] == aligned, f"F1 alignment flag: {case['case_id']}")
    require(aligned == (case["oracle"] == "normal"), f"F1 oracle mismatch: {case['case_id']}")


def validate_f2(case: dict[str, Any]) -> None:
    surface = case["surface"]
    evidence = case["oracle_detail"]["evidence"]
    require(case["question_type"] == "GRAMMAR_KEY_POINT", f"F2 type: {case['case_id']}")
    reference = surface["referenced_label"]
    inventory = surface["rendered_label_inventory"]
    require(surface["grammar_key_point"].startswith(reference), f"F2 reference not leading: {case['case_id']}")
    require(len(inventory) == len(set(inventory)), f"F2 duplicate inventory: {case['case_id']}")
    present = reference in inventory
    require(evidence["reference_is_leading"] is True, f"F2 leading flag: {case['case_id']}")
    require(evidence["referenced_label"] == reference, f"F2 reference evidence: {case['case_id']}")
    require(evidence["rendered_label_inventory"] == inventory, f"F2 inventory evidence: {case['case_id']}")
    require(
        evidence["reference_present_in_rendered_inventory"] == present,
        f"F2 presence evidence: {case['case_id']}",
    )
    if present:
        require(reference in surface["rendered_text"], f"F2 rendered label missing: {case['case_id']}")
    else:
        require(reference not in surface["rendered_text"], f"F2 absent reference leaked into rendering: {case['case_id']}")
    require(present == (case["oracle"] == "normal"), f"F2 oracle mismatch: {case['case_id']}")


def validate_f3(case: dict[str, Any]) -> None:
    surface = case["surface"]
    evidence = case["oracle_detail"]["evidence"]
    require(case["question_type"] == "SENTENCE_ORDER", f"F3 type: {case['case_id']}")
    expected = surface["expected_structural_labels"]
    require(len(expected) == 3 and len(set(expected)) == 3, f"F3 expected labels: {case['case_id']}")
    scanned = leading_labels(surface["rendered_body"], expected)
    require(scanned == surface["observed_leading_block_labels"], f"F3 scanner mismatch: {case['case_id']}")
    require(evidence["expected_labels"] == expected, f"F3 evidence expected: {case['case_id']}")
    require(evidence["observed_leading_labels"] == scanned, f"F3 evidence observed: {case['case_id']}")
    if case["oracle"] == "normal":
        require(scanned == expected, f"F3 normal labels incomplete: {case['case_id']}")
        require(all(scanned.count(label) == 1 for label in expected), f"F3 normal duplicate: {case['case_id']}")
        require(evidence["missing_leading_label"] is None, f"F3 normal missing evidence: {case['case_id']}")
        require(evidence["phantom_label"] is None, f"F3 normal phantom evidence: {case['case_id']}")
    else:
        missing = [label for label in expected if label not in scanned]
        require(len(missing) == 1, f"F3 defect must miss one label: {case['case_id']}")
        phantom = evidence["phantom_label"]
        require(missing[0] == phantom == evidence["missing_leading_label"], f"F3 phantom mismatch: {case['case_id']}")
        require(phantom in surface["rendered_body"], f"F3 phantom absent from body: {case['case_id']}")
        require(evidence["phantom_surface"] in surface["rendered_body"], f"F3 phantom surface absent: {case['case_id']}")
        require(
            evidence["phantom_context_kind"] in {"mid_sentence", "quotation", "modifier", "inline_code", "lexical_mention"},
            f"F3 bad phantom context: {case['case_id']}",
        )


def validate_f4(case: dict[str, Any]) -> None:
    surface = case["surface"]
    evidence = case["oracle_detail"]["evidence"]
    require(case["question_type"] == "SENTENCE_COMPLETENESS", f"F4 type: {case['case_id']}")
    candidate = surface["candidate"]
    require(has_terminal_punctuation(candidate), f"F4 missing terminal punctuation: {case['case_id']}")
    require(evidence["terminal_punctuation_present"] is True, f"F4 punctuation flag: {case['case_id']}")
    complete = evidence["has_independent_finite_clause_spine"]
    require(isinstance(complete, bool), f"F4 complete flag type: {case['case_id']}")
    require(bool(evidence["clause_analysis"]), f"F4 clause analysis: {case['case_id']}")
    require(bool(evidence["boundary_kind"]), f"F4 boundary kind: {case['case_id']}")
    require(complete == (case["oracle"] == "normal"), f"F4 oracle mismatch: {case['case_id']}")


def assert_no_identifier_or_secret_fields(value: Any, path: str = "$") -> None:
    forbidden_key_fragments = ("passage_id", "database_id", "db_id", "api_key", "secret", "credential")
    if isinstance(value, dict):
        for key, child in value.items():
            lowered = key.lower()
            require(
                not any(fragment in lowered for fragment in forbidden_key_fragments),
                f"forbidden identifier/secret field at {path}.{key}",
            )
            assert_no_identifier_or_secret_fields(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            assert_no_identifier_or_secret_fields(child, f"{path}[{index}]")


def verify_corpus(corpus: dict[str, Any]) -> dict[str, Any]:
    expected_top = {
        "schema_version",
        "corpus_id",
        "authored_on",
        "authoring_mode",
        "scope_guard",
        "oracle_labels",
        "families",
        "cases",
    }
    require(set(corpus) == expected_top, "top-level schema mismatch")
    require(corpus["schema_version"] == SCHEMA_VERSION, "schema version mismatch")
    require(corpus["corpus_id"] == CORPUS_ID, "corpus id mismatch")
    require(corpus["authoring_mode"] == "blind_pre_inspection", "authoring mode mismatch")
    require(corpus["oracle_labels"] == ["normal", "defect"], "oracle labels mismatch")
    require(all(value is False for value in corpus["scope_guard"].values()), "scope guard must remain false")
    assert_no_identifier_or_secret_fields(corpus["cases"])

    cases = corpus["cases"]
    require(isinstance(cases, list) and len(cases) == 160, "total case count must be 160")
    case_ids: set[str] = set()
    surface_digests: set[str] = set()
    by_pair: dict[str, list[dict[str, Any]]] = defaultdict(list)
    by_family: dict[str, list[dict[str, Any]]] = defaultdict(list)
    validators = {F1: validate_f1, F2: validate_f2, F3: validate_f3, F4: validate_f4}

    for case in cases:
        validate_common(case)
        require(case["case_id"] not in case_ids, f"duplicate case id: {case['case_id']}")
        case_ids.add(case["case_id"])
        digest = sha256_bytes(canonical_bytes(case["surface"]))
        require(digest not in surface_digests, f"duplicate canonical surface: {case['case_id']}")
        surface_digests.add(digest)
        require(case["family_id"] in validators, f"unknown family: {case['case_id']}")
        validators[case["family_id"]](case)
        by_pair[case["pair_id"]].append(case)
        by_family[case["family_id"]].append(case)

    require(len(by_pair) == 80, "pair count must be 80")
    for pair_id, pair_cases in by_pair.items():
        require(len(pair_cases) == 2, f"pair size must be two: {pair_id}")
        require({case["oracle"] for case in pair_cases} == {"normal", "defect"}, f"pair oracle symmetry: {pair_id}")
        require(len({case["family_id"] for case in pair_cases}) == 1, f"cross-family pair: {pair_id}")

    descriptor_by_id = {item["family_id"]: item for item in corpus["families"]}
    require(set(descriptor_by_id) == set(validators), "family descriptors mismatch")
    metrics_by_family: dict[str, Any] = {}
    for family_id in (F1, F2, F3, F4):
        family_cases = by_family[family_id]
        oracle_counts = Counter(case["oracle"] for case in family_cases)
        pair_count = len({case["pair_id"] for case in family_cases})
        require(len(family_cases) == 40, f"{family_id} must have 40 cases")
        require(pair_count == 20, f"{family_id} must have 20 pairs")
        require(oracle_counts == {"normal": 20, "defect": 20}, f"{family_id} oracle counts")
        descriptor = descriptor_by_id[family_id]
        require(descriptor["pair_count"] == 20, f"{family_id} descriptor pair count")
        require(descriptor["case_count"] == 40, f"{family_id} descriptor case count")
        require(descriptor["normal_count"] == 20, f"{family_id} descriptor normal count")
        require(descriptor["defect_count"] == 20, f"{family_id} descriptor defect count")
        metrics_by_family[family_id] = {
            "pairs": pair_count,
            "cases": len(family_cases),
            "normal": oracle_counts["normal"],
            "defect": oracle_counts["defect"],
        }

    return {
        "total_cases": len(cases),
        "total_pairs": len(by_pair),
        "unique_case_ids": len(case_ids),
        "unique_surface_payloads": len(surface_digests),
        "families": metrics_by_family,
    }


def build_manifest(corpus: dict[str, Any], metrics: dict[str, Any]) -> dict[str, Any]:
    files: dict[str, Any] = {}
    for name in HASHED_FILES:
        path = BASE / name
        files[name] = {
            "sha256": sha256_file(path),
            "bytes": path.stat().st_size,
        }
    return {
        "manifest_version": "1.0.0",
        "corpus_id": CORPUS_ID,
        "sealed_stage": "pre_inspection",
        "sealed_at": SEALED_AT,
        "hash_algorithm": "SHA-256",
        "blindness_declaration": {
            "production_source_inspected": False,
            "tests_inspected": False,
            "prior_v7_v8_material_inspected": False,
            "research_note_inspected": False,
            "external_io_used": False,
        },
        "files": files,
        "aggregate_case_digest": sha256_bytes(canonical_bytes(corpus["cases"])),
        "verified_metrics": metrics,
    }


def verify_sealed_files() -> dict[str, Any]:
    actual_names = {path.name for path in BASE.iterdir()}
    require(actual_names == ALLOWED_FILES, f"sealed directory file set mismatch: {sorted(actual_names)}")

    corpus = json.loads((BASE / CASES_NAME).read_text(encoding="utf-8"))
    metrics = verify_corpus(corpus)
    manifest = json.loads((BASE / MANIFEST_NAME).read_text(encoding="utf-8"))
    require(manifest["manifest_version"] == "1.0.0", "manifest version mismatch")
    require(manifest["corpus_id"] == CORPUS_ID, "manifest corpus id mismatch")
    require(manifest["sealed_stage"] == "pre_inspection", "manifest stage mismatch")
    require(manifest["hash_algorithm"] == "SHA-256", "manifest hash algorithm mismatch")
    require(all(value is False for value in manifest["blindness_declaration"].values()), "manifest blindness flags")
    require(set(manifest["files"]) == set(HASHED_FILES), "manifest file allowlist mismatch")
    for name in HASHED_FILES:
        record = manifest["files"][name]
        path = BASE / name
        require(record["sha256"] == sha256_file(path), f"file digest mismatch: {name}")
        require(record["bytes"] == path.stat().st_size, f"file size mismatch: {name}")
    require(
        manifest["aggregate_case_digest"] == sha256_bytes(canonical_bytes(corpus["cases"])),
        "aggregate case digest mismatch",
    )
    require(manifest["verified_metrics"] == metrics, "manifest metrics mismatch")

    expected_seal = f"{sha256_file(BASE / MANIFEST_NAME)}  {MANIFEST_NAME}\n"
    actual_seal = (BASE / SEAL_NAME).read_text(encoding="ascii")
    require(actual_seal == expected_seal, "pre-inspection seal mismatch")
    return metrics


def build_and_seal() -> dict[str, Any]:
    corpus = build_corpus()
    metrics = verify_corpus(corpus)
    write_json(BASE / CASES_NAME, corpus)
    manifest = build_manifest(corpus, metrics)
    write_json(BASE / MANIFEST_NAME, manifest)
    seal = f"{sha256_file(BASE / MANIFEST_NAME)}  {MANIFEST_NAME}\n".encode("ascii")
    write_bytes(BASE / SEAL_NAME, seal)
    return verify_sealed_files()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--build", action="store_true", help="deterministically build, verify, and seal")
    mode.add_argument("--verify-only", action="store_true", help="verify the existing sealed corpus")
    args = parser.parse_args()
    metrics = build_and_seal() if args.build else verify_sealed_files()
    print(
        json.dumps(
            {
                "status": "verified",
                "corpus_id": CORPUS_ID,
                "metrics": metrics,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
