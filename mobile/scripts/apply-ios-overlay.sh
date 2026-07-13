#!/usr/bin/env bash
#
# SMOAT 학생 앱 — iOS 오버레이 적용 스크립트 (CI 스텝, 자리표시자 구현)
#
# 실행 시점: mobile-ios.yml 에서 `npx cap sync ios` 직후(러너 macOS).
# 역할:
#   1) ios-overlay/App.entitlements 를 에페메랄 ios/App/App/App.entitlements 로 복사.
#   2) version.json(단일 소스)의 versionName/versionCode 를 Info.plist 의
#      CFBundleShortVersionString(MARKETING_VERSION) / CFBundleVersion(CURRENT_PROJECT_VERSION) 에 주입.
#
# 자리표시자 구현입니다. Apple 계정 발급·프로비저닝 확정 후 associated-domains 배선,
# 서명 스타일 등 세부는 CI(mobile-ios.yml)와 ExportOptions.plist 에서 마무리합니다.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

IOS_APP_ROOT="$MOBILE_DIR/ios/App"
OVERLAY_DIR="$MOBILE_DIR/ios-overlay"
VERSION_JSON="$MOBILE_DIR/version.json"

ENTITLEMENTS_SRC="$OVERLAY_DIR/App.entitlements"
INFO_PLIST="$IOS_APP_ROOT/App/Info.plist"
ENTITLEMENTS_DST="$IOS_APP_ROOT/App/App.entitlements"

if [ ! -d "$IOS_APP_ROOT" ]; then
  echo "error: iOS 프로젝트가 없습니다 ($IOS_APP_ROOT). 먼저 'npx cap add ios' 를 실행하십시오." >&2
  exit 1
fi

# 1) entitlements 덧입히기
if [ -f "$ENTITLEMENTS_SRC" ]; then
  cp "$ENTITLEMENTS_SRC" "$ENTITLEMENTS_DST"
  echo "applied: App.entitlements -> $ENTITLEMENTS_DST"
else
  echo "warning: $ENTITLEMENTS_SRC 가 없어 entitlements 복사를 건너뜁니다." >&2
fi

# 2) version.json → Info.plist 주입 (버전 소스 단일화)
#    node 가 있으면 version.json 을 파싱하고, 없으면 기본값으로 폴백합니다.
VERSION_NAME="1.0.0"
VERSION_CODE="1"
if command -v node >/dev/null 2>&1 && [ -f "$VERSION_JSON" ]; then
  VERSION_NAME="$(node -p "require('$VERSION_JSON').versionName" 2>/dev/null || echo "$VERSION_NAME")"
  VERSION_CODE="$(node -p "require('$VERSION_JSON').versionCode" 2>/dev/null || echo "$VERSION_CODE")"
fi

# PlistBuddy 주입은 Info.plist 가 리터럴 값을 쓰는 경우에 적용됩니다. Capacitor 기본 프로젝트가
# $(MARKETING_VERSION)/$(CURRENT_PROJECT_VERSION) 빌드 설정 변수를 참조하면 이 Set 은 무의미하므로,
# 그 경우 xcodebuild 인자(MARKETING_VERSION=.. CURRENT_PROJECT_VERSION=..)로 주입하십시오.
plist_set() {
  local key="$1" val="$2"
  if [ ! -f "$INFO_PLIST" ]; then
    echo "warning: Info.plist 를 찾지 못해 $key 주입을 건너뜁니다 ($INFO_PLIST)." >&2
    return 0
  fi
  /usr/libexec/PlistBuddy -c "Set :$key $val" "$INFO_PLIST" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :$key string $val" "$INFO_PLIST" 2>/dev/null \
    || echo "warning: $key 를 설정하지 못했습니다(Info.plist 가 빌드 설정 변수를 쓸 수 있음)." >&2
}

plist_set "CFBundleShortVersionString" "$VERSION_NAME"
plist_set "CFBundleVersion" "$VERSION_CODE"

echo "iOS overlay applied (version $VERSION_NAME / $VERSION_CODE)."
