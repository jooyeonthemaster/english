declare module "node:sqlite" {
  export type SQLInputValue = null | number | bigint | string | Uint8Array;

  export interface RunResult {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  export class StatementSync {
    all(...anonymousParameters: SQLInputValue[]): Array<Record<string, unknown>>;
    get(...anonymousParameters: SQLInputValue[]): Record<string, unknown> | undefined;
    run(...anonymousParameters: SQLInputValue[]): RunResult;
  }

  export class DatabaseSync {
    constructor(path: string);
    close(): void;
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
  }

  export function backup(
    sourceDb: DatabaseSync,
    path: string,
    options?: { rate?: number; progress?: (info: { totalPages: number; remainingPages: number }) => void },
  ): Promise<void>;
}
