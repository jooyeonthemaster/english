/**
 * Mask the middle of an IP address for display on the device-management screen.
 * IPv4 "211.36.21.18" → "211.36.···.18". Unknown/placeholder IPs return a label.
 */
export function maskIp(ip: string | null | undefined): string {
  if (!ip || ip === "0.0.0.0" || ip.toLowerCase() === "unknown") {
    return "IP 확인 안 됨";
  }

  const v4 = ip.split(".");
  if (v4.length === 4 && v4.every((p) => /^\d+$/.test(p))) {
    return `${v4[0]}.${v4[1]}.···.${v4[3]}`;
  }

  if (ip.includes(":")) {
    // IPv6 — keep only the first hextet (rough network hint), mask the rest so
    // the interface identifier (which can fingerprint a device) isn't exposed.
    const first = ip.split(":").find((g) => g.length > 0);
    return first ? `${first}:···` : "IP 확인 안 됨";
  }

  return ip;
}
