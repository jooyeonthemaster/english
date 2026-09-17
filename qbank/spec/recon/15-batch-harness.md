# 장기(수주) 중단내성 배치 인프라 — 재사용 자산 확정본

> 정찰 산출. 모든 주장에 `file:line` 인용. 확인 못 한 것은 **[미상]**.
> 전제: [`00-contract.md`](00-contract.md) 의 확정 사항은 재조사하지 않았다.
> 측정치는 이 머신(Windows 11 / NTFS / Node v24.7.0 / tsx 4.21.0)에서 **실제로 실행해** 얻었다.

---

## 0. 한 줄 결론

> **백지에서 쓸 것이 없다. 필요한 4대 축(워커풀·재개 캐시·JSONL 관례·체크포인트)이 이미 이 리포에 4벌씩 있고,
> qbank 자체 하네스(`qbank/harness/*`)가 그중 가장 40만 규모에 맞는 축(파일시스템=진실원)을 이미 채택했다.**
> 남은 위험은 설계가 아니라 **I/O 상수**다 — 빈 트리에서 레저 1회 스캔이 **42.5초** 걸린다(§5).

---

## 1. 재사용 가능한 함수·패턴 목록

### 1-1. 워커풀 (4벌, 전부 동일 알고리즘)

| 위치 | 시그니처 | 특징 |
|---|---|---|
| `scripts/_ai-edit-mass.ts:404-413` | `async function pool<T>(items: T[], conc: number, fn: (t: T) => Promise<unknown>): Promise<void>` | 최소 구현. 반환값 버림 |
| `scripts/audit-suneung-wanseong-sonnet.ts:971-981` | `async function runPool<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void>` | 동시성이 **모듈 전역 `CONCURRENCY`**(`:140`)에 하드결선 |
| `scripts/audit-grammar-generation-sample.ts:617-633` | `async function runWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]>` | **입력 순서대로 결과 배열** 반환 (`results[index] = await worker(...)`) |
| `scripts/test-sonnet46-quality.ts:570-589` | 〃 (`Promise<R[]>`) | `results.filter(r => r !== undefined)` 로 구멍 제거 |
| `scripts/test-compact-prompt-regression.ts:183-198` | 〃 | 위와 동일 |

공통 골격(4벌 전부 동일):
```ts
let i = 0;
const workers = Array.from({ length: Math.min(conc, items.length) }, async () => {
  while (i < items.length) { const idx = i++; await fn(items[idx]); }
});
await Promise.all(workers);
```

> ### ⚠ 함정 — **worker 가 throw 하면 안 된다** (계약이 코드에 안 적혀 있다)
> `Promise.all` 은 첫 reject 즉시 깨지지만 **나머지 워커는 계속 돈다**. 그 사이 `main()` 이 진행돼
> `outStream.end()`(`_ai-edit-mass.ts:568`)를 호출하면 아직 실행 중인 워커의 `emit()` 이 닫힌 스트림에 쓴다.
> 두 선례 모두 이 위험을 **호출부의 try/catch 로만** 막고 있다:
> `_ai-edit-mass.ts:333-372`(runJob 전체가 try/catch), `audit-suneung-wanseong-sonnet.ts:1077-1133`(worker 본문 전체 try/catch → `failures.push`).
> → **40만 배치의 워커는 절대 throw 하지 않는 형태로 써라.** 실패는 값으로 반환한다.

### 1-2. CLI 인자 파서 — **리포에 방언이 4개 있다 (섞으면 조용히 undefined)**

| 방언 | 예 | 구현 |
|---|---|---|
| **등호형** `--out=x` | `scripts/` 대부분 | `_ai-edit-mass.ts:34-37` — `process.argv.find(a => a.startsWith(\`--${name}=\`))` → `m.slice(name.length + 3)` |
| **등호형(Map)** | audit-suneung | `audit-suneung-wanseong-sonnet.ts:132-137` — `new Map(process.argv.slice(2).map(raw => { const [k,...v] = raw.replace(/^--/,"").split("="); return [k, v.length ? v.join("=") : "true"]; }))` |
| **등호형(prefix)** | codex 하네스 | `codex-native-webtoon-harness.ts:1558-1573` — `valueOf(name)` / `requiredValue(name)` / `positiveInt(value)` |
| **★ 공백형** `--passage X` | **qbank/harness 전부** | `qbank/harness/gate.ts:21-25`, `finalize.ts:24-28`, `ledger.mjs:20-24`, `batch.mjs:20-24`, `audit-batch.mjs:24-27` — `argv.indexOf("--"+n)` → `argv[i+1]` |
| **불린형** | 백필 | `_backfill-report-chosen-choice.ts:43` — `process.argv.includes("--apply")` |

