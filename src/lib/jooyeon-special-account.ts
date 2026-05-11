export const JOOYEON_LOGIN_ID = "jooyeon";
export const JOOYEON_WELCOME_STORAGE_KEY = "yshin-jooyeon-welcome-pending";

export function isJooyeonSpecialAccount(identifier?: string | null) {
  return (identifier ?? "").trim().toLowerCase() === JOOYEON_LOGIN_ID;
}
