#!/usr/bin/env python3
"""Author and seal the v8 blind semantic corpus without reading the project."""

from __future__ import annotations

import hashlib
import json
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent
CASES_PATH = ROOT / "cases.json"
SEAL_PATH = ROOT / "blind-seal.json"
PROTOCOL_PATH = ROOT / "BLIND_PROTOCOL.md"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def circled(index: int) -> str:
    return "①②③④⑤"[index]


def add_case(cases, *, case_id, family, control, pair_id, tags, payload, rationale):
    cases.append(
        {
            "id": case_id,
            "family": family,
            "control": control,
            "oracle": "ACCEPT" if control == "normal" else "BLOCK",
            "pair_id": pair_id,
            "tags": tags,
            "input": payload,
            "oracle_rationale": rationale,
        }
    )


def summary_binding_cases(cases):
    family = "summary_complete_mc_answer_object_binding"
    rows = [
        ("amber reeds", "silver reeds", "Reeds that bend during flood pulses retain more nesting material than rigid reeds."),
        ("lunar moths", "harbor moths", "Moths which follow polarized moonlight avoid the lamps that cluster near docks."),
        ("cedar spores", "marble spores", "Spores that rest beneath cedar bark survive the dry interval more often."),
        ("quiet turbines", "rapid turbines", "Turbines which pause between gusts accumulate less damaging heat."),
        ("porous tiles", "sealed tiles", "Tiles that contain narrow pores release stored warmth after sunset."),
        ("winter kelp", "summer kelp", "Kelp which grows below the winter thermocline keeps a denser sugar reserve."),
        ("violet lenses", "crimson lenses", "Lenses that filter violet glare reveal the faint scratches on old glass."),
        ("shallow burrows", "granite burrows", "Burrows which remain shallow let desert mice hear approaching rain."),
        ("measured pauses", "constant speech", "Speakers who insert measured pauses are recalled more accurately by novice listeners."),
        ("flexible tariffs", "fixed tariffs", "Tariffs that adjust after droughts protect small mills from abrupt shortages."),
        ("shared ledgers", "private ledgers", "Ledgers which circulate among cooperatives expose duplicated transport fees."),
        ("cool pigments", "heated pigments", "Pigments that cure in cool shade preserve the blue layer beneath the varnish."),
        ("willow baskets", "iron baskets", "Baskets that the delta farmers weave from willow keep seedlings aerated."),
        ("delayed beacons", "instant beacons", "Beacons which the cliff wardens delay until fog thickens reduce false alarms."),
        ("narrow channels", "broad terraces", "Channels that redirect only the first runoff protect terraces which hold young olives."),
        ("patient auditors", "hurried couriers", "Auditors who compare the river invoices with manifests that carriers sign catch hidden surcharges."),
    ]
    command_styles = [
        "정답 {label}번 {target} 골라야 한다.",
        "요약 빈칸 {target} 넣는 선택은 {label}번이다.",
        "완성어 {target} 택하면 {label}번이 된다.",
        "따라서 {label}번 {target} 선택한다.",
        "정답으로서는는 {label}번을, 완성어로도는 {target}을 취한다.",
        "요약의 대상으로서는도 {target}을, 번호로는는 {label}번을 고른다.",
        "빈칸 답으로만은 {target}을, 선지로서는는 {label}번을 지정한다.",
        "결론의 핵심으로서도는 {target}을 택하므로 정답은은 {label}번이다.",
        "{label}번, 곧 {target}의 선택이 요구됨.",
        "요약 완성을 위해 {target}이 {label}번으로 채택되어야 한다.",
        "{target}이 들어간 {label}번이 선정되도록 되어 있다.",
        "완성 대상으로 {target}을 택할 것이 요구되며 번호는 {label}번이다.",
        "본문의 {source}라는 관찰과 반대 후보 {other}를 대조하면, 관계절이 수식하는 대상은 {target}이고 채택할 선지는 {label}번이다.",
        "자료의 표현 {source}와 보조 목적어 '기록 보존'을 함께 보더라도, which절의 귀착점은 {target}이므로 {label}번을 택한다.",
        "연구자가 인용한 {source}, 선택지의 {other}, 그리고 보호 대상 'young olives' 중 빈칸의 주어가 되는 것은 {target}이며 번호는 {label}번이다.",
        "운송장이 가리키는 {source}와 서명자들이 남긴 manifests를 구분하면 who절의 행위자는 {target}이므로 {label}번이 답이다.",
    ]
    for i, (target, other, passage) in enumerate(rows, start=1):
        correct_index = (i * 2) % 5
        label = circled(correct_index)
        distractors = [
            f"ritual marker {i}",
            f"borrowed signal {i}",
            f"unused ledger {i}",
            f"remote shelter {i}",
            f"temporary gauge {i}",
        ]
        distractors[correct_index] = target
        wrong_index = (correct_index + 2) % 5
        distractors[wrong_index] = other
        style = command_styles[i - 1]
        source = passage.split(" ", 5)[-1].rstrip(".")
        normal_explanation = style.format(label=label, target=target, other=other, source=source)
        defect_explanation = style.format(label=label, target=other, other=target, source=source)
        if i <= 4:
            tags = ["korean-particle-omitted"]
        elif i <= 8:
            tags = ["korean-particle-stacked"]
        elif i <= 12:
            tags = ["nominalized-or-passive-command"]
        else:
            tags = ["multiple-objects", "source-phrase", "english-relative-clause"]
        base = {
            "question_type": "SUMMARY_COMPLETE_MC",
            "passage": passage,
            "stem": f"글의 요약문을 완성할 때 핵심 대상으로 가장 적절한 것을 고르시오. [binding-v8-{i:02d}]",
            "summary": "The passage indicates that [BLANK] best preserves the observed advantage.",
            "choices": distractors,
            "correct_answer": label,
            "correct_answer_text": target,
        }
        pair_id = f"SCB-{i:02d}"
        add_case(
            cases,
            case_id=f"SCB-{i:02d}-N",
            family=family,
            control="normal",
            pair_id=pair_id,
            tags=tags + ["binding-faithful"],
            payload={**base, "explanation": normal_explanation},
            rationale="The explanation binds the command object to the keyed answer text.",
        )
        add_case(
            cases,
            case_id=f"SCB-{i:02d}-D",
            family=family,
            control="defect",
            pair_id=pair_id,
            tags=tags + ["binding-mismatch"],
            payload={**base, "explanation": defect_explanation},
            rationale="The keyed label is retained, but the commanded answer object is a distractor.",
        )


