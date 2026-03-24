import BetterSqlite3 from "better-sqlite3";

/**
 * Shared database connection that owns a single better-sqlite3 handle.
 * All stores and repos receive this handle via dependency injection.
 */
export class MaestroDatabase {
  readonly db: BetterSqlite3.Database;

  constructor(dbPath: string) {
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
  }

  close(): void {
    this.db.close();
  }
}
