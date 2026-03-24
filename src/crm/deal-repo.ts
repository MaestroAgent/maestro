import type Database from "better-sqlite3";
import { randomUUID } from "crypto";
import type { ActivityRepo } from "./activity-repo.js";
import type { PipelineRepo } from "./pipeline-repo.js";

export interface Deal {
  id: string;
  title: string;
  companyId: string | null;
  contactId: string | null;
  stageId: string;
  value: number | null;
  currency: string;
  expectedCloseDate: string | null;
  closedAt: string | null;
  closedWon: boolean | null;
  lostReason: string | null;
  metadata: Record<string, unknown> | undefined;
  createdAt: string;
  updatedAt: string;
}

interface DealRow {
  id: string;
  title: string;
  company_id: string | null;
  contact_id: string | null;
  stage_id: string;
  value: number | null;
  currency: string;
  expected_close_date: string | null;
  closed_at: string | null;
  closed_won: number | null;
  lost_reason: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export class DealRepo {
  private db: Database.Database;
  private activityRepo: ActivityRepo;
  private pipelineRepo: PipelineRepo;

  constructor(
    db: Database.Database,
    activityRepo: ActivityRepo,
    pipelineRepo: PipelineRepo,
  ) {
    this.db = db;
    this.activityRepo = activityRepo;
    this.pipelineRepo = pipelineRepo;
  }

  createDeal(data: {
    title: string;
    stageId: string;
    companyId?: string;
    contactId?: string;
    value?: number;
    currency?: string;
    expectedCloseDate?: string;
    metadata?: Record<string, unknown>;
  }): Deal {
    const id = randomUUID();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO crm_deals (id, title, company_id, contact_id, stage_id, value, currency, expected_close_date, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        data.title,
        data.companyId ?? null,
        data.contactId ?? null,
        data.stageId,
        data.value ?? null,
        data.currency ?? "USD",
        data.expectedCloseDate ?? null,
        data.metadata ? JSON.stringify(data.metadata) : null,
        now,
        now,
      );

    return this.getDeal(id)!;
  }

  getDeal(id: string): Deal | null {
    const row = this.db
      .prepare("SELECT * FROM crm_deals WHERE id = ?")
      .get(id) as DealRow | undefined;

    if (!row) return null;
    return this.mapDeal(row);
  }

  searchDeals(filters: {
    query?: string;
    stageId?: string;
    companyId?: string;
    contactId?: string;
    closedWon?: boolean;
    limit?: number;
    offset?: number;
  }): { deals: Deal[]; total: number } {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;

    if (filters.query) {
      conditions.push("(d.title LIKE ?)");
      params.push(`%${filters.query}%`);
    }
    if (filters.stageId) {
      conditions.push("d.stage_id = ?");
      params.push(filters.stageId);
    }
    if (filters.companyId) {
      conditions.push("d.company_id = ?");
      params.push(filters.companyId);
    }
    if (filters.contactId) {
      conditions.push("d.contact_id = ?");
      params.push(filters.contactId);
    }
    if (filters.closedWon !== undefined) {
      conditions.push("d.closed_won = ?");
      params.push(filters.closedWon ? 1 : 0);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const total = this.db
      .prepare(`SELECT COUNT(*) as count FROM crm_deals d ${where}`)
      .get(...params) as { count: number };

    const rows = this.db
      .prepare(
        `SELECT d.* FROM crm_deals d ${where} ORDER BY d.updated_at DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as DealRow[];

    return {
      deals: rows.map((r) => this.mapDeal(r)),
      total: total.count,
    };
  }

  updateDeal(
    id: string,
    updates: Partial<{
      title: string;
      companyId: string;
      contactId: string;
      value: number;
      currency: string;
      expectedCloseDate: string;
      metadata: Record<string, unknown>;
    }>,
  ): Deal | null {
    const existing = this.getDeal(id);
    if (!existing) return null;

    const fields: string[] = ["updated_at = ?"];
    const values: unknown[] = [new Date().toISOString()];

    if (updates.title !== undefined) {
      fields.push("title = ?");
      values.push(updates.title);
    }
    if (updates.companyId !== undefined) {
      fields.push("company_id = ?");
      values.push(updates.companyId);
    }
    if (updates.contactId !== undefined) {
      fields.push("contact_id = ?");
      values.push(updates.contactId);
    }
    if (updates.value !== undefined) {
      fields.push("value = ?");
      values.push(updates.value);
    }
    if (updates.currency !== undefined) {
      fields.push("currency = ?");
      values.push(updates.currency);
    }
    if (updates.expectedCloseDate !== undefined) {
      fields.push("expected_close_date = ?");
      values.push(updates.expectedCloseDate);
    }
    if (updates.metadata !== undefined) {
      fields.push("metadata = ?");
      values.push(JSON.stringify(updates.metadata));
    }

    values.push(id);
    this.db
      .prepare(`UPDATE crm_deals SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values);

    return this.getDeal(id);
  }

  moveDealStage(id: string, stageId: string): Deal | null {
    const deal = this.getDeal(id);
    if (!deal) return null;

    const oldStage = this.db
      .prepare("SELECT name FROM crm_pipeline_stages WHERE id = ?")
      .get(deal.stageId) as { name: string } | undefined;

    const newStage = this.db
      .prepare("SELECT name FROM crm_pipeline_stages WHERE id = ?")
      .get(stageId) as { name: string } | undefined;

    if (!newStage) return null;

    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE crm_deals SET stage_id = ?, updated_at = ? WHERE id = ?")
      .run(stageId, now, id);

    this.activityRepo.logActivity({
      type: "note",
      subject: "Stage changed",
      description: `Deal moved from "${oldStage?.name ?? "unknown"}" to "${newStage.name}"`,
      dealId: id,
      companyId: deal.companyId ?? undefined,
      contactId: deal.contactId ?? undefined,
      createdBy: "system",
    });

    return this.getDeal(id);
  }

  closeDeal(id: string, won: boolean, lostReason?: string): Deal | null {
    const deal = this.getDeal(id);
    if (!deal) return null;

    const now = new Date().toISOString();

    const closeStageName = won ? "Closed Won" : "Closed Lost";
    const closeStage = this.pipelineRepo.getStageByName(closeStageName);

    const fields = ["closed_at = ?", "closed_won = ?", "updated_at = ?"];
    const values: unknown[] = [now, won ? 1 : 0, now];

    if (closeStage) {
      fields.push("stage_id = ?");
      values.push(closeStage.id);
    }

    if (!won && lostReason) {
      fields.push("lost_reason = ?");
      values.push(lostReason);
    }

    values.push(id);
    this.db
      .prepare(`UPDATE crm_deals SET ${fields.join(", ")} WHERE id = ?`)
      .run(...values);

    this.activityRepo.logActivity({
      type: "note",
      subject: won ? "Deal won" : "Deal lost",
      description: won
        ? `Deal closed as won${deal.value ? ` ($${deal.value})` : ""}`
        : `Deal closed as lost${lostReason ? `: ${lostReason}` : ""}`,
      dealId: id,
      companyId: deal.companyId ?? undefined,
      contactId: deal.contactId ?? undefined,
      createdBy: "system",
    });

    return this.getDeal(id);
  }

  deleteDeal(id: string): boolean {
    const result = this.db
      .prepare("DELETE FROM crm_deals WHERE id = ?")
      .run(id);
    return result.changes > 0;
  }

  private mapDeal(row: DealRow): Deal {
    return {
      id: row.id,
      title: row.title,
      companyId: row.company_id,
      contactId: row.contact_id,
      stageId: row.stage_id,
      value: row.value,
      currency: row.currency,
      expectedCloseDate: row.expected_close_date,
      closedAt: row.closed_at,
      closedWon: row.closed_won === null ? null : row.closed_won === 1,
      lostReason: row.lost_reason,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