> **qbank 신규 스크립트는 공백형으로 통일하라.** `gate.ts --passage X --type Y` 와 `--out=x` 를 한 줄에 섞으면
> 등호형 파서가 `undefined` 를 반환하고 **에러 없이 기본값으로 흘러간다**.

### 1-3. 원자적 쓰기 (2벌)

```ts
// audit-suneung-wanseong-sonnet.ts:298-302  — 가볍다(fsync 없음)
async function atomicJson(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, file);
}
```
```ts
// codex-native-webtoon-harness.ts:1450-1458 — fsync 포함(전원 손실 내성)
async function atomicWrite(filePath: string, content: string) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, content, "utf8");
  const handle = await open(temporary, "r+");
  await handle.sync();          // ← 이 한 줄이 차이
  await handle.close();
  await rename(temporary, filePath);
}
```

### 1-4. 해시 유틸 (재개 캐시의 심장)

```ts
// audit-suneung-wanseong-sonnet.ts:304-306
function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
```
- 입력 해시는 **필드를 명시적으로 골라** 만든다 — `analysisInputHash()` `:308-317`, `linkInputHash()` `:319-336`.
  객체 전체를 넣지 않는 이유: 무관한 필드(retrievalScore 등)가 바뀌면 캐시가 통째로 무효화되기 때문.
- 파일 해시: `sha256(await readFile(path))` — `codex-native-webtoon-harness.ts:1575-1577`, `audit-suneung…:1231-1233`.

### 1-5. 배타 락 + 리스 (다중 세션 병렬의 유일한 실동작 선례)

| 함수 | 위치 | 요지 |
|---|---|---|
| `acquireStateLock()` | `codex-native-webtoon-harness.ts:1355-1386` | `open(lockPath,"wx")` → `{pid, token, acquiredAt}` 기록 + `handle.sync()`. EEXIST 면 소유자 pid 생존 확인 → 죽었으면 `rename` 격리 후 재시도. 30초 타임아웃 |
| `releaseStateLock()` | `:1388-1396` | **해제 전 소유권 재확인**(token+pid). 남의 락을 지우지 않는다 |
| `isProcessAlive(pid)` | `:1409-1416` | `process.kill(pid, 0)` → `ESRCH` 만 사망 판정 |
| `withLockedState(mutate)` | `:1169-1185` | 락 → 로드 → `assertSourceFrozen` → mutate → `revision += 1` → 저장 → 락 해제 |
| `expireLeasesInState(state, nowMs)` | `:1460-1490` | 30분(`DEFAULT_LEASE_MS`, `:217`) 만료된 `GEN_QUEUED` 를 회수하고 `LEASE_EXPIRED` 를 실패 이력에 남긴다 |

> qbank `PROJECT.md:158-161` 이 약속한 샤드 클레임(`qbank/work/shards/<id>.claim.json`, 90분 TTL)은
> **아직 구현이 없다** — `qbank/work/shards/` 디렉토리 부재, `qbank/harness/` 에 `claim` 문자열 0건(grep).
> 구현이 필요하면 위 5개를 그대로 이식하면 된다. (현재 병렬은 `--shard S/T` 결정론 분할로만 한다: `ledger.mjs:110-117`, `batch.mjs:41-48`)

### 1-6. qbank 하네스 (★ 최우선 재사용 대상 — 이미 이 프로젝트용으로 쓰였다)

| 자산 | 위치 | 시그니처/역할 |
|---|---|---|
| 상태 재구성 | `qbank/harness/ledger.mjs:52-91` | `unitStatus(year, passageId, subType) → {status, ...}` · `STATUS` 9종 `:28-38` |
| 배치 선정 | `qbank/harness/batch.mjs:51-89` | 미완 유닛 → `{label, units:[{passageId,year,subType,variants,wordCount,tier,status}]}` |
| 감사 배치 + 슬라이스 | `qbank/harness/audit-batch.mjs:29-46, 57-90` | `--slice N --from <file>` 로 **고정된 배치에서 N번째만** 꺼낸다 |
| 게이트 CLI | `qbank/harness/gate.ts:39-78, 111-142` | 종료코드 **0=통과 / 1=차단 / 2=입력오류**(`:9,130,140,142`) |
| 확정 | `qbank/harness/finalize.ts:172-301` | `finalizeUnit(passageId, subType) → {ok, reason?, questions}` |
| 컨테이너 분해 | `qbank/harness/qgen-core.ts:59-109` | `splitItems(source) → {items: ParsedItem[], errors: string[]}` · `ITEM_HEADER = /<!--\s*ITEM\s+(\d+)\s*\n([\s\S]*?)-->/g` (`:57`) |
| 지문 조회 | `qbank/harness/passage.mjs:1-47` | 원문 축자 확보 유일 경로 (실측 0.386s) |
| 워크플로 args 방어 | `qbank/harness/wf-authoring.js:15-17` | `const A = typeof args === 'string' ? JSON.parse(args) : args \|\| {}` — Q034 즉사 재발 방지 |

