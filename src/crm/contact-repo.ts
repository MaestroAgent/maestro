import type Database from "better-sqlite3";
import { randomUUID } from "crypto";

export interface Contact {
  id: string;
  companyId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  source: string | null;
  metadata: Record<string, unknown> | undefined;
  createdAt: string;
  updatedAt: string;
}

interface ContactRow {
  id: string;
  company_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  source: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export class ContactRepo {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  createContact(data: {
    firstName: string;
    lastName: string;
    email?: string;
    phone?: string;
    title?: string;
    companyId?: string;
    source?: string;
    metadata?: Record<string, unknown>;
  }): Contact {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO crm_contacts (id, company_id, first_name, last_name, email, phone, title, source, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        data.companyId ?? null,
        data.firstName,
        data.lastName,
        data.email ?? null,
        data.phone ?? null,
        data.title ?? null,
        data.source ?? null,
        data.metadata ? JSON.stringify(data.metadata) : null,
        now,
        now,
      );

    return this.getContact(id)!;
  }

  getContact(id: string): Contact | null {
    const row = this.db
      .prepare("SELECT * FROM crm_contacts WHERE id = ?")
      .get(id) as ContactRow | undefined;

    if (!row) return null;
    return this.mapContact(row);
  }

  searchContacts(filters: {
    query?: string;
    companyId?: string;
    limit?: number;
    offset?: number;
  }): { contacts: Contact[]; total: number } {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;

    if (filters.query) {
      conditions.push(
        "(first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR title LIKE ?)",
      );
      const q = `%${filters.query}%`;
      params.push(q, q, q, q);
    }
    if (filters.companyId) {
      conditions.push("company_id = ?");
      params.push(filters.companyId);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const total = this.db
      .prepare(`SELECT COUNT(*) as count FROM crm_contacts ${where}`)
      .get(...params) as { count: number };

    const rows = this.db
      .prepare(
        `SELECT * FROM crm_contacts ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as ContactRow[];

    return {
      contacts: rows.map((r) => this.mapContact(r)),
      total: total.count,
    };
  }

  updateContact(
    id: string,
    updates: Partial<{
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      title: string;
      companyId: string;
      source: string;
      metadata: Record<string, unknown>;
    }>,
  ): Contact | null {
    const existing = this.getContact(id);
    if (!existing) return null;

    const fields: string[] = ["updated_at = ?"];
    const values: unknown[] = [new Date().toISOString()];

    if (updates.firstName !== undefined) {
      fields.push("first_name = ?");
      values.push(updates.firstName);
    }
    if (updates.lastName !== undefined) {
      fields.push("last_name = ?");
      values.push(updates.lastName);
    }
    if (updates.email !== undefined) {
      fields.push("email = ?");
      values.push(updates.email);
    }
    if (updates.phone !== undefined) {
      fields.push("phone = ?");
      values.push(updates.phone);
    }
    if (updates.title !== undefined) {
      fields.push("title = ?");
      values.push(updates.title);
    }
    if (updates.companyId !== undefined) {
      fields.push("company_id = ?");
      values.push(updates.companyId);
    }
    if (updates.source !== undefined) {
      fields.push("source = ?");
      values.push(updates.source);
    }
    if (updates.metadata !== undefined) {
      fields.push("metadata = ?");
      values.push(JSON.stringify(updates.metadata));
    }

    values.push(id);
    this.db
      .prepare(`UPDATE crm_contacts SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values);

    return this.getContact(id);
  }

  deleteContact(id: string): boolean {
    const result = this.db
      .prepare("DELETE FROM crm_contacts WHERE id = ?")
      .run(id);
    return result.changes > 0;
  }

  private mapContact(row: ContactRow): Contact {
    return {
      id: row.id,
      companyId: row.company_id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      phone: row.phone,
      title: row.title,
      source: row.source,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