def blank_option_analysis_cases(cases):
    family = "blank_explanation_option_analysis"
    topics = [
        ("reef bells", "warn divers before currents reverse"),
        ("orchard mirrors", "scatter frost-forming radiation"),
        ("clay whistles", "signal kiln temperature without opening it"),
        ("moss calendars", "record intervals of roof dampness"),
        ("river kites", "map crosswinds above the gorge"),
        ("linen tags", "trace repeated handling in the archive"),
        ("seed clocks", "synchronize sprouting after rain"),
        ("stone flutes", "reveal pressure changes in tunnels"),
        ("wax tablets", "preserve temporary route revisions"),
        ("fog ladders", "guide insects above cold air pockets"),
        ("copper threads", "carry weak signals through folded cloth"),
        ("salt windows", "show when storage air becomes humid"),
        ("reed valves", "slow backflow during tidal surges"),
        ("chalk wheels", "mark axle drift on rough roads"),
        ("glass roots", "distribute light beneath dense leaves"),
        ("paper anchors", "stabilize maps during field notation"),
    ]
    for i, (subject, function) in enumerate(topics, start=1):
        correct_index = (i + 1) % 5
        correct = f"{subject} {function}"
        options = [
            f"{subject} conceal all seasonal variation",
            f"{subject} {function}",
            f"{subject} replace every manual observation",
            f"{subject} increase noise without measurement",
            f"{subject} prevent later comparison",
        ]
        # Rotate while preserving a unique keyed answer.
        options.remove(correct)
        options.insert(correct_index, correct)
        label = circled(correct_index)
        normal = (
            f"{label}의 '{correct}'는 본문의 기능을 그대로 설명한다. "
            f"반면 {circled((correct_index + 1) % 5)}의 '{options[(correct_index + 1) % 5]}'는 효과를 과장하고, "
            f"{circled((correct_index + 2) % 5)}의 '{options[(correct_index + 2) % 5]}'는 관찰 목적과 반대이므로 배제된다."
        )
        defect = (
            "① 빈칸 앞 문장을 천천히 읽는다. ② 접속 표현에 밑줄을 긋는다. "
            "③ 주제어를 여백에 적는다. ④ 다섯 번호를 차례로 훑는다. ⑤ 마지막에 답안지를 표시한다."
        )
        base = {
            "question_type": "BLANK_INFERENCE",
            "passage": f"Field teams placed {subject} near the site because the devices could {function}.",
            "stem": f"빈칸에 들어갈 말로 가장 적절한 것을 고르시오. [procedure-v8-{i:02d}]",
            "blank_sentence": "The devices were valuable because they could [BLANK].",
            "choices": options,
            "correct_answer": label,
            "correct_answer_text": correct,
        }
        pair_id = f"BOA-{i:02d}"
        add_case(
            cases,
            case_id=f"BOA-{i:02d}-N",
            family=family,
            control="normal",
            pair_id=pair_id,
            tags=["real-option-analysis", "circled-labels"],
            payload={**base, "explanation": normal},
            rationale="The explanation evaluates the keyed option and rejects concrete distractor content.",
        )
        add_case(
            cases,
            case_id=f"BOA-{i:02d}-D",
            family=family,
            control="defect",
            pair_id=pair_id,
            tags=["procedural-circled-steps", "no-option-analysis"],
            payload={**base, "explanation": defect},
            rationale="Circled numerals enumerate a solving procedure and never analyze any option meaning.",
        )


