import { notFound } from "next/navigation";

import { CustomLayoutPreviewHarness } from "./harness";

/**
 * Dev-only isolated harness for CustomLayoutRenderer.
 *
 * 괴랄한 내신 형식 픽스처(표 선지·3칸 조합·기호 조합·서술형 조건+답란·안내문·순서배열)를
 * LayoutDoc 으로 직접 렌더해 브라우저에서 시각 검증한다. (director) 인증 게이트 밖 —
 * Playwright 가 로그인 없이 접근. 프로덕션 빌드에서는 404.
 */
export default function DevCustomLayoutPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <CustomLayoutPreviewHarness />;
}
