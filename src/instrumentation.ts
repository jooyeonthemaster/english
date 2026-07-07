/**
 * Next.js instrumentation — 서버 프로세스 시작(콜드스타트)마다 실행된다.
 *
 * 프로덕션 배포에서만, release-notes/ 의 릴리즈 노트를 플랫폼 공지로 자동 발행한다.
 * releaseSlug 유니크 제약으로 멱등하므로 콜드스타트마다 실행돼도 중복이 없다.
 */
export async function register() {
  // Edge 런타임에는 fs/prisma 가 없으므로 Node 런타임에서만.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // 로컬/프리뷰가 공용 DB 에 소급 발행하지 않도록 프로덕션 배포에서만.
  if (process.env.VERCEL_ENV !== "production") return;

  try {
    const { publishReleaseNotes } = await import(
      "@/lib/announcements/publish-release-notes"
    );
    const result = await publishReleaseNotes();
    if (result.created > 0) {
      console.log(
        `[release-notes] 자동 발행 ${result.created}건:`,
        result.createdSlugs.join(", "),
      );
    }
  } catch (err) {
    // 자동 발행 실패가 앱 부팅을 막지 않도록 로깅만.
    console.error("[release-notes] 자동 발행 실패:", err);
  }
}
