# SMOAT 학습 — 앱 마켓 제출 런북

이 디렉터리는 `SMOAT 학습`(Android/iOS 학생 앱)의 App Store · Google Play 제출에 필요한 심사 문서 일체입니다. 모든 문서는 합니다체로 작성되었으며, 코드 사실에 근거합니다. 스토어 콘솔에 값을 붙여 넣기 전, 담당자는 각 문서의 `확정 필요` 표시 항목을 실값으로 채워야 합니다.

## 앱 기본 정보

| 항목 | 값 | 근거 |
| --- | --- | --- |
| 표시명(바이너리) | `SMOAT 학습` | `mobile/android/app/src/main/res/values/strings.xml` app_name · `mobile/capacitor.config.ts` appName |
| 애플리케이션 ID | `kr.co.smoat.student` | capacitor.config.ts appId · strings.xml package_name |
| 카테고리 | 교육(Education) | 본 문서 metadata |
| 로드 방식 | 원격 셸(server.url = `https://www.smoat.co.kr/g`) | capacitor.config.ts |
| 결제 | 학생 앱 내 결제·구매·구독 전무 | ToS(`/terms`) 회원 정의 · RouteGuard 봉인 |
| 개인정보처리방침 | `https://www.smoat.co.kr/privacy` | 실재(최종 갱신 2026-06-09) |
| 이용약관 | `https://www.smoat.co.kr/terms` | 실재(최종 갱신 2026-07-02) |
| 지원·마케팅 URL | `https://www.smoat.co.kr` | — |
| 지원 이메일 | `info@neander.co.kr` | `src/lib/legal/business-info.ts` |

## 판매자 정보(콘솔 공통)

`src/lib/legal/business-info.ts` 실값입니다.

- 상호: 주식회사 네안데르
- 대표자: 유재영, 이동주
- 사업자등록번호: 683-86-02812
- 통신판매업신고번호: 2023-서울서대문-1558
- 사업장 소재지: 서울 마포구 독막로36길 10-6, 1층(대흥동)
- 전화번호: 02-336-3368
- 이메일: info@neander.co.kr

## 문서 색인

### 공통
- `demo-account.md` — 심사용 시드 계정과 자동 로그인 딥링크(App Store Connect·Play `앱 액세스 권한` 공용)
- `rejection-playbook.md` — 예상 반려 사유별 반박 스니펫(한/영)
- `privacy-policy-mapping.md` — `/privacy`·`/terms` 조항과 스토어 라벨의 매핑, 방침 보강 권고

### Apple App Store — `apple/`
- `apple/review-notes.md` — 심사 노트(한/영 병기)
- `apple/app-privacy-labels.md` — App Privacy(개인정보 보호) 라벨
- `apple/metadata.md` — 표시명·부제·키워드·설명·연령 등급
- `apple/screenshots.md` — 스크린샷 규격과 5컷 구성

### Google Play — `google/`
- `google/data-safety.md` — 데이터 안전(Data safety) 신고
- `google/store-listing.md` — 스토어 등록정보(제목·짧은 설명·전체 설명)
- `google/content-rating.md` — IARC 콘텐츠 등급 설문

## 필수 자산 체크리스트

| 자산 | 규격 | 담당/상태 |
| --- | --- | --- |
| 런처 아이콘 | Android 어댑티브 · iOS 1024×1024 | U3-branding(아이콘 시안 최종 승인 `확정 필요`) |
| Android 피처 그래픽 | 1024×500 | 촬영/디자인 `확정 필요` |
| Play 아이콘 | 512×512 | U3-branding 산출물에서 추출 |
| Apple 스크린샷 | 6.9인치 1290×2796, iPhone 5컷 | 시드 계정 촬영 `확정 필요` |
| Play 스크린샷 | 폰 2~8장 | 시드 계정 촬영 `확정 필요` |
| 심사용 시드 계정 | ACTIVE 학생 + 과제·시험·드릴 표본 | recon-students/recon-grammar 이관 `확정 필요` |
| 서명 키(Android) | Play App Signing 또는 업로드 키 | U7-ci-staged 문서 · 릴리스 시점 |
| Apple Team ID | 10자 | Apple 계정 발급 후 `확정 필요` |

## 미결 항목(openQuestion)

1. **아이콘 최종 승인** — 案A `각인 S 모노그램`(U3) 기본값. 유저 최종 승인 대기.
2. **심사용 시드 계정** — 실제 ACTIVE 학생 계정과 과제/시험/드릴 표본 데이터 생성은 recon-students·recon-grammar로 이관. `demo-account.md`의 자리표시자를 실값으로 교체해야 함.
3. **Apple Team ID** — Apple Developer 계정 부재로 `apple/*`·`mobile/deploy/apple-app-site-association`(U5)·`mobile/ios-overlay/*`(U7)의 `<TEAMID>` 자리표시자 미치환.
4. **Gemini(AI 튜터) 데이터 안전 분류** — Google Gemini(atlas 게이트웨이)는 서비스 제공자 처리이므로 `제3자 공유` 아니오가 원칙이나, 무학습 계약 확정 전에는 Play에서 보수적으로 `서비스 제공자와 공유`로 신고할 수 있음. `google/data-safety.md` 참조.
5. **개인정보처리방침 보강** — 학생(미성년·비회원) 관계, 법정대리인 동의(PIPA), AI 수탁사(Google) 명시가 현행 `/privacy`에 부재. 방침 파일은 `mobile/` 밖이므로 실제 수정은 main으로 이관. `privacy-policy-mapping.md` 참조.

## 제출 순서(권고)

1. **Android 내부 테스트 선안정화** — `mobile/BUILD.md`(U9) 절차로 디버그 APK를 사이드로드해 시드 계정 흐름(로그인, 과제, 드릴, 시험, 내 기록 순서)을 점검한 뒤, Play 내부 테스트 트랙에 릴리스 빌드를 올려 안정화합니다. iOS 초회 심사의 4.2(최소 기능) 반려 확률이 높으므로, 먼저 Android에서 흐름을 확정하는 편이 안전합니다.
2. **Play 프로덕션 심사 제출** — `google/*` 문서로 스토어 등록정보·데이터 안전·콘텐츠 등급을 채웁니다.
3. **iOS 심사 제출** — `apple/*` 문서로 심사 노트·개인정보 라벨·메타데이터를 채우고, `rejection-playbook.md`를 곁에 두고 대응합니다.

## 딥링크 자산 참고(재생성 금지)

App Links(`assetlinks.json`)와 Universal Links(`apple-app-site-association`)는 U5-deeplink-deploy가 `mobile/deploy/`에 소유합니다. 본 디렉터리에서 재생성하지 않으며, 배치·검증 절차는 `mobile/deploy/DEEPLINK-DEPLOY.md`를 참조합니다.
