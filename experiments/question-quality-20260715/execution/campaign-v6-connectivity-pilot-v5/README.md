# Campaign v6 connectivity pilot v5

이 디렉터리는 `OCVP-B01` production exact wire를 Standard 1회, 이어서 Premium 1회만 보내는 연결성 파일럿의 오프라인 author package다. 두 응답은 품질·신뢰도·모델 우열의 표본이 아니다.

## 현재 상태: 영구 no-dispatch author freeze

이 package에서는 네 authorization boolean을 수정해도 실행할 수 없다. operator, metadata capture, live child, production runner가 파일·환경·credential·ledger·network 접근보다 먼저 `AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V5`에서 종료한다. 실행 권한을 부여하려면 별도 이름의 새 디렉터리, 새 bundle, 새 subject manifest, 새 독립 감사 manifest가 필요하다.

따라서 author build/test/verifier가 수행한 외부 network, metadata GET, provider/model call, 운영 DB call, 실제 credential read, API candidate 소비, global ledger mutation은 모두 정확히 0이다. v2/v3/v4 파일은 변경하지 않는다.

v4 독립 감사의 FAIL subject도 정확히 pin한다. v4 protocol, author gates, evidence, report, verifier, audit manifest의 파일 SHA-256, manifest 9행 전체, FAIL verdict, v4 target manifest SHA가 모두 일치하지 않으면 v5 author build가 실패한다.

## 봉인 범위

- wire는 Standard `google/gemini-3.5-flash` 뒤 Premium `google/gemini-3.1-pro-preview`, concurrency 1이다. 배정당 candidate/fetch/completion은 각각 1, 전체는 각각 2다. retry, repair, fallback, replacement, top-up은 금지된다.
- 두 request body는 v4와 byte-for-byte 동일하다. 모델, route, reasoning-off, strict JSON Schema, message order와 body SHA가 모두 exact commitment다.
- compiler closure는 195 AST source + 3 dynamic source + 4 declared data input, 총 202개를 exact bytes/hash로 봉인한다. 최소 개수 통과 규칙은 없다.
- live closure는 16 source + protocol/exact-wire/global-ledger 3 data + frozen runtime artifact/bundle 4개, 총 23 repo file과 외부 Node executable 1개를 exact bytes/hash/identity로 봉인한다.
- live runtime은 `tsx`가 아니라 plain Node ESM bundle 3개다. bundle별 exact Node builtin allowlist, network callsite 수와 최대 request 수, 허용 HTTPS literal, dynamic import/require/eval/Function/WebSocket/EventSource 부재, Node executable realpath/version/ABI/V8/platform/arch/bytes/hash를 검증한다.
- 이 author package의 bundle build는 repository의 ambient `esbuild`를 사용한다. emitted bundle bytes와 runtime은 봉인되지만, 독립 감사는 common-mode compiler supply-chain 위험을 별도 구현의 semantic/source comparison 또는 esbuild package/native binary provenance로 확인해야 한다.

## response·candidate·billing 계약

성공은 정확히 choice 1개, semantic question 1개, `finish_reason=stop`, assistant `{role,content}` exact shape, full response-schema 적합, requested/canonical served model, exact provider route, safe-integer usage와 정확한 합계, 실제 cost, `is_byok:false`를 모두 요구한다. message extra, duplicate JSON key, reasoning/cache usage, 잘못된 route/shape는 거부한다.

Candidate accounting은 raw envelope와 `message.content`를 별도로 관찰한다. 둘 이상의 root/choice/question, duplicate key, bounded observer를 벗어난 valid JSON, complete root 뒤 truncated root, model-envelope marker가 이미 보이는 truncated first root는 global candidate capacity를 quarantine한다. 작은 HTML이나 model marker 없는 neutral malformed body는 보낸 opportunity 1개만 소비한다.

응답 body는 2 MiB, 8,192 chunks, fatal UTF-8, identity `Content-Length` equality로 제한한다. declared/stream overflow, chunk overflow, length mismatch, missing body, invalid UTF-8, timeout/socket failure 등 dispatch 뒤 bounded body 관찰이 끝나지 않은 모든 경우는 candidate cardinality unobservable로 global quarantine한다.

Billing extractor, candidate observer, charge constructor가 terminal `finally`에서 실패해도 reserved effective cost + manual reconciliation + candidate quarantine의 합성 charge 1개를 만든다. `charges == physicalFetches == consumed opportunities`가 아니면 settlement할 수 없고, dispatch 후 0-charge settlement는 금지된다.

`usage.is_byok`는 absent/true/wrong type을 모두 actual-unknown/manual로 처리한다. `$0 actualKnown`을 주장하지 않으며 positive upstream cost detail은 hash evidence로 남긴다. explicit positive unrepresentable cost도 manual reconciliation이다.

## 가격·파일·ledger 경계

Public price evidence는 `/api/v1/models`와 두 `/endpoints`의 exact raw HTTP body 3개가 normalized snapshot을 재생성해야 한다. 모든 active endpoint/override와 top-level prompt/completion/fixed request를 포함한다. cache read+write 최대 rate는 input ceiling에 더하고, internal reasoning 최대 rate는 reasoning-off 요청이라도 output ceiling에 더한다. image/web search만 exact text-only/no-tool request shape로 inapplicable하다. unknown dimension과 omitted request fee는 거부한다.

향후 승인 package의 metadata capture와 live launch는 같은 operator process의 one-shot memory handoff를 사용한다. capture 직후 fd-bound file SHA와 bundle SHA를 보존하고, live launch와 live child가 그 exact 두 hash를 다시 확인한다. caller가 임의의 self-consistent synthetic bundle과 새 hash를 제출할 수 없다.

`.env.local`, private price bundle, mutable global ledger는 path 기반 `readFile`을 사용하지 않는다. bounded read-only fd, pre/open/post dev/inode/size/time identity, exact attested-size read, hard EOF, parent/path realpath 재검증을 사용한다. credential 임시 byte buffer는 zeroize한다. private price와 ledger JSON은 fatal UTF-8/no-BOM/duplicate-free다. ledger target과 parent는 rename 직전 다시 attest하며 grow/truncate/in-place rewrite/target swap/parent junction을 fail-closed한다.

Global ledger는 network보다 먼저 2를 atomic reserve한다. terminal intent는 settlement보다 먼저 durable하게 쓰며, success/failure/quarantine 모두 no-replay다. lock close/unlink가 commit 뒤 실패해도 committed mutation을 되돌리거나 재실행하지 않는다.

## 오프라인 검증

현재 freeze를 재현하는 명령은 다음과 같다.

```powershell
npx tsx experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/build-offline.mts --check
npx tsc -p experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/tsconfig.json --pretty false
npx tsx --test experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/offline.test.ts
npx tsx experiments/question-quality-20260715/execution/campaign-v6-connectivity-pilot-v5/verify.mts
```

`--write`는 모든 blocker가 닫히고 freeze 승인이 난 뒤 한 번만 사용한다. 이 package에는 실제 metadata 수집이나 2-call dispatch 명령이 없다.
