from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ANALYSIS_DIR = ROOT / "docs" / "grammar_1000_analysis"
SUMMARY_PATH = ANALYSIS_DIR / "summary.json"
AUDIT_PATH = ANALYSIS_DIR / "exhaustive_audit" / "exhaustive_question_audit.json"
OUT_MD = ANALYSIS_DIR / "generation_policy_from_audit.md"
OUT_JSON = ANALYSIS_DIR / "generation_policy_from_audit.json"


def split_multi(value: str | None) -> list[str]:
    if not value:
        return []
    return [part.strip() for part in value.split(";") if part.strip()]


def top(counter: Counter[str], n: int = 12) -> list[dict[str, int | str]]:
    return [{"name": name, "count": count} for name, count in counter.most_common(n)]


def main() -> None:
    summary = json.loads(SUMMARY_PATH.read_text(encoding="utf-8"))
    rows = json.loads(AUDIT_PATH.read_text(encoding="utf-8"))

    by_level: dict[str, list[dict[str, object]]] = defaultdict(list)
    for row in rows:
        by_level[str(row.get("difficulty") or "미상")].append(row)

    policy: dict[str, object] = {
        "source": {
            "summary": str(SUMMARY_PATH.relative_to(ROOT)),
            "audit": str(AUDIT_PATH.relative_to(ROOT)),
            "question_count": summary["question_count"],
        },
        "global": {
            "forms": summary["forms"],
            "difficulties": summary["difficulties"],
            "top_points": top(Counter(summary["points"])),
            "top_traps": top(Counter(summary["traps"])),
        },
        "levels": {},
    }

    for level in ["하", "중", "상"]:
        items = by_level.get(level, [])
        point_counter: Counter[str] = Counter()
        trap_counter: Counter[str] = Counter()
        form_counter: Counter[str] = Counter()
        pair_counter: Counter[str] = Counter()
        audit_kind_counter: Counter[str] = Counter()
        correct_core_examples: list[str] = []
        wrong_trap_examples: list[str] = []

        for row in items:
            points = split_multi(row.get("primary_points"))
            traps = split_multi(row.get("trap_patterns"))
            form_counter[str(row.get("form_type") or "미상")] += 1
            audit_kind_counter[str(row.get("audit_kind") or "미상")] += 1
            point_counter.update(points)
            trap_counter.update(traps)
            for point in points[:3]:
                for trap in traps[:3]:
                    pair_counter[f"{point} × {trap}"] += 1
            if len(correct_core_examples) < 8 and row.get("correct_core"):
                correct_core_examples.append(f"{row.get('number')}: {row.get('correct_core')}")
            if len(wrong_trap_examples) < 8 and row.get("wrong_choice_traps"):
                wrong_trap_examples.append(f"{row.get('number')}: {row.get('wrong_choice_traps')}")

        policy["levels"][level] = {
            "count": len(items),
            "forms": dict(form_counter.most_common()),
            "audit_kinds": dict(audit_kind_counter.most_common()),
            "top_points": top(point_counter),
            "top_traps": top(trap_counter),
            "top_point_trap_pairs": top(pair_counter),
            "correct_core_examples": correct_core_examples,
            "wrong_trap_examples": wrong_trap_examples,
        }

    OUT_JSON.write_text(json.dumps(policy, ensure_ascii=False, indent=2), encoding="utf-8")

    lines: list[str] = [
        "# 어법 생성 정책: 1000제 전수 감사 기반",
        "",
        f"- 표본: {summary['question_count']}문항",
        f"- 형식: {', '.join(f'{k} {v}' for k, v in summary['forms'].items())}",
        f"- 난이도: {', '.join(f'{k} {v}' for k, v in summary['difficulties'].items())}",
        "",
        "## 전체 상위 포인트",
        "",
    ]
    for item in policy["global"]["top_points"][:10]:
        lines.append(f"- {item['name']}: {item['count']}")
    lines.extend(["", "## 전체 상위 함정", ""])
    for item in policy["global"]["top_traps"][:10]:
        lines.append(f"- {item['name']}: {item['count']}")

    for level in ["하", "중", "상"]:
        data = policy["levels"][level]
        lines.extend([
            "",
            f"## 난이도 {level}",
            "",
            f"- 문항 수: {data['count']}",
            f"- 형식 분포: {', '.join(f'{k} {v}' for k, v in data['forms'].items())}",
            "",
            "### 생성 우선 포인트",
            "",
        ])
        for item in data["top_points"][:8]:
            lines.append(f"- {item['name']}: {item['count']}")
        lines.extend(["", "### 우선 함정", ""])
        for item in data["top_traps"][:8]:
            lines.append(f"- {item['name']}: {item['count']}")
        lines.extend(["", "### 포인트 x 함정 결합", ""])
        for item in data["top_point_trap_pairs"][:8]:
            lines.append(f"- {item['name']}: {item['count']}")
        lines.extend(["", "### 정답 근거 샘플", ""])
        for example in data["correct_core_examples"][:5]:
            lines.append(f"- {example}")
        lines.extend(["", "### 오답 함정 샘플", ""])
        for example in data["wrong_trap_examples"][:5]:
            lines.append(f"- {example}")

    OUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote {OUT_MD.relative_to(ROOT)}")
    print(f"Wrote {OUT_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