def grammar_ghost_cases(cases):
    family = "grammar_ghost_labels_unicode_rendered"
    ghost_forms = [
        "（ｆ）", "⒡", "ⓕ", "𝒇", "𝔣", "𝖋", "ｆ", "f̲",
        "〈f〉", "［f］", "❨f❩", "⑥", "⁽ᶠ⁾", "<u>f</u>", "&#102;", "\u24BB",
    ]
    nouns = [
        "opal compass", "birch register", "cobalt kettle", "dune lantern",
        "elm chronicle", "flax pulley", "garnet cistern", "heather dial",
        "indigo capsule", "juniper frame", "kelp astrolabe", "linen prism",
        "maple retort", "nickel spindle", "ochre beacon", "pearl abacus",
    ]
    for i, (ghost, noun) in enumerate(zip(ghost_forms, nouns), start=1):
        passage = (
            f"The {noun} (a) was stored where the curator (b) could inspect it, "
            "and its surface (c) remained dry because the cabinet (d) was sealed (e) overnight."
        )
        base = {
            "question_type": "GRAMMAR",
            "passage": passage,
            "stem": f"표시된 부분의 문법 설명으로 적절한 것을 고르시오. [ghost-v8-{i:02d}]",
            "existing_labels": ["(a)", "(b)", "(c)", "(d)", "(e)"],
            "correct_answer": "③",
            "choices": ["a", "b", "c", "d", "e"],
        }
        normal = f"(c)는 실제 표시된 항목이며, {noun}의 surface를 받는 단수 주어와 일치한다."
        defect = f"{ghost}는 야간 보관의 핵심 오류이며, {noun} 뒤에서 반드시 고쳐야 한다."
        pair_id = f"GGL-{i:02d}"
        add_case(
            cases,
            case_id=f"GGL-{i:02d}-N",
            family=family,
            control="normal",
            pair_id=pair_id,
            tags=["existing-label", "render-control"],
            payload={**base, "explanation": normal},
            rationale="The explanation cites only a label that is visibly present.",
        )
        add_case(
            cases,
            case_id=f"GGL-{i:02d}-D",
            family=family,
            control="defect",
            pair_id=pair_id,
            tags=["ghost-label", f"ghost-form-{i:02d}"],
            payload={**base, "explanation": defect, "ghost_literal": ghost},
            rationale="The explanation cites a rendered form of nonexistent label f/six.",
        )


