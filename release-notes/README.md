# release-notes/ — 배포 시 자동 발행되는 스모트 소식

이 폴더에 마크다운 파일을 커밋하고 `main` 에 머지하면, 다음 **프로덕션 배포**
때 자동으로 "스모트 소식"(플랫폼 공지)으로 발행됩니다. 릴리즈 노트가 없는 배포는
아무것도 올라가지 않습니다.

## 파일 규약

파일명: `YYYY-MM-DD-slug.md` (예: `2026-07-07-announcements-revamp.md`)

프론트매터(맨 위 `---` 블록):

```markdown
---
slug: 2026-07-07-announcements-revamp   # 자동 발행 멱등성 키(고유). 생략 시 파일명 사용.
title: 업데이트 소식을 여기서 모아 보실 수 있어요   # 20자 이내 권장
category: UPDATE                # UPDATE | MAINTENANCE | EVENT | GENERAL
audiences: ALL                  # ALL 또는 DIRECTOR,TEACHER,STUDENT,PARENT (콤마 조인)
publishedAt: 2026-07-07T09:00:00+09:00   # 생략 시 파일명 날짜의 KST 09:00
pinned: false                   # 상단 고정 여부
---

핵심 요약 한 문장.

- 달라진 점 1
- 달라진 점 2
```

## 동작 원리

- 배포 콜드스타트마다 `src/instrumentation.ts` → `publishReleaseNotes()` 가 실행됩니다.
- `slug` 가 이미 발행돼 있으면 **건너뜁니다**(멱등). 그래서 여러 번 실행돼도 중복이 없고,
  운영자가 어드민에서 고친 내용도 자동 발행이 덮어쓰지 않습니다. **새 파일만** 새로 발행됩니다.
- 프로덕션(`VERCEL_ENV=production`)에서만 동작합니다. 로컬/프리뷰에서는 실행되지 않습니다.

## 문체 규칙 (중요)

독자는 개발을 전혀 모르는 원장·강사·학생·학부모입니다. 기술 용어(OCR/렌더링/모달/
HWPX 등) 대신 실제 메뉴 이름과 "이제 무엇을 할 수 있어요" 중심으로 씁니다.
자세한 규칙은 어드민 공지 작성 화면 안내와 프로젝트 실행 지침을 따르세요.
