# QBANK 운영 런북

> **새 세션은 이 순서로 시작한다**: [PROJECT.md](PROJECT.md)(헌장) → [JOURNAL.md](JOURNAL.md) 마지막 30줄 →
> `node qbank/harness/ledger.mjs` → 이 문서의 §3(다음 배치 발사).
>
> 모든 명령은 리포 루트 `d:\Desktop\2026project\nara` 에서 실행한다. tsx 는 `./node_modules/.bin/tsx` (npx 금지).

---

## 1. 상태 확인 (언제나 여기부터)

```bash
node qbank/harness/ledger.mjs                 # 전체 현황 + STATE.md 갱신
node qbank/harness/ledger.mjs --year 2027     # 연도별
node qbank/harness/ledger.mjs --next 20       # 다음 배치 후보 20건
node qbank/harness/ledger.mjs --json          # 기계 판독용
node qbank/harness/ledger.mjs --shard 0/4     # 다중 세션 병렬 시 내 샤드만
```

**상태의 진실원은 파일시스템이다**(불변조건 I5). 레저는 `qbank/out/` 을 스캔해 매번 재구성한다 —
워크플로 캐시나 대화 기억을 믿지 않는다. 세션이 몇 번 죽든 이 명령 하나면 정확한 현황이 나온다.

### 유닛 상태 판정 규칙
| 상태 | 조건 |
|---|---|
| `PENDING` | `.md` 없음 |
| `AUTHORED` | `.md` 있고 `.gate.json` 없음(또는 `.md` 가 더 최신 = 스테일) |
| `GATE_FAILED` | `.gate.json` 의 `blocking` 또는 `qualityBlocking` 이 비지 않음 |
| `GATED` | 게이트 통과, `.review.json` 없음(또는 스테일) |
| `REVIEW_ISSUES` | 미해결 critical/major 존재 |
| `REVIEWED` | 검수 통과, 확정 전 |
| `FINAL` | `.final.jsonl` 존재 |
| `PASSAGE_BLOCKED` | `_passage.json` 의 `integrity.ok === false` |

---

## 2. 계획 재생성 (규칙이 바뀌었을 때만)

```bash
node qbank/harness/passage-screen.mjs --write   # 지문 무결성 1차 스크리닝(결정론)
node qbank/harness/plan.mjs --write             # 유닛 계획 (스크리닝 결과를 자동 반영)
node qbank/harness/corpus-stats.mjs             # 코퍼스 실측(참고용)
```

⚠ `plan.mjs --write` 는 `unit-plan.json` 을 덮어쓴다. **이미 만든 산출물은 지우지 않는다** —
레저가 파일시스템을 다시 스캔하므로 완료분은 그대로 `FINAL` 로 남는다.

---

## 3. 저작 배치 발사 (본 작업)

### 3-1. 배치 만들기
```bash
# 한 지문의 전 유형 (파일럿·검증용)
node qbank/harness/batch.mjs --passage 2027_06_5095396-q23 --limit 30 --out qbank/work/batch-XXX.json

# 연도 단위
node qbank/harness/batch.mjs --year 2027 --limit 200 --out qbank/work/batch-XXX.json

# 다중 세션 병렬 (4개 세션이면 각자 0/4, 1/4, 2/4, 3/4)
node qbank/harness/batch.mjs --shard 0/4 --limit 300 --out qbank/work/batch-XXX.json

# 특정 유형만
node qbank/harness/batch.mjs --type BLANK_INFERENCE --limit 100 --out qbank/work/batch-XXX.json
```
- 선정은 **결정론적**이다(최신 연도 → 지문 id → 유형 순). 같은 인자면 같은 배치가 나온다.
- 이미 `FINAL`·`QUARANTINE`·`PASSAGE_BLOCKED` 인 유닛은 자동으로 빠진다.
- 이미 `GATED` 이상인 유닛은 `status` 를 달고 나가며, 워크플로가 **저작을 건너뛰고 검수로 직행**한다.

### 3-2. 발사
`Workflow` 도구로 `qbank/harness/wf-authoring.js` 를 실행하고, `args` 에 배치 JSON 의 내용을 넣는다.

```
Workflow({
  scriptPath: "d:\\Desktop\\2026project\\nara\\qbank\\harness\\wf-authoring.js",
  args: <batch-XXX.json 의 내용>
})
```

**배치 크기 권장**: 100~150 유닛. 유닛당 에이전트 ≈ 2.3기 → 230~350기.
워크플로 생애 상한이 1000기이므로 400 유닛을 넘기지 마라.

### 3-3. 파이프라인 (유닛당 자동)
```
저작(자가 게이트 루프, 최대 6회) → 적대검수 5렌즈 → 수리(critical/major 있을 때만)
```
저작 에이전트가 **스스로 게이트를 돌린다**(0원이라 무한 반복 가능). 형식 결함은 검수에 도달하지 않는다.