def grammar_rule_truth_cases(cases):
    family = "grammar_free_text_rule_truth"
    rows = [
        ("Each of the brass compasses (a) were checked before noon.", "(a)", "'Each of'의 핵은 단수이므로 were를 was로 고쳐야 한다.", "'Each of' 뒤의 동사는 언제나 복수이므로 were가 맞다."),
        ("One of the cedar drawers (b) contain a hidden latch.", "(b)", "주어 One이 단수이므로 contain을 contains로 고쳐야 한다.", "drawers가 복수이므로 contain만 가능하다."),
        ("The equipment beside the violet tents (c) are insured.", "(c)", "equipment는 불가산 단수 취급이므로 are를 is로 고쳐야 한다.", "equipment는 복수 가산명사이므로 are가 맞다."),
        ("The news from the basalt quarry (d) have surprised the crew.", "(d)", "news는 형태와 달리 단수이므로 have를 has로 고쳐야 한다.", "news는 s로 끝나므로 반드시 복수 동사 have를 쓴다."),
        ("Neither the receipt nor the appendix (e) were copied.", "(e)", "서로 가까운 두 주어가 모두 단수이므로 were를 was로 고쳐야 한다.", "neither가 있으면 주어 수와 무관하게 were만 쓴다."),
        ("By the time the amber ferry arrived, the guide (a) has left.", "(a)", "도착보다 먼저 끝난 과거 사건이므로 has left를 had left로 고쳐야 한다.", "과거보다 앞선 사건도 현재완료 has left로 나타내야 한다."),
        ("If Mira had seen the warning, she (b) would close the gate.", "(b)", "과거 사실의 반대 결과이므로 would close를 would have closed로 고쳐야 한다.", "had seen 뒤에는 현재 결과와 무관하게 would close만 온다."),
        ("The curator suggested that Rowan (c) submits a duplicate.", "(c)", "요구·제안의 that절에서는 원형 submit을 쓰는 것이 표준이다.", "suggested 뒤 that절은 반드시 3인칭 단수 submits를 쓴다."),
        ("The mesh prevented the silver minnows from (d) enter the pipe.", "(d)", "전치사 from 뒤에는 동명사 entering이 와야 한다.", "from 뒤에는 언제나 동사원형 enter가 와야 한다."),
        ("The surveyors look forward to (e) meet the island pilot.", "(e)", "look forward to의 to는 전치사이므로 meeting이 필요하다.", "look forward to는 부정사 표현이므로 meet가 맞다."),
        ("The apprentices were interested (a) on the lunar kiln.", "(a)", "be interested는 대상 앞에 전치사 in을 취하므로 on을 in으로 고친다.", "be interested는 대상 앞에 on만 취한다."),
        ("The harbor clerk is responsible (b) of sealing the crates.", "(b)", "책임을 뜻하는 responsible은 전치사 for와 결합한다.", "책임을 뜻하는 responsible은 전치사 of만 허용한다."),
        ("The cistern held (c) fewer water after the repair.", "(c)", "water는 불가산명사이므로 fewer 대신 less를 써야 한다.", "water는 셀 수 있으므로 fewer가 정확하다."),
        ("It was (d) an unique method for drying indigo paper.", "(d)", "unique는 자음 /j/ 소리로 시작하므로 관사 a가 맞다.", "철자 u로 시작하는 모든 단어 앞에는 an만 쓴다."),
        ("Despite (e) of the cold fog, the bells remained audible.", "(e)", "despite는 자체가 전치사이므로 뒤의 of를 삭제해야 한다.", "despite는 항상 of와 함께 써야 한다."),
        ("The artisan not only shapes the wax but also (a) to polish it.", "(a)", "not only와 but also가 잇는 동사 형식을 맞춰 to polish를 polishes로 고쳐야 한다.", "but also 뒤에는 앞부분과 달리 반드시 to부정사를 써야 한다."),
    ]
    for i, (sentence, label, truth, falsehood) in enumerate(rows, start=1):
        base = {
            "question_type": "GRAMMAR",
            "passage": sentence,
            "stem": f"문법상 잘못된 표시 부분과 그 이유를 설명하시오. [rule-truth-v8-{i:02d}]",
            "existing_labels": [label],
            "correct_label": label,
            "correct_answer": "①",
            "choices": [label, "오류 없음", "의미 오류", "철자 오류", "구두점 오류"],
        }
        pair_id = f"GRT-{i:02d}"
        add_case(
            cases,
            case_id=f"GRT-{i:02d}-N",
            family=family,
            control="normal",
            pair_id=pair_id,
            tags=["true-free-text-rule"],
            payload={**base, "explanation": truth},
            rationale="The free-text explanation states the governing rule truthfully.",
        )
        add_case(
            cases,
            case_id=f"GRT-{i:02d}-D",
            family=family,
            control="defect",
            pair_id=pair_id,
            tags=["false-free-text-rule"],
            payload={**base, "explanation": falsehood},
            rationale="The keyed label is unchanged, but the asserted grammar rule is false.",
        )


