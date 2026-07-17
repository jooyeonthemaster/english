export const AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V6 = true as const;

/**
 * This package can never dispatch. Opening execution requires a separately
 * named directory, newly built bundles, a new subject manifest, and a pinned
 * independent-audit manifest; editing protocol JSON cannot open this gate.
 */
export function assertAuthorFreezePermanentlyNoDispatchV6(): void {
  if (AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V6) {
    throw new Error("AUTHOR_FREEZE_PERMANENTLY_NO_DISPATCH_V6: use a separately audited authorization package");
  }
  throw new Error("unreachable v6 author-freeze gate state");
}
