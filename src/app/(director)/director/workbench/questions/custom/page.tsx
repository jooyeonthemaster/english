import { redirect } from "next/navigation";

import { getStaffSession } from "@/lib/auth";

import { CustomTypeClient } from "./custom-type-client";

// 커스텀 유형: 원본 문항을 분석해 빌트인에 없는 유형 정의를 만들고, 그 유형으로 지속 생성.
// 기본 문제 생성 엔진/동형 코드는 import 만 하고 수정하지 않는 별도 격리 기능(dev 한정).

export const dynamic = "force-dynamic";

export default async function CustomQuestionTypePage() {
  const staff = await getStaffSession();
  if (!staff) redirect("/login");

  return <CustomTypeClient academyId={staff.academyId} />;
}
