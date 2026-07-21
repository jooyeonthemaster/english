// @modal 슬롯 기본값 — 인터셉트되지 않은 경로(허브 자체, 학생 워크스페이스 등)에서는
// 아무것도 렌더하지 않는다. 패러렐 슬롯은 default 가 없으면 404 로 떨어지므로 필수.
export default function ModalDefault() {
  return null;
}
