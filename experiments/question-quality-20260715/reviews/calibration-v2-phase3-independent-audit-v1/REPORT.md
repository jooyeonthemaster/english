# Calibration v2 phase3 독립 적대 감사

판정: **FAIL — trusted gold 승격 및 certificate 발급 차단 유지**

작성자 validator와 독립 verifier는 모두 기계적 자기일관성을 통과했다. 그러나 이는 phase3를 신뢰 가능한 gold로 만들기에 충분하지 않다. 독립성 provenance blocker 1건, constructed answer-space blocker 1건, adjudication evidence major 2건을 확인했다.

## 감사 범위와 금지사항

대상은 reviewer-calibration-packet-v2의 adjudicator-c/phase3 산출물 5개와 그 public, blind phase1, submission, seal, relabel map, reveal, A/B score-bound input이다.

- adjudication-records.json
- final-gold-proposal.json
- final-labels.json
- report.json
- validator.mts

감사는 순수 오프라인으로 수행했다. 네트워크, API/model, DB, secret 또는 configuration 환경값, budget ledger를 사용하거나 변경하지 않았다. private/gold.private.json은 읽거나 수정하지 않았다. private/items.private.json은 proposal의 packet byte hash를 재계산하기 위한 hash-only 입력으로만 사용했고 의미 판정에는 사용하지 않았다. A/B/C 및 packet 원본은 수정하지 않았다.

## 최종 판정 근거

### BLOCKER CALV2-P3-B01 — C의 fresh independence를 증명할 수 없음

관측 시각은 다음 순서다.

| Artifact | UTC |
|---|---:|
| A phase2 review-records 수정 | 2026-07-15 11:16:09.751 |
| B phase2 review-records 수정 | 2026-07-15 11:31:47.204 |
| C phase1 seal embedded instant | 2026-07-15 11:39:51.089207 |
| A/B interagreement report 수정 | 2026-07-15 11:44:18.759 |
| C phase2 review-records 수정 | 2026-07-15 11:46:53.632 |

C phase1 seal은 C reveal보다 앞서므로 “blind answer가 reveal 전에 동결됐다”는 결합은 확인된다. 그러나 raw A/B review는 C phase1 seal 전에 이미 존재했고, A/B interagreement report도 C phase2 record보다 먼저 존재했다. C phase2에는 completion timestamp가 없고, signed pre-access commitment, access log, append-only commit도 없다.

C phase2 semantic SHA-256 1680233f49f01d937e33539b3c24d64570b60e5a34a6c4d07aa951279f5bd8ad는 현재 content만 고정한다. A/B를 보지 않았다는 사실이나 완료 시점을 증명하지 않는다. 따라서 phase2-notes의 non-access 서술은 독립 검증 가능한 사실이 아니라 자기진술이다.

조치: C phase2 전체 hash와 완료시각을 A/B 공개 전에 서명·봉인하고, A/B 접근통제 및 감사 로그를 보존한 뒤 재중재해야 한다.

### BLOCKER CALV2-P3-B02 — N05/N06/N07 exact-hash gold가 의미적으로 닫혀 있지 않음

구조적 hash와 canonicalization은 모두 맞다.

| Item | Accepted sets | 구조 | 의미 판정 |
|---|---:|---|---|
| N05 | 9 | exact/normalized/text-set hash 모두 유효, 중복 없음 | contested, non-closed |
| N06 | 16 | active 4 × passive 4 완전 cross product, member-order 불변 | contested, non-closed |
| N07 | 2 | 두 SINGLE_TEXT hash 유효, 중복 없음 | second order는 marked but defensible, non-closed |

N05의 9문장은 문법적으로 성립하지만, 원문 자체를 그대로 accepted response로 넣어 Rewrite 지시를 수행하지 않는다. only when, must before, only after 계열은 loose necessary-condition 해석에서는 방어 가능하나 시간·양태 framing을 더한다. 반대로 “The council will not open the trail until both retaining walls have passed an independent inspection.” 같은 자연스러운 response는 동일한 명시 조건을 충족하지만 accepted hash에 없다.

N06은 4개 active와 4개 passive 문장을 모두 교차하여 16개 set을 만든다. 개별 문장은 문법적이고 pre-trial 의미를 유지한다. 다만 simple-past와 past-perfect를 섞은 8개 set은 동일 tense/aspect의 순수 voice counterpart인지 논쟁적이다. 더 근본적으로 prompt는 lexical form을 닫지 않았으므로 prior-to-the-start 등 다른 정확한 문장쌍을 배제할 근거가 없다.

N07의 canonical order는 명백히 유효하다. “accept as a property of the pigment the apparent color shift” 순서는 marked heavy-object shift지만 문법적으로 방어 가능하다. 그러나 exact-byte scoring은 introductory-clause comma 같은 표점 변형을 canonicalize하지 않는다.

이 packet은 이미 해당 문항들을 fatal로 분류했지만, final gold 자체도 prospective reviewer의 정당한 constructed response를 false negative로 만들 수 있다. semantic constraint scorer, 닫힌 생성문법과 표점 정책, 또는 해당 item 제외 없이는 oracle로 쓸 수 없다.

### MAJOR CALV2-P3-M01 — N01 rationale가 authorized source를 반대로 기록

Authorized source는 Saturday morning에 bridge가 닫히고 path below는 열린다고 말한다. 그런데 concrete finding은 다음과 같이 쓴다.

> The evidence supports canonical option 3: the upper path remains open while the lower path closes.

