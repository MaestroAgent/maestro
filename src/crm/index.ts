export { CrmStore, initCrmStore, getCrmStore } from "./store.js";
export type {
  CrmStoreOptions,
  Company,
  Contact,
  PipelineStage,
  Deal,
  Activity,
  PipelineStageSummary,
  ForecastResult,
} from "./store.js";

export { initCrmSchema } from "./schema.js";

// Placeholder types until individual repo classes are created
export interface CompanyRepo {
  createCompany: (...args: unknown[]) => unknown;
}
export interface ContactRepo {
  createContact: (...args: unknown[]) => unknown;
}
export interface DealRepo {
  createDeal: (...args: unknown[]) => unknown;
}
export interface ActivityRepo {
  logActivity: (...args: unknown[]) => unknown;
}
export interface PipelineRepo {
  getStages: (...args: unknown[]) => unknown;
}

export interface CrmServices {
  companies: CompanyRepo;
  contacts: ContactRepo;
  deals: DealRepo;
  activities: ActivityRepo;
  pipeline: PipelineRepo;
}