---

## 2. tsx 실행 명령 (실측 — 추측 아님)

### 2-1. 정본

| 셸 | 명령 | 실측 |
|---|---|---|
| **PowerShell** | `& .\node_modules\.bin\tsx <script>` | ✅ 동작 |
| **PowerShell** | `& node node_modules\tsx\dist\cli.mjs <script>` | ✅ 동작 |
| **Bash(Git Bash)** | `./node_modules/.bin/tsx <script>` | ✅ 동작 (콜드 4.5s) |
| **Bash** | `node node_modules/tsx/dist/cli.mjs <script>` | ✅ 동작 |

`.env` 필요 시:
```
./node_modules/.bin/tsx --env-file-if-exists=.env --env-file-if-exists=.env.local <script>
```
→ 실측으로 `process.env.DATABASE_URL` 이 `string` 이 됨을 확인. 미지정 시 `undefined`.
(qbank 하네스는 I1 상 API 호출이 0이므로 **env 플래그가 필요 없다.**)

### 2-2. ★ npx 함정 — **PowerShell 에서 `npx tsx` 는 실패한다**

```
PS D:\Desktop\2026project\nara> npx tsx --version
npm error could not determine executable to run
exit=1        (7.2초 낭비)
```
- 3회 재현. `npx --no tsx` 도 동일 실패.
- **같은 명령이 Git Bash 에서는 성공한다**(exit 0). → 셸에 따라 결과가 갈린다.
- 그래서 `qbank/RUNBOOK.md:6` 이 **"tsx 는 `./node_modules/.bin/tsx` (npx 금지)"** 로 못박았고,
  `wf-authoring.js:21`·`wf-ab.js:14` 가 `const TSX = './node_modules/.bin/tsx'` 를 상수로 박아 에이전트에게 배포한다.
- 반면 `docs/` 와 `experiments/` 의 옛 문서 30여 곳은 아직 `npx tsx` 로 적혀 있다(`docs/md-qgen-recon-synthesis.md:1038-1044` 등).
  **문서가 아니라 RUNBOOK 을 따르라.**

설치 상태(확인): `tsx@4.21.0` devDependency(`package.json:119`), `node_modules/.bin/{tsx,tsx.cmd,tsx.ps1}` + `node_modules/tsx/dist/cli.mjs` 존재. Node `24.x` 고정(`package.json:5-7`), 실행 런타임 v24.7.0.

### 2-3. `NODE_OPTIONS=""` 관행

`tests/unit/*.test.mjs` **40개 이상**이 tsx 를 자식 프로세스로 띄울 때 `env: { ...process.env, NODE_OPTIONS: "" }` 를 강제한다
(예: `tests/unit/w2d-irrelevant-index-edge.test.mjs:72`, `tests/unit/wave1-schema-order.test.mjs:162`).
그 테스트들은 `execSync(\`node node_modules/tsx/dist/cli.mjs "${harnessPath}"\`, { cwd: repoRoot, env: { ...process.env, NODE_OPTIONS: "" } })` 형태다.
`experiments/grammar-quality-20260714/harness.ts:14` 도 실행줄에 `NODE_OPTIONS="" npx tsx …` 로 적혀 있다.
**이유는 코드에 주석이 없다 — [미상].** 관행만 승계하라: 배치가 tsx 를 spawn 할 때는 `NODE_OPTIONS` 를 비운다.
(현재 셸에서는 `$env:NODE_OPTIONS` 가 이미 빈 값이었다.)

### 2-4. `.mjs` 는 tsx 가 필요 없다

`qbank/harness/{ledger,batch,plan,audit-batch,passage,passage-screen,corpus-stats}.mjs` 는 전부 순수 ESM →
**`node qbank/harness/ledger.mjs`** 로 돌린다(`RUNBOOK.md:13-18`). tsx 기동비(4.5s)를 아끼는 실질적 이유가 있다.

### 2-5. `@/` 별칭 금지

`tsconfig.json:34` 의 `exclude` 에 `"scripts"`, `"qbank"` 가 들어 있다(`paths: {"@/*": ["./src/*"]}` 는 `:22-24`) → **`@/` 별칭이 해석되지 않는다.**
`scripts/`·`qbank/harness/` 안에서는 상대경로 import 만 쓴다(예: `finalize.ts:14-15`, `_ai-edit-mass.ts:18-27`).

---

## 3. 대량 JSONL 관리 관례

### 3-1. append 방식 — **2종이 있고 내구성이 다르다**

