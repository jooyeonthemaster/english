# 학원 내부 공지(Notice) 은퇴 백업

학원 내부 공지(`Notice`/`NoticeRead`) 기능을 플랫폼 공지(`PlatformAnnouncement`,
"스모트 소식")로 교체하면서 두 테이블을 **삭제 대신 이름 변경**으로 보존했습니다.

## 개발(dev) DB — 이미 적용됨
- `notices` → `notices_backup_20260707`
- `notice_reads` → `notice_reads_backup_20260707`
- 로컬 안전 사본(덤프): `notices-backup-20260707.json` / `.sql`
  (실제 공지 본문을 담고 있어 git 에는 올리지 않음 — `.gitignore` 참고)

## 운영(production) DB — 사용자가 직접 실행
1. 먼저 백업: `pg_dump -t notices -t notice_reads $PROD_DATABASE_URL > notices-prod-backup.sql`
2. 공지 제거 코드가 배포된 **뒤**, [`retire-notices-prod.sql`](./retire-notices-prod.sql) 실행
   (기본은 되돌리기 가능한 rename. 완전 삭제 DROP 은 파일 하단 주석 해제.)

## 복원
- rename 원복: `ALTER TABLE ... RENAME TO ...` 를 반대로.
- 데이터 재삽입: `notices-backup-<date>.sql` 의 INSERT 문 실행.
