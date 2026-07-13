# SMOAT 학생 앱 — CI 워크플로 (스테이징본)

이 디렉터리의 `*.yml` 3종은 **스테이징본**입니다. GitHub Actions 는 저장소 루트
`.github/workflows/` 아래의 워크플로만 실행하므로, **여기 있는 파일을 그대로 두면 실행되지
않습니다.** 이는 "성공조건: `git diff` 에서 `mobile/` 밖 변경 0" 을 지키기 위한 의도적 설계입니다
(웹서버 산출물을 `mobile/deploy/` 에 두는 것과 동일한 '스테이징 + 가이드 위임' 패턴).

에이전트는 `mobile/` 밖에 파일을 만들지 않습니다. `.github/workflows/` 로의 복사는
**사람(또는 오케스트레이터)의 명시적 조치**입니다.

---

## 0. 선행 필수 — `mobile/` 소스를 먼저 커밋

현재 `mobile/` 는 **git 미추적**입니다(`git ls-files mobile/` = 0건). 워크플로는
`working-directory: mobile` 에서 `npm ci` 를 돌리므로, `mobile/` 소스가 저장소에 없으면
**활성화해도 첫 실행이 실패**합니다. 게다가 `.github/workflows/` 만 담은 커밋은
`paths: mobile/**` 필터에 걸리지 않아 자동 트리거되지도 않습니다.

따라서 순서는 반드시 다음과 같습니다.

```bash
# ① mobile/ 소스 커밋 (node_modules·빌드산출물은 .gitignore 가 제외)
git add mobile/
git commit -m "feat: add SMOAT student app (Capacitor shell)"
# ② 워크플로 활성화(§1) — 같은 커밋에 묶어도 됩니다.
# ③ 이후 mobile/** 변경 푸시 시 자동 트리거. 최초 동작 확인은 workflow_dispatch 로 수동 실행.
```

---

## 1. 활성화 (`.github/workflows/` 로 복사)

저장소 루트에서(위 §0 의 `mobile/` 커밋을 먼저 수행한 뒤):

```bash
mkdir -p .github/workflows
cp mobile/ci/mobile-android-debug.yml   .github/workflows/
cp mobile/ci/mobile-android-release.yml .github/workflows/
cp mobile/ci/mobile-ios.yml             .github/workflows/
git add .github/workflows/
git commit -m "ci: activate mobile workflows"
# 최초 실행은 Actions 탭에서 workflow_dispatch 로 수동 트리거(‥paths 필터가 이 커밋을 안 잡으므로).
```

워크플로 내부의 모든 경로(`working-directory: mobile`, `paths: mobile/**`,
`cache-dependency-path: mobile/package-lock.json`, 아티팩트 경로
`mobile/android/app/build/outputs/apk/...`)는 **저장소 루트 기준**으로 작성되어 있으므로
복사만 하면 수정 없이 동작합니다.

> GitHub Actions 의 `working-directory`(기본/스텝 모두)는 항상 워크스페이스 루트 기준입니다.
> 그래서 gradlew 스텝은 `android` 가 아니라 `mobile/android` 로 지정되어 있습니다.

---

## 2. 워크플로 3종 요약

| 파일 | 러너 | 트리거 | 게이트 | 산출 |
|---|---|---|---|---|
| `mobile-android-debug.yml` | ubuntu-latest | `push`/`pull_request` (`paths: mobile/**`), `workflow_dispatch` | 없음(항상 실행) | `app-debug.apk` |
| `mobile-android-release.yml` | ubuntu-latest | `push` 태그 `mobile-v*`, `workflow_dispatch` | `vars.ANDROID_SIGNING_ENABLED == 'true'` | 서명된 `app-release.apk` |
| `mobile-ios.yml` | macos-26 | `push`/`pull_request` (`paths: mobile/**`), `workflow_dispatch` | job2 만 `vars.IOS_SIGNING_ENABLED == 'true'` | (job1) 컴파일 검증 / (job2) `*.ipa` |

세 워크플로 모두 `concurrency` 로 ref 별 중복 실행을 취소(`cancel-in-progress`)합니다.
디버그·iOS 는 `paths: mobile/**` 로 **웹 전용 푸시에서는 트리거되지 않습니다** —
특히 iOS 의 macOS 러너 분당 과금을 차단하는 것이 핵심입니다.

---

## 3. `npm ci → cap sync → gradlew` 순서가 절대적인 이유