| 방식 | 위치 | 중단내성 |
|---|---|---|
| `fs.createWriteStream(path, { flags: "a" })` + `.write(JSON.stringify(rec) + "\n")` | `_ai-edit-mass.ts:46-49` | ⚠ **버퍼링된다.** 프로세스가 강제 종료되면 미flush 분이 사라진다. `outStream.end()` 는 정상 종료(`:568`)와 FATAL 핸들러(`:573-576`)에만 있다 |
| `fs.appendFileSync(outPath, \`${JSON.stringify(row)}\n\`, "utf8")` | `audit-question-quality-loop.ts:922, 960` · `audit-grammar-quality-loop.ts:859, 887` · `_grammar-plan-ab.ts:138` | ✅ 행 단위 동기 flush. **수주 배치는 이쪽만 쓴다** |

> 4대 축 중 유일하게 논쟁의 여지가 없는 항목이다: **한 행 = 한 완결 사실 = 한 번의 동기 append.**

### 3-2. 읽기 (재개·집계 공통)

```ts
// audit-question-quality-loop.ts:379-389
function readJsonlRows(inputPath: string): AuditRow[] {
  const content = fs.readFileSync(inputPath, "utf8");
  const rows: AuditRow[] = [];
  for (const line of content.split(/\r?\n/)) {     // ★ CRLF 대응 — Windows 필수
    const trimmed = line.trim();
    if (!trimmed) continue;
    rows.push(JSON.parse(trimmed) as unknown as AuditRow);
  }
  return rows;
}
```
- `split(/\r?\n/)` + 빈 줄 skip 이 리포 표준이다. `ledger.mjs:63` 도 `.split("\n").filter(l => l.trim())`.
- ⚠ **전량 메모리 적재**다. 40만 행에는 스트리밍(`readline`)이 필요하다 — 리포에 선례 없음 **[미상/미구현]**.

### 3-3. 파일 분할 단위 — 선례 3종

| 단위 | 위치 | 결과 파일 수 |
|---|---|---|
| **★ 유닛(지문×유형) 1파일** | `qbank/harness/finalize.ts:295-299` → `<TYPE>.final.jsonl`, 문항당 1행 | **109,861 파일** (계획 유닛 수) |
| 실행(run) 1파일 | `audit-question-quality-loop.ts:722-727` → `artifacts/ai-audits/question-quality-loop-${Date.now()}.jsonl` | 실행당 1 |
| 페이즈 1파일 | `_ai-edit-mass.ts:41` → `results/${PHASE}.jsonl` | 페이즈당 1 |

**qbank 는 이미 유닛 단위를 채택했다.** 그 결과 40만 문항이 아니라 **10만 개의 작은 파일**로 흩어진다 —
이것이 `ledger.mjs` 가 중앙 상태파일 없이 재개할 수 있는 이유이자, §5 의 스캔 비용의 원인이다. 트레이드오프를 인지하고 유지하라.

실측: `qbank/out/2027/2027_06_5095396-q23/TITLE.final.jsonl` = 6행 / **31,621 bytes** (행당 ≈ 5.3KB).
JOURNAL 기록과 일치 — "6문항 30.9KB → 60만 문항 ≈ **3.15 GB**"(`qbank/JOURNAL.md:341`).

### 3-4. 필드 규약

**qbank 확정 행(`FinalQuestion`, `finalize.ts:154-170`)** — 이것이 정본이다:
```
qid · passage{} · type{} · difficulty · tier · point · craft · settings ·
markdown · structuredData · hidden{asset,surface,spans,resolved} · quotes ·
gate{warnings,corrections} · review · provenance{authoredAt,gatedAt,finalizedAt,harnessVersion,reviewed,forced}
```
- `harnessVersion = "qbank-harness/1.0"` (`finalize.ts:21`) — **행마다 하네스 버전이 박힌다.** 재처리 판정의 축.
- `hidden.resolved` 는 **추출 실패를 빈 배열로 숨기지 않기 위한 필드**(`finalize.ts:62-66, 265-270`). 가짜 초록 방지.
- 감사용 행(`audit-question-quality-loop.ts:895-920`)은 다른 규약이다: `runIndex/type/plan/difficulty/passageId/ok/generated/elapsedMs/attempts/localIssues/llmScore/…`.

공통 규칙 3개(선례 전건 일치):
1. **판정 불린을 반드시 싣는다** (`ok`) — 사후 집계가 파일만으로 가능해야 한다.
2. **`elapsedMs`/`durationMs` 를 싣는다** (`:905`, `_ai-edit-mass.ts:351`) — 수주 배치의 처리량 추정 유일 근거.
3. **큰 문자열은 자른다** — `instruction.slice(0,1200)`(`:324`), `editSummary.slice(0,500)`(`:356`), `questionText.slice(0,4000)`(`:364`), `mdRawText` 선두 8k(`00-contract.md:166`).

### 3-5. 중복 판정 키

