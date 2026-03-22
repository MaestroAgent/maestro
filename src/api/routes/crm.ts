import { Hono } from "hono";
import { CrmStore } from "../../crm/index.js";

// Pagination bounds
const MIN_LIMIT = 1;
const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 50;

function boundPagination(
  limitStr: string | undefined,
  offsetStr: string | undefined
): { limit: number; offset: number } {
  const limit = Math.min(
    Math.max(
      parseInt(limitStr ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
      MIN_LIMIT
    ),
    MAX_LIMIT
  );
  const offset = Math.max(parseInt(offsetStr ?? "0", 10) || 0, 0);
  return { limit, offset };
}

export interface CrmRoutesOptions {
  crmStore: CrmStore;
}

export function createCrmRoutes(options: CrmRoutesOptions): Hono {
  const app = new Hono();
  const { crmStore } = options;

  // --- Companies ---

  app.post("/companies", async (c) => {
    const body = await c.req.json();
    if (!body.name) {
      return c.json({ error: "name is required" }, 400);
    }
    const company = crmStore.createCompany({
      name: body.name,
      domain: body.domain,
      industry: body.industry,
      size: body.size,
      metadata: body.metadata,
    });
    return c.json(company, 201);
  });

  app.get("/companies", async (c) => {
    const { limit, offset } = boundPagination(
      c.req.query("limit"),
      c.req.query("offset")
    );
    const q = c.req.query("q");
    const result = crmStore.searchCompanies(q, limit, offset);
    return c.json({
      companies: result.companies,
      pagination: {
        limit,
        offset,
        total: result.total,
        hasMore: offset + result.companies.length < result.total,
      },
    });
  });

  app.get("/companies/:id", async (c) => {
    const company = crmStore.getCompany(c.req.param("id"));
    if (!company) return c.json({ error: "Company not found" }, 404);
    return c.json(company);
  });

  app.put("/companies/:id", async (c) => {
    const body = await c.req.json();
    const company = crmStore.updateCompany(c.req.param("id"), body);
    if (!company) return c.json({ error: "Company not found" }, 404);
    return c.json(company);
  });

  app.delete("/companies/:id", async (c) => {
    const deleted = crmStore.deleteCompany(c.req.param("id"));
    if (!deleted) return c.json({ error: "Company not found" }, 404);
    return c.json({ success: true });
  });

  // --- Contacts ---

  app.post("/contacts", async (c) => {
    const body = await c.req.json();
    if (!body.firstName || !body.lastName) {
      return c.json({ error: "firstName and lastName are required" }, 400);
    }
    const contact = crmStore.createContact({
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      phone: body.phone,
      title: body.title,
      companyId: body.companyId,
      source: body.source,
      metadata: body.metadata,
    });
    return c.json(contact, 201);
  });

  app.get("/contacts", async (c) => {
    const { limit, offset } = boundPagination(
      c.req.query("limit"),
      c.req.query("offset")
    );
    const result = crmStore.searchContacts({
      query: c.req.query("q"),
      companyId: c.req.query("company_id"),
      limit,
      offset,
    });
    return c.json({
      contacts: result.contacts,
      pagination: {
        limit,
        offset,
        total: result.total,
        hasMore: offset + result.contacts.length < result.total,
      },
    });
  });

  app.get("/contacts/:id", async (c) => {
    const contact = crmStore.getContact(c.req.param("id"));
    if (!contact) return c.json({ error: "Contact not found" }, 404);
    return c.json(contact);
  });

  app.put("/contacts/:id", async (c) => {
    const body = await c.req.json();
    const contact = crmStore.updateContact(c.req.param("id"), body);
    if (!contact) return c.json({ error: "Contact not found" }, 404);
    return c.json(contact);
  });

  app.delete("/contacts/:id", async (c) => {
    const deleted = crmStore.deleteContact(c.req.param("id"));
    if (!deleted) return c.json({ error: "Contact not found" }, 404);
    return c.json({ success: true });
  });

  // --- Deals ---

  app.post("/deals", async (c) => {
    const body = await c.req.json();
    if (!body.title) {
      return c.json({ error: "title is required" }, 400);
    }
    const stageName = body.stage || "Lead";
    const stage = crmStore.getStageByName(stageName);
    if (!stage) {
      return c.json({ error: `Unknown stage: ${stageName}` }, 400);
    }
    const deal = crmStore.createDeal({
      title: body.title,
      stageId: stage.id,
      companyId: body.companyId,
      contactId: body.contactId,
      value: body.value,
      currency: body.currency,
      expectedCloseDate: body.expectedCloseDate,
      metadata: body.metadata,
    });
    return c.json(deal, 201);
  });

  app.get("/deals", async (c) => {
    const { limit, offset } = boundPagination(
      c.req.query("limit"),
      c.req.query("offset")
    );
    const stageName = c.req.query("stage");
    let stageId: string | undefined;
    if (stageName) {
      const stage = crmStore.getStageByName(stageName);
      if (!stage) return c.json({ error: `Unknown stage: ${stageName}` }, 400);
      stageId = stage.id;
    }
    const result = crmStore.searchDeals({
      query: c.req.query("q"),
      stageId,
      companyId: c.req.query("company_id"),
      contactId: c.req.query("contact_id"),
      limit,
      offset,
    });
    return c.json({
      deals: result.deals,
      pagination: {
        limit,
        offset,
        total: result.total,
        hasMore: offset + result.deals.length < result.total,
      },
    });
  });

  app.get("/deals/:id", async (c) => {
    const deal = crmStore.getDeal(c.req.param("id"));
    if (!deal) return c.json({ error: "Deal not found" }, 404);
    return c.json(deal);
  });

  app.put("/deals/:id", async (c) => {
    const body = await c.req.json();
    const deal = crmStore.updateDeal(c.req.param("id"), body);
    if (!deal) return c.json({ error: "Deal not found" }, 404);
    return c.json(deal);
  });

  app.post("/deals/:id/stage", async (c) => {
    const body = await c.req.json();
    if (!body.stage) {
      return c.json({ error: "stage is required" }, 400);
    }
    const stage = crmStore.getStageByName(body.stage);
    if (!stage) {
      return c.json({ error: `Unknown stage: ${body.stage}` }, 400);
    }
    const deal = crmStore.moveDealStage(c.req.param("id"), stage.id);
    if (!deal) return c.json({ error: "Deal not found" }, 404);
    return c.json(deal);
  });

  app.post("/deals/:id/close", async (c) => {
    const body = await c.req.json();
    if (body.won === undefined) {
      return c.json({ error: "won (boolean) is required" }, 400);
    }
    const deal = crmStore.closeDeal(
      c.req.param("id"),
      body.won,
      body.lostReason
    );
    if (!deal) return c.json({ error: "Deal not found" }, 404);
    return c.json(deal);
  });

  app.delete("/deals/:id", async (c) => {
    const deleted = crmStore.deleteDeal(c.req.param("id"));
    if (!deleted) return c.json({ error: "Deal not found" }, 404);
    return c.json({ success: true });
  });

  // --- Activities ---

  app.post("/activities", async (c) => {
    const body = await c.req.json();
    if (!body.type) {
      return c.json({ error: "type is required" }, 400);
    }
    if (!body.contactId && !body.companyId && !body.dealId) {
      return c.json(
        { error: "At least one of contactId, companyId, or dealId is required" },
        400
      );
    }
    const activity = crmStore.logActivity({
      type: body.type,
      subject: body.subject,
      description: body.description,
      contactId: body.contactId,
      companyId: body.companyId,
      dealId: body.dealId,
      dueDate: body.dueDate,
      createdBy: body.createdBy,
      metadata: body.metadata,
    });
    return c.json(activity, 201);
  });

  app.get("/activities", async (c) => {
    const { limit, offset } = boundPagination(
      c.req.query("limit"),
      c.req.query("offset")
    );
    const result = crmStore.listActivities({
      contactId: c.req.query("contact_id"),
      companyId: c.req.query("company_id"),
      dealId: c.req.query("deal_id"),
      type: c.req.query("type"),
      limit,
      offset,
    });
    return c.json({
      activities: result.activities,
      pagination: {
        limit,
        offset,
        total: result.total,
        hasMore: offset + result.activities.length < result.total,
      },
    });
  });

  app.post("/activities/:id/complete", async (c) => {
    const activity = crmStore.completeActivity(c.req.param("id"));
    if (!activity) return c.json({ error: "Activity not found" }, 404);
    return c.json(activity);
  });

  // --- Pipeline ---

  app.get("/pipeline/summary", async (c) => {
    const summary = crmStore.getPipelineSummary();
    const totalDeals = summary.reduce((sum, s) => sum + s.dealCount, 0);
    const totalValue = summary.reduce((sum, s) => sum + s.totalValue, 0);
    return c.json({ stages: summary, totalOpenDeals: totalDeals, totalPipelineValue: totalValue });
  });

  app.get("/pipeline/forecast", async (c) => {
    const period = c.req.query("period") || "this_month";
    return c.json(crmStore.getDealForecast(period));
  });

  app.get("/pipeline/stages", async (c) => {
    return c.json({ stages: crmStore.getStages() });
  });

  return app;
}