`android/.gitignore` 는 아래를 무시하므로 **신선 체크아웃에는 존재하지 않습니다**:

- `capacitor-cordova-android-plugins/` (Cordova→Capacitor 브리지 모듈)
- `app/src/main/assets/capacitor.config.json`, `capacitor.plugins.json`
- `app/src/main/assets/public/` (복사된 웹 자산)

그런데 `android/settings.gradle` 은 `include ':capacitor-cordova-android-plugins'` 를
선언합니다. 따라서 `npx cap sync android` 로 이 생성물을 **먼저 재생성하지 않으면 Gradle
구성 단계에서 실패**합니다. 순서를 반드시 지키십시오:

```
npm ci            # package-lock.json 과 정확히 일치하는 의존성 설치
npx cap sync android   # 무시된 생성물(cordova 브리지·config·web assets) 재생성
./gradlew assembleDebug
```

> `npm ci` 는 `package-lock.json` 과 `package.json` 이 **동기화**되어 있어야 성공합니다.
> `@capacitor/keyboard`, `@capacitor/assets` 를 추가한 뒤에는 반드시 `npm install` 로
> 락파일을 갱신·커밋하십시오(그렇지 않으면 CI 의 `npm ci` 가 락 불일치로 실패).

### google-services.json 없이도 그린

`android/app/build.gradle` 하단(L47–54)의 `try/catch` 가 `google-services.json` 부재 시
`com.google.gms.google-services` 플러그인을 **적용하지 않습니다**. v1 은 이 파일을 커밋하지
않으므로(그리고 `@capacitor/push-notifications` 를 설치하지 않으므로) 빌드는 구조적으로
그린입니다. 이 회귀는 디버그 워크플로가 매 실행 검증합니다.

---

## 4. 시크릿·리포지토리 변수 규약

### Repository Variables (Settings → Secrets and variables → Actions → Variables)

| 변수 | 값 | 효과 |
|---|---|---|
| `ANDROID_SIGNING_ENABLED` | `true` | 릴리스 워크플로의 서명 잡 활성화 |
| `IOS_SIGNING_ENABLED` | `true` | iOS 워크플로의 아카이브/IPA 잡 활성화 |

미설정(또는 `true` 가 아님)이면 해당 잡은 **스킵**되어 그린을 유지합니다. 계정·인증서가
없는 v1 단계에서 CI 가 실패하지 않게 하는 게이트입니다.

### Secrets (Android 릴리스)

| 시크릿 | 설명 |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | 릴리스 키스토어(`.jks`)의 base64 인코딩 |
| `ANDROID_KEYSTORE_PASSWORD` | 키스토어 비밀번호 |
| `ANDROID_KEY_ALIAS` | 키 별칭 |
| `ANDROID_KEY_PASSWORD` | 키 비밀번호 |

키스토어 base64 만들기: `base64 -w0 release.jks > release.jks.b64` (macOS 는 `base64 -i release.jks`).
서명은 `-Pandroid.injected.signing.*` 프로퍼티 주입으로 처리하므로 **`build.gradle` 을
편집하지 않습니다**(작동 중 빌드 보존).

### Secrets (iOS 서명 아카이브)

| 시크릿 | 설명 |
|---|---|
| `APPLE_CERTIFICATE_BASE64` | 배포 인증서(`.p12`) base64 |
| `APPLE_CERTIFICATE_PASSWORD` | `.p12` 비밀번호 |
| `APPLE_PROVISIONING_PROFILE_BASE64` | 프로비저닝 프로파일(`.mobileprovision`) base64 |
| `APPLE_TEAM_ID` | 10자 Apple Team ID |
| `KEYCHAIN_PASSWORD` | 러너 임시 키체인 비밀번호(임의 값) |

iOS 아카이브 export 는 `mobile/ios-overlay/ExportOptions.plist` 를 사용합니다.
계정 발급 후 그 파일의 `teamID`·`provisioningProfiles` 자리표시자를 치환하십시오.

---

## 5. `version.json` — 버전 단일 소스

`mobile/version.json`:

```json
{ "versionName": "1.0.0", "versionCode": 1 }
```

- **iOS**: `scripts/apply-ios-overlay.sh` 가 이 파일을 읽어 Info.plist 의
  `CFBundleShortVersionString`(MARKETING_VERSION) / `CFBundleVersion`(CURRENT_PROJECT_VERSION)
  에 주입합니다.
