# SMOAT 학생 앱 — 로컬 빌드 · 사이드로드

Capacitor 8 하이브리드 셸(원격 `https://www.smoat.co.kr/g` 직결)의 안드로이드 디버그
APK 를 로컬(Windows)에서 빌드해 실기기에 사이드로드하는 절차입니다. iOS 는 macOS/Xcode 가
필요해 로컬 대상이 아니며 GitHub Actions macOS 러너로 빌드합니다(`mobile/ci/` 참조).

## 전제

| 항목 | 값 |
| --- | --- |
| JDK | Android Studio 번들 JDK 21 — `C:/Program Files/Android/Android Studio/jbr` |
| Android SDK | `C:/Users/<사용자>/AppData/Local/Android/Sdk` |
| Node | 20+ (개발기 검증: 24) |
| Capacitor | 8.4.1 (`@capacitor/*` 8.x) |
| appId / appName | `kr.co.smoat.student` / `SMOAT 학습` |

> **TypeScript 핀 주의:** `mobile/package.json` 은 `typescript@5.7.3` 을 devDependency 로
> 고정합니다. TypeScript 7(신형 tsgo)은 `@capacitor/cli` 의 `.ts` 설정 파싱을 깨뜨리므로
> (`ts.ModuleKind` undefined) 반드시 5.x 여야 `npx cap sync` 가 동작합니다.

## 빌드 절차

```bash
cd mobile

# 1) 의존성 — @capacitor/keyboard·assets 포함. (@capacitor/push-notifications 는 미설치)
npm install

# 2) 동기화 — 반드시 gradlew 前에. config·플러그인·www/ 를 android/ 로 반영하고,
#    android/.gitignore 가 무시하는 생성물(capacitor.config.json,
#    capacitor-cordova-android-plugins/ 등)을 재생성한다. 신선 체크아웃에서 이 단계를
#    건너뛰면 ':capacitor-cordova-android-plugins' 부재로 gradle 구성이 실패한다.
npx cap sync android

# 3) 디버그 APK 빌드 — JAVA_HOME 를 번들 JDK 로 지정.
#    PowerShell:
#      $env:JAVA_HOME='C:/Program Files/Android/Android Studio/jbr'; cd android; ./gradlew assembleDebug
#    Bash(Git Bash):
JAVA_HOME='C:/Program Files/Android/Android Studio/jbr' \
  ANDROID_HOME="$LOCALAPPDATA/Android/Sdk" \
  ./android/gradlew -p android assembleDebug
```

산출물: `mobile/android/app/build/outputs/apk/debug/app-debug.apk` (≈4.6MB).

## 사이드로드

```bash
# USB 디버깅을 켠 기기 연결 후
adb install -r mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

디버그 APK 는 `~/.android/debug.keystore`(암호 `android`)로 자동 서명됩니다. 이 서명 지문이
`mobile/deploy/assetlinks.json` 의 App Links 검증 지문과 일치해야 `https://www.smoat.co.kr/g`
링크가 앱으로 열립니다(`mobile/deploy/DEEPLINK-DEPLOY.md` 참조).

## 흔한 실패

| 증상 | 원인 · 해결 |
| --- | --- |
| `Cannot read properties of undefined (reading 'CommonJS')` | TypeScript 7 이 `.ts` config 파싱을 깸 → `npm install --save-dev typescript@5.7.3` 후 재시도. |
| `Project ':capacitor-cordova-android-plugins' not found` | `npx cap sync android` 를 gradle 前에 실행하지 않음. |
| `Unsupported class file major version` / JDK 오류 | `JAVA_HOME` 가 번들 JDK 21(`.../Android Studio/jbr`)을 가리키는지 확인. |
| 아이콘/스플래시가 스톡으로 나옴 | `npx capacitor-assets generate --android` 재실행(원본 `mobile/assets/logo.png`). |

## 릴리스(서명) 빌드 · CI

디버그 사이드로드가 아닌 스토어 제출용 서명 릴리스와 iOS 빌드는 `mobile/ci/`(GitHub Actions
스테이징본)와 `mobile/store/`(제출 문서)를 참조하십시오. 릴리스는 업로드 키스토어 생성 후
`assembleRelease` 로 빌드하며, 키스토어는 절대 커밋하지 않습니다(`mobile/.gitignore` 가 `*.jks`
`*.keystore` 를 무시).
