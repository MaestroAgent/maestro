import type Database from "better-sqlite3";
import { randomUUID } from "crypto";

export interface Activity {
  id: string;
  type: string;
  subject: string | null;
  description: string | null;
  contactId: string | null;
  companyId: string | null;
  dealId: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdBy: string | null;
  metadata: Record<string, unknown> | undefined;
  createdAt: string;
}

interface ActivityRow {
  id: string;
  type: string;
  subject: string | null;
  description: string | null;
  contact_id: string | null;
  company_id: string | null;
  deal_id: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_by: string | null;
  metadata: string | null;
  created_at: string;
}

export class ActivityRepo {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  logActivity(data: {
    type: string;
    subject?: string;
    description?: string;
    contactId?: string;
    companyId?: string;
    dealId?: string;
    dueDate?: string;
    createdBy?: string;
    metadata?: Record<string, unknown>;
  }): Activity {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO crm_activities (id, type, subject, description, contact_id, company_id, deal_id, due_date, created_by, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        data.type,
        data.subject ?? null,
        data.description ?? null,
        data.contactId ?? null,
        data.companyId ?? null,
        data.dealId ?? null,
        data.dueDate ?? null,
        data.createdBy ?? null,
        data.metadata ? JSON.stringify(data.metadata) : null,
        now,
      );

    return this.getActivity(id)!;
  }

  getActivity(id: string): Activity | null {
    const row = this.db
      .prepare("SELECT * FROM crm_activities WHERE id = ?")
      .get(id) as ActivityRow | undefined;

    if (!row) return null;
    return this.mapActivity(row);
  }

  listActivities(filters: {
    contactId?: string;
    companyId?: string;
    dealId?: string;
    type?: string;
    limit?: number;
    offset?: number;
  }): { activities: Activity[]; total: number } {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;

    if (filters.contactId) {
      conditions.push("contact_id = ?");
      params.push(filters.contactId);
    }
    if (filters.companyId) {
      conditions.push("company_id = ?");
      params.push(filters.companyId);
    }
    if (filters.dealId) {
      conditions.push("deal_id = ?");
      params.push(filters.dealId);
    }
    if (filters.type) {
      conditions.push("type = ?");
      params.push(filters.type);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const total = this.db
      .prepare(`SELECT COUNT(*) as count FROM crm_activities ${where}`)
      .get(...params) as { count: number };

    const rows = this.db
      .prepare(
        `SELECT * FROM crm_activities ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as ActivityRow[];

    return {
      activities: rows.map((r) => this.mapActivity(r)),
      total: total.count,
    };
  }

  completeActivity(id: string): Activity | null {
    const existing = this.getActivity(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE crm_activities SET completed_at = ? WHERE id = ?")
      .run(now, id);

    return this.getActivity(id);
  }

  private mapActivity(row: ActivityRow): Activity {
    return {
      id: row.id,
      type: row.type,
      subject: row.subject,
      description: row.description,
      contactId: row.contact_id,
      companyId: row.company_id,
      dealId: row.deal_id,
      dueDate: row.due_date,
      completedAt: row.completed_at,
      createdBy: row.created_by,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
    };
  }
}
