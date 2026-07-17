# BLOCKED DRAFT — DO NOT ISSUE OR SEAL

이 디렉터리는 production type binding v2를 대상으로 작성되던 중간 초안이다. v2의 회전 수학은 유효하지만 `V2_SOURCE_AUTHORITY_FAIL_OPEN` 때문에 실행 권위로 사용할 수 없다.

- `MANIFEST.sha256`가 없으며 만들면 안 된다.
- 이 디렉터리의 verifier 성공은 실행 적격 또는 발행 허가가 아니다.
- 후속 v4는 별도 디렉터리에서 불변 production binding v3 매니페스트와 별도 독립 `PASS_NO_BLOCKERS` 감사 매니페스트를 동시에 exact-bind한 뒤 새로 검증해야 한다.
- 이 초안은 실패 provenance와 설계 비교를 위해서만 보존한다.
