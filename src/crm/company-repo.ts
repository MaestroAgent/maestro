import type Database from "better-sqlite3";
import { randomUUID } from "crypto";

export interface Company {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  metadata: Record<string, unknown> | undefined;
  createdAt: string;
  updatedAt: string;
}

interface CompanyRow {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export class CompanyRepo {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  createCompany(data: {
    name: string;
    domain?: string;
    industry?: string;
    size?: string;
    metadata?: Record<string, unknown>;
  }): Company {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO crm_companies (id, name, domain, industry, size, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        data.name,
        data.domain ?? null,
        data.industry ?? null,
        data.size ?? null,
        data.metadata ? JSON.stringify(data.metadata) : null,
        now,
        now,
      );

    return this.getCompany(id)!;
  }

  getCompany(id: string): Company | null {
    const row = this.db
      .prepare("SELECT * FROM crm_companies WHERE id = ?")
      .get(id) as CompanyRow | undefined;

    if (!row) return null;
    return this.mapCompany(row);
  }

  searchCompanies(
    query?: string,
    limit = 20,
    offset = 0,
  ): { companies: Company[]; total: number } {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (query) {
      conditions.push("(name LIKE ? OR domain LIKE ?)");
      params.push(`%${query}%`, `%${query}%`);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const total = this.db
      .prepare(`SELECT COUNT(*) as count FROM crm_companies ${where}`)
      .get(...params) as { count: number };

    const rows = this.db
      .prepare(
        `SELECT * FROM crm_companies ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as CompanyRow[];

    return {
      companies: rows.map((r) => this.mapCompany(r)),
      total: total.count,
    };
  }

  updateCompany(
    id: string,
    updates: Partial<{
      name: string;
      domain: string;
      industry: string;
      size: string;
      metadata: Record<string, unknown>;
    }>,
  ): Company | null {
    const existing = this.getCompany(id);
    if (!existing) return null;

    const fields: string[] = ["updated_at = ?"];
    const values: unknown[] = [new Date().toISOString()];

    if (updates.name !== undefined) {
      fields.push("name = ?");
      values.push(updates.name);
    }
    if (updates.domain !== undefined) {
      fields.push("domain = ?");
      values.push(updates.domain);
    }
    if (updates.industry !== undefined) {
      fields.push("industry = ?");
      values.push(updates.industry);
    }
    if (updates.size !== undefined) {
      fields.push("size = ?");
      values.push(updates.size);
    }
    if (updates.metadata !== undefined) {
      fields.push("metadata = ?");
      values.push(JSON.stringify(updates.metadata));
    }

    values.push(id);
    this.db
      .prepare(`UPDATE crm_companies SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values);

    return this.getCompany(id);
  }

  deleteCompany(id: string): boolean {
    const result = this.db
      .prepare("DELETE FROM crm_companies WHERE id = ?")
      .run(id);
    return result.changes > 0;
  }

  private mapCompany(row: CompanyRow): Company {
    return {
      id: row.id,
      name: row.name,
      domain: row.domain,
      industry: row.industry,
      size: row.size,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