| 키 | 위치 | 형태 |
|---|---|---|
| **★ `qid`** | `finalize.ts:237` | `` `${passageId}:${subType}:${g.index}` `` — 전역 유일. **40만 행의 정본 키** |
| 유닛 키 | `finalize.ts:51`, `gate.ts:35-36` | `` `${passageId} ${subType}` `` (공백 결합) — 계획 조회용 |
| 셀 키 | `audit-question-quality-loop.ts:491-495` | `` `${type}:${plan}:${difficulty}` `` |
| 케이스 키 | `_ai-edit-mass.ts:425, 436, 454, 463, 482, 501, 527` | `A-<TYPE>-s<i>-preset<j>` / `B-<advId>-<TYPE>` / `C-cumul-<TYPE>-step<n>` / `D-<TYPE>-<model>` |
| 산출물 지문 | `codex-native-webtoon-harness.ts:1249-1253` | `receiptLedger.byOutputSha256` — **결과 바이트 해시로 중복 제출 차단** |

> ⚠ **어떤 JSONL 라이터도 append 전에 중복을 확인하지 않는다.** `_ai-edit-mass.ts:46` 은 `flags:"a"` 라
> 재실행하면 같은 `caseId` 가 그냥 한 번 더 쌓인다. **중복 제거는 소비 측 책임**이다 —
> 읽을 때 `qid` 로 last-wins Map 을 만들어라(선례 없음, 처방).

---

## 4. 중단 후 재개 체크포인트 — 설계 선례 4종

### A. 파일시스템 = 진실원 (★ qbank 채택본)
`qbank/PROJECT.md:30`(불변조건 I5) · `ledger.mjs:1-8, 52-91`

- 중앙 상태파일이 **없다**. 유닛 상태를 파일 존재/내용으로만 판정한다(`ledger.mjs:26-27` 주석).
- 상태 사다리 9단: `PENDING → AUTHORED → GATE_FAILED/GATED → REVIEW_ISSUES → REVIEWED → FINAL` + `QUARANTINE`/`PASSAGE_BLOCKED` (`:28-38`).
- **스테일 판정에 mtime 을 쓴다** — 산출물이 판정보다 최신이면 판정을 버린다:
  ```js
  if (mdM > gtM + 1000) return { status: STATUS.AUTHORED, stale: "gate", meta };   // ledger.mjs:72-75
  if (mdM > rvM + 1000) return { status: STATUS.GATED,   stale: "review", ... };   // ledger.mjs:82-83
  ```
  **1000ms 허용오차**가 핵심이다(같은 초에 쓰인 파일을 스테일로 오판하지 않기 위함).
- 재개 = `node qbank/harness/ledger.mjs` 1회. 완료분은 자동으로 빠진다(`batch.mjs:51-56`).
- 부분 완료 승계: 이미 `GATED` 이상인 유닛은 `status` 를 달고 배치에 실려 **저작을 건너뛰고 검수로 직행**한다(`batch.mjs:85-88`).
- 그럼에도 **파일을 믿지 않는 지점이 하나 있다**: `finalize.ts:182-196` 은 `.gate.json` 이 있어도 **게이트를 다시 돌린다**(수리 후 스테일 방지). `RUNBOOK.md:210` 이 이를 규칙으로 명문화.
- 멱등 소유권(I6, `PROJECT.md:31`): 한 유닛 = 한 디렉토리 = 한 에이전트 전면 교체 → 중복 실행이 무해하다.

### B. 스테이지 캐시 + 4중 무효화 (audit-suneung-wanseong-sonnet.ts)
중간 산출을 `tmp/suneung-wanseong-sonnet-full-v2/<id>.<stage>.json` 에 남기고(`:122`), `--resume` 시 재사용한다.
**캐시를 신뢰하지 않고 4개를 전부 확인한 뒤에야 채택한다**(`:731-757`):

```ts
if (cached.model !== MODEL)                        throw new Error("analysis cache model mismatch");        // :740
if (cached.promptVersion !== ANALYSIS_PROMPT_VERSION) throw new Error("analysis cache prompt mismatch");    // :741-743
if (cached.inputHash !== currentAnalysisInputHash) throw new Error("analysis cache input mismatch");        // :744-746
validateFreshAnalysis(passage, cached.analysis, problems);                                                  // :747  ← 재검증
if (cached.review.verdict !== "pass" || cached.review.issues.length !== 0) throw …                          // :748-750
```
- 실패는 전부 `catch {}` 로 삼켜 **새로 생성**한다(`:754-756` 주석 "새 분석 생성"). 즉 캐시는 **최적화이지 정합성 장치가 아니다.**
- 3계층으로 중첩: 분석 스테이지(`:729-757`) → 링크 배치 스테이지(`:863-886`) → 지문 전체(`:1083-1108`).
  최상위 캐시 키는 하위 두 해시의 합성(`:1079-1082`).