def sentence_order_duplicate_cases(cases):
    family = "sentence_order_body_duplicate_label_contamination"
    topics = [
        ("a rain-stained atlas", "the conservator dried each leaf", "the index became readable", "the atlas returned to the cabinet"),
        ("a dormant tide gauge", "the engineer replaced its float", "the needle began moving", "the harbor log regained hourly entries"),
        ("a cracked seed vault", "the botanist sealed the vents", "humidity fell steadily", "the rare packets remained viable"),
        ("an unmarked bell mold", "the founder compared old sketches", "the missing crest was identified", "the mold received a new tag"),
        ("a faded canal chart", "the pilot traced buried landmarks", "the abandoned branch emerged", "the route was added to the survey"),
        ("a silent orchard sensor", "the grower cleaned its contacts", "night readings resumed", "the frost team restored its alerts"),
        ("a warped linen frame", "the weaver loosened the corner pins", "the cloth relaxed evenly", "the pattern aligned again"),
        ("a dusty comet plate", "the astronomer scanned the emulsion", "a faint arc appeared", "the observation gained a date"),
        ("a salt-clogged reed valve", "the mechanic rinsed its chamber", "backflow stopped", "the marsh pool stabilized"),
        ("a misplaced quarry ledger", "the clerk sorted invoices by ink", "a missing shipment surfaced", "the account was reconciled"),
        ("a brittle wax cylinder", "the archivist lowered playback speed", "a buried voice became clear", "the speech received a transcript"),
        ("a clouded prism case", "the optician replaced the lining", "surface scratches ceased", "the prisms returned to display"),
        ("a leaning dune marker", "the surveyor reset its base", "the bearing matched the map", "the caravan route reopened"),
        ("a jammed copper loom", "the technician aligned the shuttle", "the threads stopped breaking", "the workshop resumed weaving"),
        ("a blurred cave rubbing", "the historian adjusted side lighting", "the carved dates emerged", "the sequence was catalogued"),
        ("a leaking fog collector", "the caretaker tightened the rim", "the reservoir filled", "the hillside nursery received water"),
    ]
    duplicate_tokens = ["(A)", "(B)", "(C)", "(A)", "(C)", "(B)", "(A)", "(B)", "(C)", "(A)", "(B)", "(C)", "(A)", "(C)", "(B)", "(A)"]
    for i, ((intro, setup, result, close), duplicate) in enumerate(zip(topics, duplicate_tokens), start=1):
        segments = {
            "A": f"As a result, {result}.",
            "B": f"First, {setup}.",
            "C": f"Finally, {close}.",
        }
        contaminated = dict(segments)
        contaminated["A"] = segments["A"] + f" The envelope also carried the storage code {duplicate} in ordinary body prose."
        base = {
            "question_type": "SENTENCE_ORDER",
            "intro": f"The team encountered {intro}.",
            "stem": f"주어진 글 다음에 이어질 문단의 순서를 고르시오. [duplicate-v8-{i:02d}]",
            "choices": ["B-A-C", "A-B-C", "C-A-B", "B-C-A", "C-B-A"],
            "correct_answer": "①",
            "correct_order": ["B", "A", "C"],
            "explanation": "수리 행동인 B 뒤에 변화 A가 오고, 최종 귀결 C가 이어진다.",
        }
        pair_id = f"SOD-{i:02d}"
        add_case(
            cases,
            case_id=f"SOD-{i:02d}-N",
            family=family,
            control="normal",
            pair_id=pair_id,
            tags=["unique-heading-labels", "clean-body"],
            payload={**base, "segments": segments},
            rationale="Each structural label occurs only as its own segment heading.",
        )
        add_case(
            cases,
            case_id=f"SOD-{i:02d}-D",
            family=family,
            control="defect",
            pair_id=pair_id,
            tags=["duplicate-label-in-body", f"duplicate-{duplicate}"],
            payload={**base, "segments": contaminated, "contaminating_literal": duplicate},
            rationale="A structural label is duplicated inside ordinary segment body text.",
        )