이는 source의 반대다. mapped options와 reveal을 독립적으로 보면 N01의 F/fatal synchronization 결론은 여전히 지지되지만, 현재 rationale evidence는 거짓 진술을 hash로 고정했다.

### MAJOR CALV2-P3-M02 — B02 rationale가 관측되지 않은 claim을 추가

Revealed explanation은 two-sensor rule이 “no future leak can be missed”와 “false alarms are impossible”을 보장한다고 잘못 주장한다. Concrete finding은 이를 delay, error, manipulation 모두가 불가능하다는 주장으로 바꾼다. delay와 manipulation은 reveal에 없다.

B02의 F/fatal 결론은 실제 두 허위 보장만으로도 충분하지만, evidence 문장은 관측의 충실한 paraphrase가 아니다.

## 통과한 독립 검산

### 24 IDs와 결합

- Public packet, A/B/C private map, phase1, submission, seal, reveal, review, adjudication, final labels, proposal에서 24 canonical IDs가 one-to-one이다.
- 각 block은 GRAMMAR 8, BLANK 8, NONFOCUS 8이다.
- phase1 → submission → seal → reveal 전체 hash chain을 재계산했다.
- 각 item surface, pseudonym, phase-one record hash, map-row hash, full reveal-bundle hash, blind answer freeze가 일치한다.
- A score-bound artifact는 phase2RevealSha256 24개만 기계적으로 변경되었고 다른 judgment field는 그대로다.
- B score-bound artifact는 relabelMapSha256 24개만 기계적으로 변경되었고 다른 judgment field는 그대로다.

### Final labels와 composition

Global labels는 A=4, B=4, C=7, F=9이며 fatal=9다. 모든 F와 fatal flag가 일치한다.

| Block | Items | Fatal | Grades |
|---|---:|---:|---|
| GRAMMAR | 8 | 2 | A2, B2, C2, F2 |
| BLANK | 8 | 2 | A2, B2, C2, F2 |
| NONFOCUS | 8 | 5 | C3, F5 |

Composition은 eligibility를 통과하지 못한다. 정확한 reason은 NONFOCUS_FATAL_COUNT_NOT_2 및 NONFOCUS의 A/B/C/F 각 count-not-2 다섯 개다. final label을 강제로 균형화한 mutation은 reviewed grade/fatal vector drift로 거부되었다.

### Scorer preview

세 reviewer 모두 threshold를 통과하지 못한다.

- A: global blind-solve exact, global/blank blank-option, nonfocus blind-solve exact 실패
- B: global fatal sensitivity, global/blank blank-option, nonfocus fatal sensitivity, nonfocus grade QWK 실패
- C: B와 동일한 다섯 threshold 실패

이는 preview일 뿐이며 certificateIssued=false, blockedBeforeCertificateIssuance=true, effectiveDecision=FAILED가 독립 재계산과 일치한다.

final-gold-proposal.json은 trusted gold 경로와 다르다. 이번 감사에서는 trusted gold를 읽거나 설치하거나 갱신하지 않았다. Proposal의 status field가 FINAL_ADJUDICATED_GOLD여도 별도 composition gate가 실패하므로 trusted scorer의 certificate 경로는 fail-closed다.

## Semantic SHA-256 재계산

| Artifact | Semantic SHA-256 |
|---|---|
| final-labels.json | 8533c6184fbf54be80b23b870b16ad5e865a4419322160637531eeef0c2f8150 |
| adjudication-records.json | fcde70a47273b32b7127e186a247d4d11c0f65447bb450a4f782efb247f31baf |
| final-gold-proposal.json | 39c7b1dbdccd451afd744f7509de445a9443b63458e61b213c0e9cd08cac2b7c |
| report.json | 9bf83be9db81f0a37860d97398a9820c94d28c4ce85ad805f8bcc0430edb1d1c |

작성자 validator도 exit 0으로 같은 hash, label count, composition failure, A/B/C threshold failure를 보고했다. 다만 validator.mts는 grade, fatal, findings, constructed texts를 hard-code하고 stored JSON이 그 생성 결과와 같은지 검사한다. 그러므로 이 통과는 semantic truth나 C independence에 대한 별도 증거가 아니다.

## Hostile mutation 결과

독립 verifier는 원본을 수정하지 않고 deep clone에 mutation을 적용했다.

| Mutation | Expected | Result |
|---|---|---|
| Item deletion | reject | rejected |
| Duplicate canonical ID | reject | rejected |
| Phase-one binding swap | reject | rejected |
| Accepted-set deletion | reject | rejected |
| Grade/fatal drift | reject | rejected |
| Forced block composition balance | reject | rejected |
| Duplicate MULTIPLE_TEXTS member | reject | rejected |
| Declared semantic-hash drift | reject | rejected |
| MULTIPLE_TEXTS member reversal | same identity | same setSha256 accepted |

Negative controls 8/8이 거부되었고 positive order-invariance control 1/1이 통과했다.

## 재현

저장소 루트 D:\Desktop\2026project\nara 에서 다음을 실행한다.

    node --import tsx experiments/question-quality-20260715/design/reviewer-calibration-packet-v2/private/issued/adjudicator-c/phase3/validator.mts

    node --import tsx experiments/question-quality-20260715/reviews/calibration-v2-phase3-independent-audit-v1/verify.mts

두 번째 명령의 valid=true는 “감사 증거와 mutation suite가 재현됨”을 뜻한다. auditVerdict=FAIL과 issuanceRecommendation=BLOCK이 실제 감사 결론이다.

상세 machine-readable 근거는 evidence.json, 판정은 report.json, 파일 무결성은 MANIFEST.sha256에 있다.