- 저장은 항상 `atomicJson` + `{model, promptVersion, inputHash, generatedAt, …}` 헤더 동봉(`:834-842`, `:906-913`, `:1118-1127`).
- **머지는 전건 성공 후에만**: `failures.length > 0` 이면 throw(`:1135-1141`), `--only` 부분 실행은 `--no-merge` 강제(`:1066-1068`).
  → 부분 산출이 정본 파일을 오염시키지 않는다.

**이식할 것**: `{model, promptVersion, inputHash}` 3종 세트 + **읽을 때 재검증**. qbank 로 번역하면
`{harnessVersion, specVersion(types/<TYPE>.md 해시), passageSha256}` 이 되고, 재검증은 `gateUnit()` 재실행이다
(이미 `finalize.ts:182-196` 이 절반을 한다).

### C. 상태파일 + 락 + 리스 (codex-native-webtoon-harness.ts)
`out/<run>/state.json`(`:214`) + `state.lock`(`:216`) + 선택적 `state.sqlite`(`:215`).
- `schemaVersion: 2` + **`revision` 단조 증가**(`:170-171`, `:1178`) + 마이그레이션 분기(`:1110-1119`).
- 소스 동결 검증 `assertSourceFrozen(state)`(`:1176`, `:1418~`) — 입력 파일이 바뀌면 재개 거부.
- 자산 상태 11종 머신(`:36-47`)에 `RETRY_QUEUED`/`RCA_REQUIRED`/`BLOCKED_RCA` 3단 실패 등급(`:1493-1495`).
- 서브커맨드형 CLI: `argv[0]` 이 명령(`init/next/stage/status/…`, `:207-208, 226-236`).
- **40만 규모에는 과하다.** 단일 `state.json` 이 매 mutate 마다 통째로 재직렬화되므로(`saveState`, `:1164-1167`)
  자산이 커지면 선형 악화한다. 그 한계 때문에 이 하네스 자신이 sqlite 백엔드를 병행한다(`:1235-1258`).
  → qbank 는 A 안(파일시스템)을 유지하는 것이 옳다. **락/리스만 필요할 때 발췌 이식하라.**

### D. 배치 파일 고정 + 슬라이스 조회 (audit-batch.mjs)
```
node qbank/harness/audit-batch.mjs --slice 3 --from qbank/work/audit-001.json
```
`audit-batch.mjs:29-46`. 주석이 이유를 밝힌다: **"배치 파일이 고정돼 있으므로 재개해도 배정이 흔들리지 않는다"**(`:31`).
- 배치 생성 자체도 결정론적이다(`batch.mjs:9-10, 58-65`: 최신 연도 → 지문 id → 계획상 유형 순).
- 이미 완료된 대상은 생성 단계에서 배제(`audit-batch.mjs:57-63` `done()`; `batch.mjs:51-56`).
- Q035 교훈(`JOURNAL.md`): `--slice/--from` 은 **인라인 `node -e` 의 따옴표 지옥을 없애려고** 신설됐다.
  → 에이전트에게 주는 명령은 **한 줄·중첩따옴표 0** 이어야 한다.

### E. 워크플로 층 재개 (코드 밖)
`RUNBOOK.md:141-158`:
- `Workflow({ scriptPath, resumeFromRunId })` — 완료 에이전트는 캐시 복원, 실패분만 재실행.
- **중단 판정 규칙**: 재개 결과의 `subagent_tokens`·`tool_uses` 가 **0** 이면 재개를 멈추고 인프라 회복을 기다린다.
- 결과가 비면 `<transcriptDir>/journal.jsonl` 을 직접 읽는다 — `{"type":"result",...}` 한 줄 = 에이전트 하나의 반환값.
- 재개는 부분 성공을 지우지 않는다. 미완 목록은 **양 런 모두 실패한 교집합**이다.

---

## 5. 40만 행 규모의 파일 I/O 함정 (실측)

### 5-1. ★ 레저 전수 스캔이 **빈 트리에서 42.5초**

```
$ time node qbank/harness/ledger.mjs      # qbank/out 에 파일 124개뿐
real  0m42.498s      → 잔여 유닛 109,873
```

원인 분해(직접 계측):

| 항목 | 실측 |
|---|---|
| `unit-plan.json` (26,081,160 B) `JSON.parse` | **365 ms** (RSS 201 MB) |
| `existsSync` × 109,861 (유닛당 1회) | **3,408 ms** (≈31 µs/call) |
| `existsSync`(없는 파일) × 20,000 | 576 ms (29 µs) |
| **`readFileSync`(없는 파일)+throw × 20,000** | **2,580 ms (129 µs) ← existsSync 의 4.5배** |
| `statSync`(있는 파일) × 20,000 | 294 ms (15 µs) |

**진범은 `ledger.mjs:40-46` 의 `readJson()`** — 존재 확인 없이 `readFileSync` 를 던지고 `catch` 로 받는다.
이걸 유닛마다 `_passage.json`·`<TYPE>.meta.json` 2회 호출하므로 **219,722회의 예외 발생**,
계산상 ≈ 28초로 42.5초의 대부분을 차지한다.

