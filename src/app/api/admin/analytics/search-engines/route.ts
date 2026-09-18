import { analyticsGet } from "@/lib/analytics/admin-route";
import { getAdminSession } from "@/lib/auth-admin";
import { getSearchEnginesReport } from "@/lib/analytics/reports/search-engines";

export const dynamic = "force-dynamic";

// 외부(GSC) 호출 결과는 모듈 메모리 캐시 10분. ?refresh=1 이면 캐시를 무시하고 다시 검사한다.
// GSC 원본 진단(업스트림 원문·서비스 계정 이메일·env 키 이름)은 SUPER_ADMIN 응답에만 싣는다(SEC-10).
export const GET = analyticsGet(async (_q, sp) => {
  const session = await getAdminSession();
  return getSearchEnginesReport({
    refresh: sp.get("refresh") === "1",
    includeDebug: session?.role === "SUPER_ADMIN",
  });
});
