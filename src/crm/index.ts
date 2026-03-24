export { CrmStore, initCrmStore, getCrmStore } from "./store.js";
export type { CrmStoreOptions, Deal } from "./store.js";

export { initCrmSchema } from "./schema.js";

import { CompanyRepo } from "./company-repo.js";
export { CompanyRepo } from "./company-repo.js";
export type { Company } from "./company-repo.js";

import { ContactRepo } from "./contact-repo.js";
export { ContactRepo } from "./contact-repo.js";
export type { Contact } from "./contact-repo.js";

import { ActivityRepo } from "./activity-repo.js";
export { ActivityRepo } from "./activity-repo.js";
export type { Activity } from "./activity-repo.js";

import { PipelineRepo } from "./pipeline-repo.js";
export { PipelineRepo } from "./pipeline-repo.js";
export type {
  PipelineStage,
  PipelineStageSummary,
  ForecastResult,
} from "./pipeline-repo.js";

export interface DealRepo {
  createDeal: (...args: unknown[]) => unknown;
}

export interface CrmServices {
  companies: CompanyRepo;
  contacts: ContactRepo;
  deals: DealRepo;
  activities: ActivityRepo;
  pipeline: PipelineRepo;
}