- **Android (v1)**: 배선하지 않습니다. `android/app/build.gradle` 의 하드코딩
  `versionCode 1` / `versionName "1.0"` 을 **그대로 둡니다**. 작동 중인 `build.gradle` 을
  `JsonSlurper` 로 편집하면 `assembleDebug` 그린(절대조건)을 위협하기 때문입니다. 디버그
  사이드로드에는 하드코딩 버전으로 충분합니다.

### 릴리스 시점 Android 배선 방법 (선택, 후속)

릴리스에서 `version.json` 을 단일 소스로 쓰려면 `build.gradle` 을 편집하는 대신 **CLI
프로퍼티 주입**을 권장합니다(파일 무편집 유지). 예: 워크플로에서 값을 읽어 넘기고

```groovy
// android/app/build.gradle 의 defaultConfig 안 — 릴리스 배선을 선택할 때만
versionCode  (project.hasProperty('appVersionCode')  ? project.appVersionCode.toInteger()  : 1)
versionName  (project.hasProperty('appVersionName')  ? project.appVersionName              : "1.0")
```

빌드 시 `-PappVersionCode=$(node -p "require('./version.json').versionCode")`
`-PappVersionName=$(node -p "require('./version.json').versionName")` 로 주입합니다. 단
이는 `build.gradle` 을 손대는 변경이므로 **디버그 그린을 재검증한 뒤** 릴리스 단계에서만
도입하십시오. v1 스테이징본에는 포함하지 않았습니다.

---

## 6. iOS 는 에페메랄 — 커밋하지 않습니다 (전환 절차 포함)

- `ios/` 는 CI(macOS)에서 매 실행 `npm i @capacitor/ios@8 && npx cap add ios --packagemanager SPM`
  으로 **새로 생성**하며 저장소에 커밋하지 않습니다.
- **Windows 개발기에서는 `npx cap add ios` 실행·커밋을 금지**합니다. CocoaPods/Xcode 를
  지원하지 않아 생성물이 불완전·검증 불가이기 때문입니다.
- Capacitor 8 은 **SPM(Swift Package Manager)** 통합을 지원하므로 `--packagemanager SPM`
  으로 추가합니다. CocoaPods 워크플로(`pod install`, `.xcworkspace`)를 요구하지 않아 CI 가
  가볍고, `mobile/.gitignore` 도 Pods 를 배제합니다.

### 나중에 `ios/` 를 커밋 전환하려면

1. **macOS 개발기에서** `cd mobile && npm i @capacitor/ios@8 && npx cap add ios --packagemanager SPM`.
2. `bash scripts/apply-ios-overlay.sh` 로 entitlements/버전 오버레이 적용, Xcode 로 서명 팀 설정.
3. `mobile/.gitignore` 는 유지합니다 — `ios/App/Pods/`, `ios/**/build/`, `ios/**/DerivedData/`,
   `*.xcarchive` 등 산출물은 커밋 전환 후에도 계속 무시됩니다(소스만 커밋).
4. `mobile-ios.yml` 에서 `npm i @capacitor/ios@8`·`npx cap add ios` 스텝을 제거하고
   `npx cap sync ios` 만 남깁니다(커밋된 `ios/` 를 갱신).

---

## 7. 로컬 사이드로드는 CI 없이도 가능

v1 배포용 디버그 APK 는 Windows 개발기(JDK 21)에서 로컬 빌드합니다(자세한 절차는
`mobile/BUILD.md` — U9 소유). CI 미실행이 성공조건을 막지 않습니다. 이 워크플로들은
**활성화 후** 회귀 방지(신선 체크아웃에서 그린 재현)·릴리스 서명·iOS 컴파일 검증을 위한
것입니다.

---

## 8. 체크리스트 (활성화 시)

- [ ] `package-lock.json` 이 `package.json` 과 동기화되어 커밋됨 (`npm ci` 요건)
- [ ] `.github/workflows/` 로 3종 복사·커밋
- [ ] (릴리스 시) `ANDROID_SIGNING_ENABLED` 변수 + `ANDROID_*` 시크릿 등록
- [ ] (iOS 서명 시) `IOS_SIGNING_ENABLED` 변수 + `APPLE_*`·`KEYCHAIN_PASSWORD` 시크릿 등록
- [ ] `ExportOptions.plist` 의 `teamID`·`provisioningProfiles` 치환
- [ ] `ios-overlay/App.entitlements` 의 `aps-environment` 를 배포 시 `production` 으로 승격