def dependent_fragment_cases(cases):
    family = "sentence_order_dependent_fragments"
    rows = [
        ("Although the kiln cooled before sunrise", "the glaze remained pliable"),
        ("Because the tide retreated beyond the outer marker", "the surveyors exposed the channel"),
        ("When the cedar clock struck the ninth chime", "the shutters opened automatically"),
        ("While the violet dye settled in the basin", "the artisan prepared fresh linen"),
        ("If the northern seal warms above ten degrees", "the hatch releases its latch"),
        ("Unless the orchard mirror is tilted westward", "the lower branches remain shaded"),
        ("Since the paper bridge dried overnight", "its folded ribs can bear the model train"),
        ("After the dune beacon flashed twice", "the caravan changed its heading"),
        ("Before the copper reservoir reaches the red mark", "the relief valve begins to hum"),
        ("Even though the archive lamp looked dim", "its ultraviolet strip revealed the erased date"),
        ("Whereas the eastern reed valve closes quickly", "the western valve releases water gradually"),
        ("As soon as the moss dial absorbed the mist", "a blue ring appeared at its edge"),
        ("Once the basalt tray stopped vibrating", "the powder formed an even layer"),
        ("Whenever the glass roots catch afternoon light", "the seedlings turn toward the wall"),
        ("Provided that both linen tags remain attached", "the parcel retains its verified history"),
        ("So that the cliff bells could be heard inland", "the keeper rotated their bronze mouths"),
    ]
    for i, (dependent, main) in enumerate(rows, start=1):
        complete = f"{dependent}, {main}."
        fragment = f"{dependent}."
        common = {
            "question_type": "SENTENCE_ORDER",
            "intro": f"A field note introduced sequence {i} without resolving it.",
            "stem": f"이어질 문단의 순서를 고르시오. [fragment-v8-{i:02d}]",
            "choices": ["A-B-C", "B-C-A", "C-A-B", "A-C-B", "C-B-A"],
            "correct_answer": "①",
            "correct_order": ["A", "B", "C"],
            "explanation": "A의 조건·시간 관계가 먼저 완결되고, B의 관찰과 C의 결론이 이어진다.",
        }
        normal_segments = {"A": complete, "B": f"Observers then recorded checkpoint {i} in the slate log.", "C": f"The record closed with a verified outcome for trial {i}."}
        defect_segments = {**normal_segments, "A": fragment}
        pair_id = f"SDF-{i:02d}"
        add_case(
            cases,
            case_id=f"SDF-{i:02d}-N",
            family=family,
            control="normal",
            pair_id=pair_id,
            tags=["complete-dependent-opener", dependent.split()[0].lower()],
            payload={**common, "segments": normal_segments},
            rationale="The dependent opener is followed by an explicit main clause.",
        )
        add_case(
            cases,
            case_id=f"SDF-{i:02d}-D",
            family=family,
            control="defect",
            pair_id=pair_id,
            tags=["dependent-fragment", dependent.split()[0].lower()],
            payload={**common, "segments": defect_segments},
            rationale="Segment A consists only of a subordinate clause despite terminal punctuation.",
        )


def transformed_residue_cases(cases):
    family = "exact_transformed_answer_residue"
    rows = [
        ("nocturnal cooling stabilizes saffron pigments", "the pigment treatment succeeds after dark"),
        ("shared maps reduce redundant shoreline surveys", "cooperation prevents repeated coastal work"),
        ("porous jars preserve the seeds' breathing space", "the vessel structure protects stored seed"),
        ("delayed bells prevent premature tunnel evacuation", "timed alarms avoid an early exit"),
        ("willow screens scatter the harshest orchard glare", "woven barriers soften intense light"),
        ("short pauses improve novice listeners' recall", "brief silence helps new listeners remember"),
        ("salt threads reveal hidden changes in humidity", "mineral fibers expose moisture shifts"),
        ("rotating ledgers uncover duplicate freight charges", "shared accounting reveals repeated fees"),
        ("cool shelves slow the cracking of wax tablets", "lower storage heat protects wax records"),
        ("narrow spillways preserve the youngest reed beds", "limited channels shelter new marsh growth"),
        ("violet filters expose faint repairs in glass", "colored lenses reveal subtle restoration"),
        ("seasonal tariffs cushion small mills during drought", "adaptive fees protect minor workshops"),
        ("shallow burrows transmit the earliest rain tremors", "near-surface tunnels convey storm vibration"),
        ("patient audits identify concealed harbor surcharges", "careful reviews find hidden port costs"),
        ("flexible joints protect the bridge from crosswinds", "moving connectors reduce lateral wind stress"),
        ("winter kelp stores enough sugar for regrowth", "cold-season algae retain renewal energy"),
    ]
    for i, (answer, paraphrase) in enumerate(rows, start=1):
        clean = f"Research note {i} concludes that [BLANK], a result later summarized as '{paraphrase}'."
        residue = f"Margin checksum: {answer}. Research note {i} concludes that [BLANK], a result later summarized as '{paraphrase}'."
        options = [
            f"irrelevant calibration statement {i}",
            answer,
            f"opposite seasonal claim {i}",
            f"unmeasured historical detail {i}",
            f"unrelated material property {i}",
        ]
        base = {
            "question_type": "TRANSFORMED_BLANK",
            "source_text": f"The original finding was that {answer}.",
            "stem": f"변환된 문장의 빈칸을 완성하시오. [residue-v8-{i:02d}]",
            "choices": options,
            "correct_answer": "②",
            "answer_text": answer,
            "explanation": f"원문의 결론을 보존하는 둘째 선택지가 변환문의 빈칸을 완성한다: {paraphrase}.",
            "residue_scan_surfaces": ["transformed_body"],
        }
        pair_id = f"TAR-{i:02d}"
        add_case(
            cases,
            case_id=f"TAR-{i:02d}-N",
            family=family,
            control="normal",
            pair_id=pair_id,
            tags=["exact-answer-absent-from-visible-body"],
            payload={**base, "transformed_body": clean},
            rationale="The exact answer string is absent from every designated transformed-body surface.",
        )
        add_case(
            cases,
            case_id=f"TAR-{i:02d}-D",
            family=family,
            control="defect",
            pair_id=pair_id,
            tags=["exact-answer-residue", "visible-body-leak"],
            payload={**base, "transformed_body": residue},
            rationale="The exact keyed answer remains visibly embedded in the transformed body.",
        )