### 3-4. 확정
```bash
./node_modules/.bin/tsx qbank/harness/finalize.ts --passage <id>       # 한 지문 전 유형 + 충돌 분석
./node_modules/.bin/tsx qbank/harness/finalize.ts --all                # 전량
./node_modules/.bin/tsx qbank/harness/finalize.ts --passage <id> --force   # 검수 미완 강제(파일럿 전용)
```
확정 시 게이트를 **다시 돌린다**(수리 후 스테일 방지). 산출: `<TYPE>.final.jsonl` + `_collisions.json`.

---

## 4. 지문 무결성 감사 (P0 — 별도 트랙)

재구성 지문 2,630건이 대상. 저작과 **병행 가능**하다(같은 지문을 동시에 건드리지만 파일이 다르다).

```bash
node qbank/harness/audit-batch.mjs --limit 120 --size 10 --out qbank/work/audit-XXX.json
node qbank/harness/audit-batch.mjs --limit 120 --size 10 --kind grammar_error   # 유형 지정
```
→ `Workflow({ scriptPath: ".../wf-passage-audit.js", args: <audit-XXX.json 내용> })`

우선순위는 스크리닝이 정해 둔다: **단어수준 복원(어법·어휘) 최우선** — 기계가 절대 못 잡는 것들이다.
감사관 1차 판정 후 **제2 감사관이 반증**한다(기본값 `refuted: true` — 오탐으로 멀쩡한 기출을 버리지 않기 위해).

이미 `_passage.json` 이 있는 지문은 자동으로 빠진다.

---

## 5. 검증 도구

```bash
# 0원 게이트 자체 검증 (음성테스트 — 결함을 주입해 검출되는지)
./node_modules/.bin/tsx qbank/harness/_selftest-gate.ts        # 36/36 이어야 함

# 26유형 전수 스모크 (프롬프트 조립 + 게이트 예외 없음)
./node_modules/.bin/tsx qbank/harness/_smoke-all-lanes.ts      # 하드실패 0 이어야 함

# 유형별 골격 프로브 전수 (정찰이 만든 것)
for f in qbank/work/_probe-*.ts; do ./node_modules/.bin/tsx "$f"; done

# 개별 유닛 게이트
./node_modules/.bin/tsx qbank/harness/gate.ts --passage <id> --type <TYPE>
./node_modules/.bin/tsx qbank/harness/gate.ts --all            # out/ 아래 전량 재검증

# 지문 원문 (손으로 옮기지 마라 — 한 글자만 달라도 재구성 게이트가 반려한다)
node qbank/harness/passage.mjs <passageId> --meta

# 프로덕션 프롬프트 실물 (A/B·비교용)
./node_modules/.bin/tsx qbank/harness/prod-prompt.ts --type <TYPE> --passage <id> --no-passage
```

---

## 6. 워크플로가 죽었을 때

### 세션 한도 (`You've hit your session limit · resets ...`)
**인프라 중단이지 코드 결함이 아니다.** 같은 스크립트로 재개한다:
```
Workflow({ scriptPath: "<위 결과에 찍힌 경로>", resumeFromRunId: "<Run ID>" })
```
완료된 에이전트는 캐시에서 즉시 복원되고 실패분만 재실행된다.

**재개를 멈춰야 할 때**: 재개 결과의 `subagent_tokens`·`tool_uses` 가 **0** 이면 에이전트가 아무것도
못 하고 즉사한 것이다. 다시 재개해도 같다 — 인프라 회복을 기다리거나 감독이 직접 마무리한다.

**재개는 부분 성공을 지우지 않는다.** 1차 런에서 성공한 산출물은 이미 디스크에 있다.
미완 목록은 "2차 실패 목록"이 아니라 **양 런 모두 실패한 교집합**이다.

### 워크플로 결과가 비었을 때
`<transcriptDir>/journal.jsonl` 을 직접 읽어라. `{"type":"result",...}` 한 줄이 에이전트 하나의 반환값이다.
**추측하지 말고 저널을 먼저 읽어라.**

---

## 7. 산출물 지도

