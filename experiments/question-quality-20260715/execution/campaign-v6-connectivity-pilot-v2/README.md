# Campaign v6 connectivity pilot v2

이 디렉터리는 `OCVP-B01` 한 지문을 Standard 1회, Premium 1회 순서로만 보내기 위한 **2-call connectivity pilot**의 오프라인 봉인 패키지다. 품질 비교 실험이 아니며, 두 행의 결과로 모델 품질·안정성을 추론하지 않는다.

현재 상태는 `READY_FOR_SEPARATE_HOSTILE_AUDIT`까지만 허용한다. `protocol-v2.json`의 세 권한 값(`liveExecutionAuthorized`, `hostileAuditPassed`, `dispatchCommandPresent`)은 모두 `false`이고, 공개된 launcher 호출 경로는 이 상태에서 자격을 발급하기 전에 반드시 실패한다. 이 패키지를 검증하거나 봉인하는 명령은 실제 네트워크, OpenRouter, 모델, 운영 DB 또는 실제 자격증명을 사용하지 않는다.

## 보존된 실행 계약

- v1 원본 프로토콜과 공개 corpus의 바이트 해시를 고정하고, v1의 깨진 한글 표면은 입력 권위로 사용하지 않는다.
- v2의 정확한 Unicode 입력(`고등학교`, `2학년`)과 production request compiler 결과를 사용한다.
- 순서는 Standard(`google/gemini-3.5-flash`) 다음 Premium(`google/gemini-3.1-pro-preview`)이다.
- 배정당 후보 1개, 물리 fetch 1회, 전체 각 2개가 상한이다. retry, repair, fallback, replacement, top-up은 없다.
- 성공 판정은 정확히 2 started/settled/successful, 최종 usage·route·parser 증거, 직렬 순서, 무 breach를 모두 요구한다. 빈 배열의 `every()`는 성공이 될 수 없다.
- 실패 또는 `unknown_after_send`는 재실행하지 않고 보수적 비용 예약을 유지한 채 격리한다.

## 가격·라우팅 증거

입력 가격 스냅샷은 strict schema v2여야 한다. 두 requested model, canonical dated served-model slug, 정확히 하나의 active `google-vertex/global` endpoint, 필요한 structured-output parameter 선언, 모든 active endpoint/override의 가격, charge-dimension 선언, exact JSON content hash를 요구한다. 매 lease마다 15분 rolling attestation을 다시 검사하고, 동결된 emergency ceiling보다 새 가격이 높으면 새 프로토콜 버전 없이는 중단한다.

성공 응답은 requested/canonical served model, Google provider direct route, 단일 endpoint/attempt 조건, 최종 usage/cost, 단일 choice와 단일 semantic question, 동결 parser의 상관 증거를 모두 충족해야 한다.

## 격리와 비공개 저장

live launcher와 child는 별도 파일이다. child는 이 디렉터리의 `private/` 아래 새롭고 비어 있는 canonical direct child를 cwd로 사용해야 한다. HOME, USERPROFILE, APPDATA, LOCALAPPDATA, NODE_OPTIONS, NODE_PATH 및 repository env loader를 상속하지 않으며, 허용된 OS 변수·제어 변수·기존 `OPENROUTER_API_KEY` 한 개만 child에 전달하도록 설계되어 있다. 키 값은 출력·hash·파일에 기록하지 않는다.

private registry, sealed request body, response evidence, provider generation id, SQLite ledger는 모두 git-ignored private root에만 위치한다. SQLite와 registry는 exclusive-create이며 기존 실행 디렉터리·DB를 재사용하지 않는다. 공개 결과는 숫자·boolean·hash의 고정 allowlist뿐이다.

## 재현 명령

저장된 봉인을 검증하려면 repository root에서 다음 한 명령만 실행한다.

```powershell
npx tsx experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/verify.mts
```

검증기는 manifest, strict protocol, source/import closure, env-loader 부재, production exact-wire 재컴파일 동일성, scoped TypeScript, 오프라인 hostile suite를 확인한다. 검증기 자체의 `fetch`는 deny stub이며 성공 출력에도 외부/API/model/provider/운영 DB 호출 수가 모두 0으로 기록된다.

의도적인 코드 변경 뒤 새 오프라인 봉인을 만들 때만 다음을 실행한다.

```powershell
npx tsx experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/seal-offline.mts
npx tsx experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v2/verify.mts
```

`seal-offline.mts`는 source freeze, v1 commitments, exact-wire artifacts, 비용 상한, protocol hashes, `MANIFEST.sha256`를 다시 계산한다. 이 작업도 intercept된 로컬 production compiler 호출 2회 외에는 네트워크를 사용하지 않는다.

## 현재 차단 조건

live 실행 명령은 의도적으로 제공되지 않는다. 별도의 적대적 감사가 이 패키지와 공유 controller 경계를 승인하고, 운영자가 새 프로토콜 버전에서 세 권한 값을 명시적으로 변경해 dispatch command를 추가하기 전까지 실제 API 후보 소모량은 0으로 유지해야 한다.

