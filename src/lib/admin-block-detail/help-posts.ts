import { prisma } from "@/lib/prisma";
import type { AdminDetail } from "@/lib/admin-detail-types";
import { detailFields } from "@/lib/admin-detail-types";
import { boardCategories, boardStatuses, labelOf, type HelpBoard } from "@/lib/help-center";
import { kstDateTime } from "@/lib/admin-dashboard-detail/format";

// 헬프센터(피드백·고객지원) 게시판 목록 행 호버 상세. 목록 조회엔 본문이 없어서
// 호버 시 글 하나만 지연 조회한다. 비밀글도 관리자 상세 화면과 같은 범위로 보여주되
// passwordHash 는 절대 select 하지 않는다. 조회만 하며 조회수·읽음 표시는 건드리지 않는다.

const PREVIEW_MAX = 400;

/** HTML 태그·마크다운 기호를 걷어낸 본문 앞부분. */
function bodyPreview(content: string): string {
  const plain = content
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map((l) =>
      l
        .replace(/^#{1,6}\s+/, "")
        .replace(/^\s*[-*•]\s+/, "· ")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "[이미지]")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/\*\*|__|`/g, "")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
  if (!plain) return "(본문 없음)";
  return plain.length > PREVIEW_MAX ? `${plain.slice(0, PREVIEW_MAX)}…` : plain;
}

export async function helpPostHoverDetail(postId: string): Promise<AdminDetail> {
  const post = await prisma.helpPost.findUnique({
    where: { id: postId },
    select: {
      id: true,
      board: true,
      academyId: true,
      authorName: true,
      category: true,
      title: true,
      content: true,
      status: true,
      isPrivate: true,
      isPinned: true,
      viewCount: true,
      upvoteCount: true,
      attachments: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { replies: true } },
      replies: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { authorName: true, authorRole: true, isOfficial: true, createdAt: true },
      },
    },
  });
  if (!post) {
    return { title: "글을 찾을 수 없습니다", fields: [{ label: "안내", value: "삭제되었거나 존재하지 않는 글입니다." }] };
  }

  const board = post.board as HelpBoard;
  const academy = post.academyId
    ? await prisma.academy.findUnique({ where: { id: post.academyId }, select: { name: true } })
    : null;
  const last = post.replies[0];
  const attachmentCount = Array.isArray(post.attachments) ? post.attachments.length : 0;
  const statusLabel = labelOf(boardStatuses(board), post.status);

  return {
    title: post.title,
    subtitle: `${labelOf(boardCategories(board), post.category)} · ${statusLabel}`,
    fields: detailFields([
      ["본문 미리보기", bodyPreview(post.content), true],
      ["상태", statusLabel],
      ["분류", labelOf(boardCategories(board), post.category)],
      ["작성자", post.authorName],
      ["학원", post.academyId ? (academy?.name ?? "(삭제된 학원)") : null],
      ["공개 범위", post.isPrivate ? "비밀글" : "공개"],
      ["상단 고정", post.isPinned && "고정됨"],
      ["답글 수", `${post._count.replies}개`],
      [
        "최근 답글",
        last &&
          `${kstDateTime(last.createdAt)} · ${last.authorName}${last.isOfficial ? " (공식 답변)" : last.authorRole === "ADMIN" ? " (운영자)" : ""}`,
      ],
      ["공감", board === "FEEDBACK" && `${post.upvoteCount}`],
      ["조회수", `${post.viewCount}`],
      ["첨부", attachmentCount > 0 && `${attachmentCount}개`],
      ["작성", kstDateTime(post.createdAt)],
      ["최근 수정", kstDateTime(post.updatedAt)],
    ]),
  };
}
