import type Database from "better-sqlite3";
import { randomUUID } from "crypto";

const DEFAULT_STAGES = [
  { name: "Lead", order: 1 },
  { name: "Qualified", order: 2 },
  { name: "Proposal", order: 3 },
  { name: "Negotiation", order: 4 },
  { name: "Closed Won", order: 5 },
  { name: "Closed Lost", order: 6 },
];

export function initCrmSchema(db: Database.Database): void {
  db.exec(`
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

  seedDefaultStages(db);
}

function seedDefaultStages(db: Database.Database): void {
  const count = db
    .prepare("SELECT COUNT(*) as count FROM crm_pipeline_stages")
    .get() as { count: number };

  if (count.count > 0) return;

  const now = new Date().toISOString();
  const stmt = db.prepare(
    "INSERT INTO crm_pipeline_stages (id, name, display_order, created_at) VALUES (?, ?, ?, ?)",
  );

  const seedAll = db.transaction(() => {
    for (const stage of DEFAULT_STAGES) {
      stmt.run(randomUUID(), stage.name, stage.order, now);
    }
  });
  seedAll();
}
