/**
 * 카드(PG) 크레딧 충전 허용 계정 게이팅.
 *
 * env `CARD_TOPUP_ALLOWED` 에 콤마로 구분된 학원ID 또는 이메일을 넣으면 해당
 * 계정에서만 카드 결제수단이 활성화된다. `"*"` 이면 전체 허용, 미설정이면 전체
 * 비활성화(무통장입금만 노출)된다.
 */
export function isCardTopUpAllowed(params: {
  academyId: string;
  email?: string | null;
}): boolean {
  const raw = process.env.CARD_TOPUP_ALLOWED?.trim();
  if (!raw) return false; // 기본: 카드(PG) 결제 비활성화
  if (raw === "*") return true;

  const allowed = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const academyId = params.academyId.trim().toLowerCase();
  const email = params.email?.trim().toLowerCase() ?? "";

  return (
    (academyId !== "" && allowed.includes(academyId)) ||
    (email !== "" && allowed.includes(email))
  );
}
