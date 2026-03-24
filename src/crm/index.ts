export { CrmStore, initCrmStore, getCrmStore } from "./store.js";
export type {
  CrmStoreOptions,
  PipelineStage,
  Deal,
  Activity,
  PipelineStageSummary,
  ForecastResult,
} from "./store.js";

export { initCrmSchema } from "./schema.js";

import { CompanyRepo } from "./company-repo.js";
export { CompanyRepo } from "./company-repo.js";
export type { Company } from "./company-repo.js";

import { ContactRepo } from "./contact-repo.js";
export { ContactRepo } from "./contact-repo.js";
export type { Contact } from "./contact-repo.js";
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
