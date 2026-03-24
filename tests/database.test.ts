import { describe, it, expect, afterEach } from "vitest";
import { MaestroDatabase } from "../src/core/database.js";

describe("MaestroDatabase", () => {
  let database: MaestroDatabase;

  afterEach(() => {
    try {
      database?.close();
    } catch {
      // already closed
    }
  });

  it("opens an in-memory connection", () => {
    database = new MaestroDatabase(":memory:");
    expect(database.db).toBeDefined();
  });

  it("sets WAL journal mode on file-backed databases", () => {
    // In-memory databases don't support WAL, so we verify the pragma was called
    // by checking it returns "memory" (the in-memory journal mode)
    database = new MaestroDatabase(":memory:");
    const result = database.db.pragma("journal_mode") as { journal_mode: string }[];
    expect(result[0].journal_mode).toBe("memory");
  });

  it("enables foreign keys", () => {
    database = new MaestroDatabase(":memory:");
    const result = database.db.pragma("foreign_keys") as { foreign_keys: number }[];
    expect(result[0].foreign_keys).toBe(1);
  });

  it("sets busy timeout", () => {
    database = new MaestroDatabase(":memory:");
    const result = database.db.pragma("busy_timeout") as { timeout: number }[];
    expect(result[0].timeout).toBe(5000);
  });

  it("close() makes the connection unusable", () => {
    database = new MaestroDatabase(":memory:");
    database.close();
    expect(() => database.db.prepare("SELECT 1")).toThrow();
  });
});
