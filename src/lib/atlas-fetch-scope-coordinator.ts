import { AsyncLocalStorage } from "node:async_hooks";

export type AtlasFetchScopeKind = "research" | "production-assignment";

const storage = new AsyncLocalStorage<AtlasFetchScopeKind>();

export function getAtlasFetchScopeKind(): AtlasFetchScopeKind | null {
  return storage.getStore() ?? null;
}

export function runWithAtlasFetchScopeKind<T>(
  kind: AtlasFetchScopeKind,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return storage.run(kind, fn);
}

export function runOutsideAtlasFetchScopeKind<T>(
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return storage.exit(fn);
}
