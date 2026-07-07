-- ============================================================================
-- 스모트 학원 내부 공지(Notice/NoticeRead) 테이블 정리 — 운영(프로덕션) DB 전용
-- ============================================================================
-- 배경: 학원 내부 공지 기능을 플랫폼 공지(PlatformAnnouncement)로 교체하면서
--       Notice/NoticeRead 모델을 코드에서 제거했습니다. 아래 SQL 은 운영 DB 의
--       두 테이블을 "삭제 대신 이름 변경"으로 안전하게 물러나게 합니다(개발 DB 와
--       동일 전략, 되돌리기 가능).
--
-- ⚠️ 실행 전 반드시:
--   1) 운영 DB 의 notices / notice_reads 데이터를 먼저 백업하세요.
--      예) pg_dump -t notices -t notice_reads $PROD_DATABASE_URL > notices-prod-backup.sql
--   2) 애플리케이션 새 버전(공지 코드 제거본)이 배포된 뒤 실행하세요.
--      (구버전이 아직 notices 테이블을 조회하면 오류가 납니다.)
--
-- 되돌리기: RENAME 을 반대로 실행하면 원복됩니다.
-- 완전 삭제: 데이터가 필요 없다고 확신하면 맨 아래 DROP 블록의 주석을 해제해
--            실행하세요(비가역).
-- ============================================================================

-- FK(notice_reads → notices) 순서 무관하게 RENAME 은 안전합니다.
ALTER TABLE IF EXISTS "notice_reads" RENAME TO "notice_reads_backup_20260707";
ALTER TABLE IF EXISTS "notices"      RENAME TO "notices_backup_20260707";

-- ── (선택) 완전 삭제 — 위 백업을 확인한 뒤에만 주석 해제 ──────────────────────
-- DROP TABLE IF EXISTS "notice_reads_backup_20260707";
-- DROP TABLE IF EXISTS "notices_backup_20260707";
