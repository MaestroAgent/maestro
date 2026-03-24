import type Database from "better-sqlite3";

export interface PipelineStage {
  id: string;
  name: string;
  displayOrder: number;
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

interface StageRow {
  id: string;
  name: string;
  display_order: number;
  created_at: string;
}

export class PipelineRepo {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  getStages(): PipelineStage[] {
    const rows = this.db
      .prepare("SELECT * FROM crm_pipeline_stages ORDER BY display_order")
      .all() as StageRow[];

    return rows.map((r) => this.mapStage(r));
  }

  getStageByName(name: string): PipelineStage | null {
    const row = this.db
      .prepare("SELECT * FROM crm_pipeline_stages WHERE name = ?")
      .get(name) as StageRow | undefined;

    if (!row) return null;
    return this.mapStage(row);
  }

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
        ORDER BY s.display_order`,
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
        ORDER BY s.display_order`,
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

  private mapStage(row: StageRow): PipelineStage {
    return {
      id: row.id,
      name: row.name,
      displayOrder: row.display_order,
      createdAt: row.created_at,
    };
  }
}