def blank_semantic_role_cases(cases):
    family = "blank_inference_semantic_role_preservation"
    rows = [
        ("actor", "Mira, not the porter, locked the western gate before dusk.", "Mira locked the western gate", "The porter locked western gate"),
        ("actor", "Only the alder council renewed the bridge permit.", "the alder council renewed permission", "the harbor guild renewed permission"),
        ("actor", "The junior cartographer, rather than the captain, corrected the reef map.", "the junior cartographer corrected maps", "the senior captain corrected maps"),
        ("actor", "It was the kiln apprentice who noticed the cobalt fracture.", "the kiln apprentice noticed fractures", "the gallery curator noticed fractures"),
        ("polarity", "The linen filter did not remove dissolved cobalt.", "did not remove dissolved cobalt", "did fully remove dissolved cobalt"),
        ("polarity", "The orchard alarm never sounded during the false frost.", "the alarm never sounded then", "the alarm clearly sounded then"),
        ("polarity", "No survey marker was displaced by the midnight current.", "no marker moved overnight", "one marker moved overnight"),
        ("condition", "The hatch opens only if both seals are warm.", "opens only when both seals warm", "opens even when both seals cool"),
        ("condition", "The archive releases maps provided that two clerks sign.", "maps leave after two signatures", "maps leave without two signatures"),
        ("condition", "Unless the western lens is covered, the moths avoid the tray.", "covering west lens permits approach", "uncovering west lens permits approach"),
        ("cause", "Because the cedar panels trapped moisture, the map curled.", "trapped moisture caused map curling", "map curling caused trapped moisture"),
        ("cause", "The delayed ferry forced the botanists to miss the tide window.", "ferry delay caused missed sampling", "missed sampling caused ferry delay"),
        ("cause", "Since the pulley cracked, the curtain dropped across the kiln.", "pulley damage caused curtain descent", "curtain descent caused pulley damage"),
        ("scope", "Only the eastern vats passed every inspection.", "only eastern vats passed inspections", "eastern vats passed only inspections"),
        ("scope", "The keeper checked all bells except the smallest one.", "all but smallest bell checked", "only the smallest bell checked"),
        ("scope", "Every apprentice polished one assigned prism.", "each apprentice polished one prism", "one apprentice polished every prism"),
    ]
    for i, (role, source, faithful, defect) in enumerate(rows, start=1):
        faithful_count = len(faithful.split())
        defect_count = len(defect.split())
        if faithful_count != defect_count:
            raise AssertionError(f"role pair {i} token mismatch: {faithful_count} != {defect_count}")
        for control, candidate in (("normal", faithful), ("defect", defect)):
            options = [
                f"peripheral instrument detail {i}",
                candidate,
                f"unrelated archive sequence {i}",
                f"unsupported frequency estimate {i}",
                f"background color observation {i}",
            ]
            payload = {
                "question_type": "BLANK_INFERENCE",
                "passage": source,
                "stem": f"본문의 의미를 보존하도록 빈칸을 완성하시오. [semantic-role-v8-{i:02d}]",
                "blank_sentence": "The central finding is that [BLANK].",
                "choices": options,
                "correct_answer": "②",
                "correct_answer_text": candidate,
                "explanation": f"둘째 선택지는 원문의 {role} 관계를 보존한다고 제시된다.",
                "paired_candidate_token_count": faithful_count,
                "semantic_role": role,
            }
            add_case(
                cases,
                case_id=f"BSR-{i:02d}-{'N' if control == 'normal' else 'D'}",
                family=family,
                control=control,
                pair_id=f"BSR-{i:02d}",
                tags=[role, "equal-token-pair", "role-faithful" if control == "normal" else "role-corrupted"],
                payload=payload,
                rationale=(
                    f"The keyed answer preserves the source {role} relation."
                    if control == "normal"
                    else f"The keyed answer changes the source {role} relation despite equal token count."
                ),
            )