```
qbank/
├── PROJECT.md   헌장·불변조건 I1~I8·파이프라인·티어          [커밋]
├── JOURNAL.md   작업 일지 Q### (append-only)                 [커밋]
├── STATE.md     현황 (레저가 자동 갱신)                       [커밋]
├── RUNBOOK.md   이 문서                                      [커밋]
├── spec/        [커밋]
│   ├── quality-constitution.md   품질 헌법 (전 에이전트 필독)
│   ├── craft/00-AUTHORING.md     공통 저작 지침
│   ├── craft/TITLE.md            감독 저작 경험 기반 유형 공예
│   ├── types/<TYPE>.md × 26      형식 계약 + §8 다각화 축
│   ├── recon/                    정찰 산출(계약·게이트·저장·렌더·교훈)
│   ├── unit-plan.json            전 유닛 목록 (26 MB)
│   ├── passage-screen.json       지문 스크리닝 결과
│   └── corpus-stats.json         코퍼스 실측
├── harness/     [커밋] — 전부 결정론, LLM 미사용
│   ├── qgen-core.ts       0원 게이트 본체 (26유형 단일 인터페이스)
│   ├── canon.ts           정본 2종(빈칸·어법) 라우트 분기 이식
│   ├── gate.ts            게이트 CLI
│   ├── finalize.ts        확정 + 메타데이터 부여
│   ├── collision.ts       문항 병치 충돌 판정
│   ├── plan.mjs           유닛 계획
│   ├── batch.mjs          저작 배치 선정
│   ├── audit-batch.mjs    감사 배치 선정
│   ├── ledger.mjs         상태 재구성
│   ├── passage.mjs        지문 조회
│   ├── passage-screen.mjs 지문 스크리닝
│   ├── prod-prompt.ts     프로덕션 프롬프트 덤프
│   ├── wf-authoring.js    저작 파이프라인 워크플로
│   ├── wf-passage-audit.js 지문 감사 워크플로
│   ├── wf-ab.js           A/B 실측 워크플로
│   └── _selftest-*.ts     음성테스트
├── out/         [gitignore] <year>/<passageId>/<TYPE>.{md,gate.json,review.json,final.jsonl}
├── work/        [gitignore] 배치 JSON · 프로브 · A/B 산출
└── logs/        [gitignore]
```

---

## 8. 절대 하지 말 것

1. **`qbank/out/` 을 git 에 넣지 마라** — 60만 문항 ≈ 3.15 GB.
2. **지문을 손으로 옮겨 적지 마라** — `passage.mjs` 를 써라. 한 글자 차이로 재구성 게이트가 반려한다.
3. **마크다운 장식을 쓰지 마라** — 정본 파서는 `**정답:**` 를 흡수하지 않아 정답이 통째로 사라지고
   게이트가 「정답 누락」이라는 **거짓 원인**을 지목한다.
4. **수를 채우려 품질을 낮추지 마라** — 못 만들면 만든 만큼 내고 사유를 남긴다(불변조건 I8).
5. **`.gate.json` 을 신뢰하지 마라** — 수리 후 스테일일 수 있다. `finalize` 가 항상 재실행한다.
6. **검수자와 저작자를 같은 에이전트로 하지 마라**(불변조건 I4).
7. **JOURNAL.md 의 과거 항목을 고치지 마라** — 뒤집히면 새 항목 + 옛 항목에 `[폐기→Q###]`.

---

## 9. Codex(GPT) 제2 실행 풀

Claude 세션 한도가 이 프로젝트의 실측 병목이다(3회 도달). Codex 는 **별도 쿼터**라 그 병목을 우회하고,
**교차 모델 검수**(다른 모델의 블라인드 풀이)라는 품질 이득도 준다.

### 9-1. 도구 확인 (함대 띄우기 전에 반드시)
```bash
qbank/harness/codex.sh --which     # 경로 + 버전 출력
```
- ⚠ **경로에 버전이 박혀 있어 확장 업데이트마다 깨진다.** shim 이 글롭으로 최신을 매번 다시 찾는다.
- ⚠ 구버전은 `~/.codex/config.toml` 의 `model_reasoning_effort = "ultra"` 를 몰라 **config 파싱 단계에서 죽는다.**
- ⚠ 플래그는 **하위 명령 뒤**에 온다 — `codex exec --skip-git-repo-check` (앞에 두면 `unexpected argument`).
- ⚠ `< /dev/null` 없으면 stdin 을 영원히 기다린다. shim 이 붙여 준다.

### 9-2. 실행
```bash
node qbank/harness/codex-pool.mjs --batch qbank/work/batch-XXX.json --role author  --concurrency 3
node qbank/harness/codex-pool.mjs --batch qbank/work/batch-XXX.json --role review  --concurrency 4
node qbank/harness/codex-pool.mjs --units "<pid>:<TYPE>,..."        --role review  --any-status
node qbank/harness/codex-pool.mjs --batch <file> --role author --dry-run   # 프롬프트만 확인
```
- 저작·수리는 Claude 와 **같은 경로**(`<TYPE>.md`)에 쓴다.
- **검수만 `.review.codex.json` 으로 분리**한다 — 동시 실행 충돌 방지 + 두 검수자 직접 대조.
- 로그: `qbank/logs/codex/<passageId>__<subType>__<role>.log`. 런 시작 시 **바이너리 버전이 각인**된다
  (품질이 갑자기 달라지면 "지침 탓인지 버전 탓인지"를 가려야 한다).
- Bash 도구는 기본 2분 타임아웃이다 → **반드시 `run_in_background`** 로 돌려라.

### 9-3. 권장 배치 — 교차 저작·교차 검수
```
샤드 A: Claude 저작 → Codex  검수
샤드 B: Codex  저작 → Claude 검수
```
모든 유닛이 **다른 모델의 블라인드 풀이**를 통과하게 된다. 같은 모델 자기검수는 사고 경로를 되밟아
결함을 못 본다. 한쪽 풀이 세션 한도로 죽어도 다른 쪽이 계속 돈다.
