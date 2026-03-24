export { initCrmSchema } from "./schema.js";

export { CompanyRepo } from "./company-repo.js";
export type { Company } from "./company-repo.js";

export { ContactRepo } from "./contact-repo.js";
export type { Contact } from "./contact-repo.js";

export { ActivityRepo } from "./activity-repo.js";
export type { Activity } from "./activity-repo.js";

export { PipelineRepo } from "./pipeline-repo.js";
export type {
  PipelineStage,
  PipelineStageSummary,
  ForecastResult,
} from "./pipeline-repo.js";

export { DealRepo } from "./deal-repo.js";
export type { Deal } from "./deal-repo.js";

import type { CompanyRepo } from "./company-repo.js";
import type { ContactRepo } from "./contact-repo.js";
import type { DealRepo } from "./deal-repo.js";
import type { ActivityRepo } from "./activity-repo.js";
import type { PipelineRepo } from "./pipeline-repo.js";

export interface CrmServices {
  companies: CompanyRepo;
  contacts: ContactRepo;
  deals: DealRepo;
  activities: ActivityRepo;
  pipeline: PipelineRepo;
}