> **처방(설계 제안, 미구현)**
> 1. `readJson()` 앞에 `existsSync` 가드 → 예외 경로 제거. 4.5배 → 1배.
> 2. `_passage.json` 은 유닛이 아니라 **지문 단위**(4,474개)다 — 유닛 루프 밖으로 빼서 26배 절약.
> 3. 유닛당 4~5회 `existsSync` 대신 **지문 디렉토리당 `readdirSync` 1회**로 파일 목록을 캐시(4,474회 vs 500,000회).
> 4. `--year`/`--shard` 를 상시 사용해 스캔 범위를 자른다(`ledger.mjs:107-117`) — 이미 구현돼 있다.
> 5. 스캔 결과를 `qbank/work/ledger-cache.json` 에 mtime 과 함께 캐시. **단 I5 를 깨지 마라** —
>    캐시는 표시용이고, 배치 선정은 반드시 실스캔이어야 한다.

### 5-2. 최종 파일 수 = **44만 ~ 55만 개**

유닛 109,861 × `{md, gate.json, review.json, final.jsonl, meta.json}` = 최대 549,305 파일 + 지문당 `_passage.json` 4,474.
`RUNBOOK.md:196` 의 산출물 지도가 그대로 이 수를 낳는다.
- 용량: **≈ 3.15 GB**(`JOURNAL.md:341`, 실측 5.3KB/행 기반).
- `.gitignore:177-180` 이 `/qbank/out/`·`/qbank/work/`·`/qbank/logs/` 를 차단한다. **유지하라**(`RUNBOOK.md:205`).
- NTFS 에서 디렉토리당 파일 수는 문제없으나(지문당 26유형 × 5 ≈ 130 파일), **총 inode 수와 백업/안티바이러스 스캔**이 문제가 된다. [미상 — 이 리포에 실측 없음]

### 5-3. ★ `artifacts/` 는 gitignore 되지 않았다 (커밋 사고 예정지)

- `audit-question-quality-loop.ts:722` 의 기본 출력 디렉토리는 `artifacts/ai-audits/` 다.
- `.gitignore` 에 `artifacts` 항목이 **없고**, 이미 `git ls-files artifacts` = **286개 파일이 추적 중**이다.
- → 40만 규모 JSONL 을 이 관례대로 흘리면 전부 커밋 대상이 된다.
  **qbank 산출은 반드시 `qbank/out/`·`qbank/work/` 안에 둬라.** (`/results` 는 이미 gitignore·vercelignore 양쪽에 있다)

### 5-4. ★ `.vercelignore` 에 `qbank` 가 없다

- `qbank/spec` 실측 **28 MB**(`unit-plan.json` 26.1 MB 포함).
- `.vercelignore` 전문 검색 결과 `qbank` 항목 0건. `experiments`·`english-exam-passages`·`/results` 등은 이미 제외돼 있다.
- 현재는 `git ls-files qbank` = **0**(전부 untracked)이라 즉시 문제는 없으나,
  **커밋하는 순간 매 배포마다 28 MB+ 가 업로드된다.** 사전 메모(`vercel-cost-rca-202607`)의 비용 축과 직결.
  → qbank 를 커밋하기 전에 `.vercelignore` 에 `qbank` 를 넣어라. (harness 는 앱 빌드가 쓰지 않는다)

### 5-5. 대용량 JSON 재파싱

- `finalize.ts:46-51` 은 실행마다 `passages.json`(5.34 MB) + `unit-plan.json`(26.1 MB)을 통째로 읽는다.
  `gate.ts:28-37` 도 동일. **유닛 1건 확정에 26MB 파싱 365ms** 가 붙는다.
- `passage.mjs:16-19` 도 매 호출 5.34MB 파싱 → 실측 전체 0.386s. 저작 에이전트가 유닛마다 1회 부르므로
  109,861 × 0.39s ≈ **12시간**의 순수 대기가 발생한다.
  → 처방: `--all`/배치 모드로 **한 프로세스에서 여러 유닛을 처리**하라(이미 `gate.ts --all`, `finalize.ts --all` 존재).
- 26MB `JSON.stringify(plan, null, 1)` 쓰기: `plan.mjs` 말미 `--write` 분기. RSS 201MB 관측 — Node 기본 힙으로 충분하나
  40만 행을 **한 배열에 모으면** 위험하다. 선례가 전부 스트리밍 append 인 이유(§3-1).

### 5-6. 그 밖의 함정