def validate(cases):
    if len(cases) != 256:
        raise AssertionError(f"expected 256 cases, got {len(cases)}")
    ids = [case["id"] for case in cases]
    if len(ids) != len(set(ids)):
        raise AssertionError("duplicate case id")
    by_family = defaultdict(Counter)
    for case in cases:
        by_family[case["family"]][case["control"]] += 1
    if len(by_family) != 8:
        raise AssertionError(f"expected 8 families, got {len(by_family)}")
    for family, counts in by_family.items():
        if counts != Counter({"normal": 16, "defect": 16}):
            raise AssertionError(f"unbalanced {family}: {dict(counts)}")
    pairs = defaultdict(list)
    for case in cases:
        pairs[(case["family"], case["pair_id"])].append(case)
    for key, pair in pairs.items():
        if sorted(c["control"] for c in pair) != ["defect", "normal"]:
            raise AssertionError(f"bad pair {key}")
    for i in range(1, 17):
        normal = next(c for c in cases if c["id"] == f"BSR-{i:02d}-N")
        defect = next(c for c in cases if c["id"] == f"BSR-{i:02d}-D")
        n = len(normal["input"]["correct_answer_text"].split())
        d = len(defect["input"]["correct_answer_text"].split())
        if n != d:
            raise AssertionError(f"semantic role token mismatch in pair {i}")
    return {family: dict(counts) for family, counts in sorted(by_family.items())}


def main():
    if CASES_PATH.exists() or SEAL_PATH.exists():
        raise SystemExit("refusing to overwrite an existing blind corpus or seal")
    cases = []
    summary_binding_cases(cases)
    blank_option_analysis_cases(cases)
    grammar_ghost_cases(cases)
    grammar_rule_truth_cases(cases)
    sentence_order_duplicate_cases(cases)
    dependent_fragment_cases(cases)
    transformed_residue_cases(cases)
    blank_semantic_role_cases(cases)
    counts = validate(cases)
    created = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    corpus = {
        "schema": "deterministic-question-quality-blind-corpus/v8",
        "created_utc": created,
        "blind_declaration": "Authored before opening production source, existing tests, or prior deterministic audit/remediation artifacts.",
        "oracle_policy": "One mismatch blocks the aggregate; family evidence is reported independently.",
        "case_count": len(cases),
        "family_count": len(counts),
        "family_control_counts": counts,
        "cases": cases,
    }
    CASES_PATH.write_text(json.dumps(corpus, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    seal = {
        "schema": "deterministic-question-quality-blind-seal/v8",
        "sealed_utc": created,
        "phase": "PRE_INSPECTION",
        "case_count": len(cases),
        "family_count": len(counts),
        "balanced_controls": True,
        "family_control_counts": counts,
        "sha256": {
            "cases.json": sha256(CASES_PATH),
            "blind_corpus_author.py": sha256(Path(__file__).resolve()),
            "BLIND_PROTOCOL.md": sha256(PROTOCOL_PATH),
        },
        "forbidden_inputs_confirmed_unused": [
            "production source",
            "existing tests",
            "prior deterministic audit/remediation artifacts",
            "API/model/network/database/secrets",
        ],
    }
    SEAL_PATH.write_text(json.dumps(seal, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"cases": len(cases), "families": len(counts), "cases_sha256": seal["sha256"]["cases.json"]}, indent=2))


if __name__ == "__main__":
    main()

