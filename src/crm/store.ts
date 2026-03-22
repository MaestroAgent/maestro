import Database from "better-sqlite3";
import { randomUUID } from "crypto";

// --- Types ---

export interface CrmStoreOptions {
  dbPath?: string;
}

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

export interface PipelineStage {
  id: string;
  name: string;
  displayOrder: number;
  createdAt: string;
}

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

export interface PipelineStageSummary {
  stageId: string;
  stageName: string;
  displayOrder: number;
  dealCount: number;
  totalValue: number;
  avgValue: number;
}

export interface ForecastResult {
  period: string;
  startDate: string;
  endDate: string;
  stages: Array<{
    stageName: string;
    dealCount: number;
    totalValue: number;
  }>;
  totalDeals: number;
  totalValue: number;
}

// --- DB row types ---

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

interface StageRow {
  id: string;
  name: string;
  display_order: number;
  created_at: string;
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

// --- Store ---

const DEFAULT_STAGES = [
  { name: "Lead", order: 1 },
  { name: "Qualified", order: 2 },
  { name: "Proposal", order: 3 },
  { name: "Negotiation", order: 4 },
  { name: "Closed Won", order: 5 },
  { name: "Closed Lost", order: 6 },
];

export class CrmStore {
  private db: Database.Database;

  constructor(options: CrmStoreOptions = {}) {
    const dbPath = options.dbPath ?? "./data/maestro.db";
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS crm_companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        domain TEXT,
        industry TEXT,
        size TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_crm_companies_name ON crm_companies(name);
      CREATE INDEX IF NOT EXISTS idx_crm_companies_domain ON crm_companies(domain);

      CREATE TABLE IF NOT EXISTS crm_contacts (
        id TEXT PRIMARY KEY,
        company_id TEXT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        title TEXT,
        source TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (company_id) REFERENCES crm_companies(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_crm_contacts_email ON crm_contacts(email);
      CREATE INDEX IF NOT EXISTS idx_crm_contacts_company ON crm_contacts(company_id);
      CREATE INDEX IF NOT EXISTS idx_crm_contacts_name ON crm_contacts(last_name, first_name);

      CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        display_order INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS crm_deals (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        company_id TEXT,
        contact_id TEXT,
        stage_id TEXT NOT NULL,
        value REAL,
        currency TEXT NOT NULL DEFAULT 'USD',
        expected_close_date TEXT,
        closed_at TEXT,
        closed_won INTEGER,
        lost_reason TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (company_id) REFERENCES crm_companies(id) ON DELETE SET NULL,
        FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE SET NULL,
        FOREIGN KEY (stage_id) REFERENCES crm_pipeline_stages(id)
      );
      CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON crm_deals(stage_id);
      CREATE INDEX IF NOT EXISTS idx_crm_deals_company ON crm_deals(company_id);
      CREATE INDEX IF NOT EXISTS idx_crm_deals_contact ON crm_deals(contact_id);

      CREATE TABLE IF NOT EXISTS crm_activities (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        subject TEXT,
        description TEXT,
        contact_id TEXT,
        company_id TEXT,
        deal_id TEXT,
        due_date TEXT,
        completed_at TEXT,
        created_by TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE SET NULL,
        FOREIGN KEY (company_id) REFERENCES crm_companies(id) ON DELETE SET NULL,
        FOREIGN KEY (deal_id) REFERENCES crm_deals(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_crm_activities_contact ON crm_activities(contact_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_crm_activities_deal ON crm_activities(deal_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_crm_activities_type ON crm_activities(type, created_at);
    `);

    this.seedDefaultStages();
  }

  private seedDefaultStages(): void {
    const count = this.db
      .prepare("SELECT COUNT(*) as count FROM crm_pipeline_stages")
      .get() as { count: number };

    if (count.count > 0) return;

    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      "INSERT INTO crm_pipeline_stages (id, name, display_order, created_at) VALUES (?, ?, ?, ?)"
    );

    const seedAll = this.db.transaction(() => {
      for (const stage of DEFAULT_STAGES) {
        stmt.run(randomUUID(), stage.name, stage.order, now);
      }
    });
    seedAll();
  }

  // --- Companies ---

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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        data.name,
        data.domain ?? null,
        data.industry ?? null,
        data.size ?? null,
        data.metadata ? JSON.stringify(data.metadata) : null,
        now,
        now
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
    offset = 0
  ): { companies: Company[]; total: number } {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (query) {
      conditions.push("(name LIKE ? OR domain LIKE ?)");
      params.push(`%${query}%`, `%${query}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const total = this.db
      .prepare(`SELECT COUNT(*) as count FROM crm_companies ${where}`)
      .get(...params) as { count: number };

    const rows = this.db
      .prepare(
        `SELECT * FROM crm_companies ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as CompanyRow[];

    return { companies: rows.map((r) => this.mapCompany(r)), total: total.count };
  }

  updateCompany(
    id: string,
    updates: Partial<{
      name: string;
      domain: string;
      industry: string;
      size: string;
      metadata: Record<string, unknown>;
    }>
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

  // --- Contacts ---

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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        now
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
        "(first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR title LIKE ?)"
      );
      const q = `%${filters.query}%`;
      params.push(q, q, q, q);
    }
    if (filters.companyId) {
      conditions.push("company_id = ?");
      params.push(filters.companyId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const total = this.db
      .prepare(`SELECT COUNT(*) as count FROM crm_contacts ${where}`)
      .get(...params) as { count: number };

    const rows = this.db
      .prepare(
        `SELECT * FROM crm_contacts ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as ContactRow[];

    return { contacts: rows.map((r) => this.mapContact(r)), total: total.count };
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
    }>
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

  // --- Pipeline Stages ---

  getStages(): PipelineStage[] {
    const rows = this.db
      .prepare("SELECT * FROM crm_pipeline_stages ORDER BY display_order")
      .all() as StageRow[];

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      displayOrder: r.display_order,
      createdAt: r.created_at,
    }));
  }

  getStageByName(name: string): PipelineStage | null {
    const row = this.db
      .prepare("SELECT * FROM crm_pipeline_stages WHERE name = ?")
      .get(name) as StageRow | undefined;

    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      displayOrder: row.display_order,
      createdAt: row.created_at,
    };
  }

  // --- Deals ---

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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        now
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

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const total = this.db
      .prepare(`SELECT COUNT(*) as count FROM crm_deals d ${where}`)
      .get(...params) as { count: number };

    const rows = this.db
      .prepare(
        `SELECT d.* FROM crm_deals d ${where} ORDER BY d.updated_at DESC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as DealRow[];

    return { deals: rows.map((r) => this.mapDeal(r)), total: total.count };
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
    }>
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

    // Auto-log the stage change as an activity
    this.logActivity({
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

    // Move to appropriate close stage
    const closeStageName = won ? "Closed Won" : "Closed Lost";
    const closeStage = this.getStageByName(closeStageName);

    const fields = [
      "closed_at = ?",
      "closed_won = ?",
      "updated_at = ?",
    ];
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

    // Log the close as an activity
    this.logActivity({
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

  // --- Activities ---

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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        now
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

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const total = this.db
      .prepare(`SELECT COUNT(*) as count FROM crm_activities ${where}`)
      .get(...params) as { count: number };

    const rows = this.db
      .prepare(
        `SELECT * FROM crm_activities ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as ActivityRow[];

    return { activities: rows.map((r) => this.mapActivity(r)), total: total.count };
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

  // --- Pipeline Analytics ---

  getPipelineSummary(): PipelineStageSummary[] {
    const rows = this.db
      .prepare(
        `SELECT
          s.id as stage_id,
          s.name as stage_name,
          s.display_order,
          COUNT(d.id) as deal_count,
          COALESCE(SUM(d.value), 0) as total_value,
          COALESCE(AVG(d.value), 0) as avg_value
        FROM crm_pipeline_stages s
        LEFT JOIN crm_deals d ON d.stage_id = s.id AND d.closed_won IS NULL
        GROUP BY s.id
        ORDER BY s.display_order`
      )
      .all() as Array<{
      stage_id: string;
      stage_name: string;
      display_order: number;
      deal_count: number;
      total_value: number;
      avg_value: number;
    }>;

    return rows.map((r) => ({
      stageId: r.stage_id,
      stageName: r.stage_name,
      displayOrder: r.display_order,
      dealCount: r.deal_count,
      totalValue: r.total_value,
      avgValue: r.avg_value,
    }));
  }

  getDealForecast(period: string): ForecastResult {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (period) {
      case "this_month":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case "next_month":
        startDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 2, 0);
        break;
      case "this_quarter": {
        const quarterStart = Math.floor(now.getMonth() / 3) * 3;
        startDate = new Date(now.getFullYear(), quarterStart, 1);
        endDate = new Date(now.getFullYear(), quarterStart + 3, 0);
        break;
      }
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    const startStr = startDate.toISOString().split("T")[0];
    const endStr = endDate.toISOString().split("T")[0];

    const rows = this.db
      .prepare(
        `SELECT
          s.name as stage_name,
          COUNT(d.id) as deal_count,
          COALESCE(SUM(d.value), 0) as total_value
        FROM crm_deals d
        JOIN crm_pipeline_stages s ON d.stage_id = s.id
        WHERE d.closed_won IS NULL
          AND d.expected_close_date >= ?
          AND d.expected_close_date <= ?
        GROUP BY s.id
        ORDER BY s.display_order`
      )
      .all(startStr, endStr) as Array<{
      stage_name: string;
      deal_count: number;
      total_value: number;
    }>;

    const totalDeals = rows.reduce((sum, r) => sum + r.deal_count, 0);
    const totalValue = rows.reduce((sum, r) => sum + r.total_value, 0);

    return {
      period,
      startDate: startStr,
      endDate: endStr,
      stages: rows.map((r) => ({
        stageName: r.stage_name,
        dealCount: r.deal_count,
        totalValue: r.total_value,
      })),
      totalDeals,
      totalValue,
    };
  }

  close(): void {
    this.db.close();
  }
}

// --- Singleton ---

let crmStore: CrmStore | null = null;

export function initCrmStore(options: CrmStoreOptions): CrmStore {
  if (crmStore) {
    crmStore.close();
  }
  crmStore = new CrmStore(options);
  return crmStore;
}

export function getCrmStore(): CrmStore | null {
  return crmStore;
}
