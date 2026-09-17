# 현재 상태 (갱신: 2026-07-28 · 인수인계 시점)

> **운영자 전환**: Claude(Opus 5) → Codex(gpt-5.6-sol) 단독.
> 이어받는 방법은 **`qbank/HANDOFF-CODEX.md`** 하나에 정리돼 있다. 그것부터 읽어라.

## 숫자

| 항목 | 값 |
|---|---|
| 완료 유닛 | 73 (PASS 65 · blocking 7 · quality 1) |
| 완료 문항 | 479 |
| 전체 계획 | 109,791유닛 / 591,154문항 (잔여 109,703) |
| 지문 감사 | 큐 2,132 중 48 완료 · **2,084 잔여** (사전 감사분 335건 별도) |
| 격리 지문 | 69 (기계 스크리닝 block) |
| 저작 착수 지문 | 2027 q20 · q22 · q23 |

## 확정 결함 (수리 대기)

교차검수 18유닛에서 **반증을 통과한** critical 6건. 각 1건씩:
`BLANK_INFERENCE` · `MAIN_IDEA` · `SENTENCE_ORDER` · `TITLE` · `GRAMMAR_CHOICE_COMBO` · `SUMMARY_COMPLETE`
상세는 각 유닛의 `.review.json`.

⚠ `.review.json` 의 `grade` 는 **미검증 지적 기반**이라 실제보다 나쁘게 나와 있다
(보고 F 5개 → 확정 기준 0개). 등급은 반드시 반증 통과분으로 재산정하라.

## 진행 중이던 프로세스

```
codex-pool.mjs --batch qbank/work/prod-2027-002.json --role author --concurrency 15
```
이어받을 때 `node qbank/harness/slots.mjs` 로 살아 있는지 먼저 확인하라.

## 다음 할 일

1. blocking 7건 처리 (대부분 ITEM_COUNT 미달)
2. 확정 critical 6건 수리 → 재검수로 등급 개선 실측
3. 지문 감사 2,084건 (저작보다 우선 — I3)
4. 감사 통과 지문에 저작 확산, 최신 연도부터
