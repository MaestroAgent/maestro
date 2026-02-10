import { ToolDefinition } from "../../core/types.js";
import { defineTool } from "../registry.js";

/**
 * Google Search Console API integration.
 * Requires GSC_SERVICE_ACCOUNT_JSON or GSC_ACCESS_TOKEN env var.
 * Provides search analytics and URL inspection data.
 */

interface GSCCredentials {
  type: "service_account" | "oauth";
  accessToken?: string;
  serviceAccountJson?: string;
}

function getCredentials(): GSCCredentials {
  const serviceAccount = process.env.GSC_SERVICE_ACCOUNT_JSON;
  if (serviceAccount) {
    return { type: "service_account", serviceAccountJson: serviceAccount };
  }

  const accessToken = process.env.GSC_ACCESS_TOKEN;
  if (accessToken) {
    return { type: "oauth", accessToken };
  }

  throw new Error(
    "Google Search Console credentials not configured. Set GSC_SERVICE_ACCOUNT_JSON or GSC_ACCESS_TOKEN environment variable."
  );
}

async function getAccessToken(creds: GSCCredentials): Promise<string> {
  if (creds.type === "oauth" && creds.accessToken) {
    return creds.accessToken;
  }

  if (creds.type === "service_account" && creds.serviceAccountJson) {
    // Parse service account JSON and create JWT for token exchange
    const sa = JSON.parse(creds.serviceAccountJson);
    const now = Math.floor(Date.now() / 1000);

    // Create JWT header and claim set
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const claimSet = Buffer.from(JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })).toString("base64url");

    // Sign with private key
    const { createSign } = await import("crypto");
    const sign = createSign("RSA-SHA256");
    sign.update(`${header}.${claimSet}`);
    const signature = sign.sign(sa.private_key, "base64url");

    const jwt = `${header}.${claimSet}.${signature}`;

    // Exchange JWT for access token
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (!response.ok) {
      throw new Error(`GSC token exchange failed: ${response.statusText}`);
    }

    const data = await response.json() as { access_token: string };
    return data.access_token;
  }

  throw new Error("Unable to obtain GSC access token");
}

async function gscApiRequest(
  endpoint: string,
  method: string = "GET",
  body?: unknown
): Promise<unknown> {
  const creds = getCredentials();
  const token = await getAccessToken(creds);

  const response = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3${endpoint}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GSC API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

export const gscSearchAnalyticsTool: ToolDefinition = defineTool(
  "google_search_console",
  "Query Google Search Console search analytics data. Returns clicks, impressions, CTR, and position for queries and pages. " +
    "Use this to analyze SEO performance, find top queries, identify pages with low CTR, and discover keyword opportunities.",
  {
    type: "object",
    properties: {
      site_url: {
        type: "string",
        description: "The site URL in GSC (e.g., 'https://example.com' or 'sc-domain:example.com')",
      },
      start_date: {
        type: "string",
        description: "Start date in YYYY-MM-DD format (default: 28 days ago)",
      },
      end_date: {
        type: "string",
        description: "End date in YYYY-MM-DD format (default: today)",
      },
      dimensions: {
        type: "string",
        description: "Comma-separated dimensions to group by: query, page, country, device, date (default: 'query')",
      },
      row_limit: {
        type: "string",
        description: "Max rows to return, 1-25000 (default: '25')",
      },
      query_filter: {
        type: "string",
        description: "Optional: filter results to queries containing this string",
      },
      page_filter: {
        type: "string",
        description: "Optional: filter results to this specific page URL",
      },
    },
    required: ["site_url"],
  },
  async (args) => {
    const siteUrl = args.site_url as string;
    const now = new Date();
    const defaultStart = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

    const startDate = (args.start_date as string) || defaultStart.toISOString().split("T")[0];
    const endDate = (args.end_date as string) || now.toISOString().split("T")[0];
    const dimensions = ((args.dimensions as string) || "query").split(",").map((d) => d.trim());
    const rowLimit = parseInt((args.row_limit as string) || "25", 10);

    const requestBody: Record<string, unknown> = {
      startDate,
      endDate,
      dimensions,
      rowLimit,
      dataState: "final",
    };

    // Add filters if specified
    const dimensionFilterGroups: Array<{ filters: Array<Record<string, string>> }> = [];
    const filters: Array<Record<string, string>> = [];

    if (args.query_filter) {
      filters.push({
        dimension: "query",
        operator: "contains",
        expression: args.query_filter as string,
      });
    }

    if (args.page_filter) {
      filters.push({
        dimension: "page",
        operator: "equals",
        expression: args.page_filter as string,
      });
    }

    if (filters.length > 0) {
      dimensionFilterGroups.push({ filters });
      requestBody.dimensionFilterGroups = dimensionFilterGroups;
    }

    const encodedUrl = encodeURIComponent(siteUrl);
    const data = await gscApiRequest(
      `/sites/${encodedUrl}/searchAnalytics/query`,
      "POST",
      requestBody
    ) as { rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> };

    const rows = data.rows || [];

    return {
      site: siteUrl,
      period: `${startDate} to ${endDate}`,
      dimensions,
      totalRows: rows.length,
      rows: rows.map((row) => ({
        keys: row.keys,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: Math.round(row.ctr * 10000) / 100, // Convert to percentage
        position: Math.round(row.position * 10) / 10,
      })),
    };
  },
  { level: "medium" }
);