| 함정 | 근거 |
|---|---|
| `createWriteStream` 버퍼 손실 | `_ai-edit-mass.ts:46-49` — 강제 종료 시 미flush 분 유실. §3-1 |
| 워커 throw → 스트림 조기 종료 경합 | `_ai-edit-mass.ts:404-413` + `:568`. §1-1 |
| CRLF | 모든 JSONL 리더가 `split(/\r?\n/)` — Windows 필수 (`audit-question-quality-loop.ts:382`) |
| `qbank/out` 상대경로 의존 | `ledger.mjs:13`·`finalize.ts:17`·`gate.ts:15` 전부 `process.cwd()` 기준. **반드시 리포 루트에서 실행**(`RUNBOOK.md:6`) |
| 워크플로 `args` 직렬화 | Q034 — args 가 JSON 문자열로 와 17ms 즉사. 방어는 `wf-authoring.js:15-17` |
| JS 를 문자열 치환으로 수정 | Q035 — `node --check` 는 통과했으나 의미가 파괴됐다. **JS 는 Edit 도구로만 고쳐라** |

---

## 6. 40만 규모 배치 러너 — 확정 처방

> 아래는 §1~§5 의 인용에서 도출한 **설계 제안**이다(관측 사실과 구분하라).

1. **상태 축은 A안(파일시스템=진실원)을 유지한다.** C안(state.json)은 10만 유닛에서 재직렬화가 선형 악화한다.
2. **레저를 고쳐라 (§5-1 처방 1~3).** 42.5s → 목표 5s 이하. 이게 가장 값싼 개선이다.
3. **재개 캐시는 B안의 3종 헤더를 유닛 산출에 심는다**: `harnessVersion`(이미 있음, `finalize.ts:21`) +
   `specSha256`(`qbank/spec/types/<TYPE>.md`) + `passageSha256`. 규격이 개정되면 그 유형만 자동 재작업 대상이 된다.
4. **JSONL 은 `appendFileSync` 만.** 스트림 금지.
5. **배치 파일은 고정하고 슬라이스로 꺼낸다**(D안). 재개 시 배정이 흔들리지 않는다.
6. **워커는 throw 하지 않는다.** 실패를 값으로 반환하고 `failures[]` 에 모은다.
7. **CLI 는 공백형 + 종료코드 0/1/2** 로 통일한다(`gate.ts:9`).
8. **dry-run 이 기본, `--apply` 가 명시**(`_backfill-report-chosen-choice.ts:26, 43`). 쓰기 전 백업 파일 필수(`:137-141`),
   백업 경로에 `new Date().toISOString().replace(/[:.]/g,"-")` 타임스탬프(`:138`), 되돌리기 절차를 파일 상단 주석에 적는다(`:29-31`).
9. **부분 산출이 정본을 오염시키지 않게 한다** — 전건 성공 후에만 머지(B안 `:1135-1145`).
10. **커밋 전 `.vercelignore` 에 `qbank` 추가**(§5-4).

---

## 부록 A. `--apply`/백업 CLI 규약 원문 (`scripts/_backfill-report-chosen-choice.ts`)

파일 상단 주석 `:18-31` 이 규약 5개를 명문화한다:
1. 전체 재동기화 금지 — **한 필드만** 교체(`:148-151` 스프레드로 나머지 키 보존).
2. 대상은 「원본과 사본이 다른」 행뿐 — `:97, 102-104`.
3. 쓰기 전 원문 백업(`:137-141`, `.tmp-qa/backfill-chosen-choice-backup-<stamp>.json`).
4. **기본 dry-run**, `--apply` 를 명시해야 기록(`:43, 132-135`).
5. 파생값(점수) 재계산 금지 — `:27`.
6. 되돌리기 절차를 주석에 명시(`:29-31`).
7. dry-run 에서도 **바뀔 내용을 전부 출력**(`:119-130`) — "무엇이 바뀌는지 못 보는 dry-run 은 dry-run 이 아니다".
8. env 이중 로드: `.env` → `.env.local`(override)(`:39-40`).

## 부록 B. 미구현·미상 목록

| 항목 | 상태 |
|---|---|
| 샤드 클레임 파일(`qbank/work/shards/*.claim.json`, 90분 TTL) | `PROJECT.md:158-161` 에 설계만. **구현 0** (디렉토리 부재, grep 0건) |
| JSONL 스트리밍 리더(40만 행) | 리포 전체에 선례 없음 |
| JSONL append 시 중복 방지 | 선례 없음. 소비 측 `qid` last-wins 로 처리해야 함 |
| `verify-render.mjs` (3경로 렌더 검증) | `PROJECT.md:18, 55` 가 성공조건으로 지목하나 `qbank/harness/` 에 파일 없음 |
| `NODE_OPTIONS=""` 를 강제하는 이유 | **[미상]** — 40여 테스트가 관행으로만 적용 |
| NTFS 50만 파일 규모의 실제 스캔/백업 비용 | **[미상]** — 현재 `qbank/out` 은 124 파일뿐 |
