import { ToolDefinition } from "../../core/types.js";
import { defineTool } from "../registry.js";

/**
 * Google Analytics 4 Data API integration.
 * Requires GA4_PROPERTY_ID and (GA4_SERVICE_ACCOUNT_JSON or GA4_ACCESS_TOKEN).
 * Provides traffic, conversion, and user behavior data.
 */

async function getGA4AccessToken(): Promise<string> {
  const accessToken = process.env.GA4_ACCESS_TOKEN;
  if (accessToken) {
    return accessToken;
  }

  const serviceAccountJson = process.env.GA4_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error(
      "GA4 credentials not configured. Set GA4_ACCESS_TOKEN or GA4_SERVICE_ACCOUNT_JSON environment variable."
    );
  }

  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);

  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claimSet = Buffer.from(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })).toString("base64url");

  const { createSign } = await import("crypto");
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${claimSet}`);
  const signature = sign.sign(sa.private_key, "base64url");

  const jwt = `${header}.${claimSet}.${signature}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!response.ok) {
    throw new Error(`GA4 token exchange failed: ${response.statusText}`);
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

interface GA4Response {
  rows?: Array<{
    dimensionValues: Array<{ value: string }>;
    metricValues: Array<{ value: string }>;
  }>;
  rowCount?: number;
}

async function ga4RunReport(propertyId: string, body: unknown): Promise<GA4Response> {
  const token = await getGA4AccessToken();

  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GA4 API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<GA4Response>;
}

export const googleAnalyticsTool: ToolDefinition = defineTool(
  "google_analytics",
  "Query Google Analytics 4 data. Returns traffic, conversion, and user behavior metrics. " +
    "Use this to analyze website performance, traffic sources, page performance, and conversion funnels.",
  {
    type: "object",
    properties: {
      report_type: {
        type: "string",
        description:
          "Type of report: 'traffic' (sessions by source), 'pages' (top pages), 'conversions' (event completions), 'overview' (key metrics summary), 'user_acquisition' (new users by source)",
      },
      start_date: {
        type: "string",
        description: "Start date in YYYY-MM-DD format (default: 28 days ago). Also accepts: 'today', '7daysAgo', '30daysAgo'",
      },
      end_date: {
        type: "string",
        description: "End date in YYYY-MM-DD format (default: today)",
      },
      row_limit: {
        type: "string",
        description: "Max rows to return (default: '25')",
      },
      page_filter: {
        type: "string",
        description: "Optional: filter to a specific page path (contains match)",
      },
    },
    required: ["report_type"],
  },
  async (args) => {
    const propertyId = process.env.GA4_PROPERTY_ID;
    if (!propertyId) {
      throw new Error("GA4_PROPERTY_ID environment variable not set.");
    }

    const reportType = args.report_type as string;
    const startDate = (args.start_date as string) || "28daysAgo";
    const endDate = (args.end_date as string) || "today";
    const rowLimit = parseInt((args.row_limit as string) || "25", 10);

    // Build report based on type
    const reportConfigs: Record<string, { dimensions: string[]; metrics: string[] }> = {
      traffic: {
        dimensions: ["sessionDefaultChannelGroup", "sessionSource"],
        metrics: ["sessions", "activeUsers", "bounceRate", "averageSessionDuration"],
      },
      pages: {
        dimensions: ["pagePath", "pageTitle"],
        metrics: ["screenPageViews", "activeUsers", "averageSessionDuration", "bounceRate"],
      },
      conversions: {
        dimensions: ["eventName"],
        metrics: ["eventCount", "totalUsers", "eventCountPerUser"],
      },
      overview: {
        dimensions: ["date"],
        metrics: ["activeUsers", "sessions", "screenPageViews", "averageSessionDuration", "bounceRate"],
      },
      user_acquisition: {
        dimensions: ["firstUserDefaultChannelGroup", "firstUserSource"],
        metrics: ["newUsers", "activeUsers", "sessions", "bounceRate"],
      },
    };

    const config = reportConfigs[reportType];
    if (!config) {
      throw new Error(
        `Unknown report type: ${reportType}. Use: traffic, pages, conversions, overview, user_acquisition`
      );
    }

    const requestBody: Record<string, unknown> = {
      dateRanges: [{ startDate, endDate }],
      dimensions: config.dimensions.map((name) => ({ name })),
      metrics: config.metrics.map((name) => ({ name })),
      limit: rowLimit,
      orderBys: [{ metric: { metricName: config.metrics[0] }, desc: true }],
    };

    // Add page filter if specified
    if (args.page_filter) {
      requestBody.dimensionFilter = {
        filter: {
          fieldName: "pagePath",
          stringFilter: {
            matchType: "CONTAINS",
            value: args.page_filter as string,
          },
        },
      };
    }

    const data = await ga4RunReport(propertyId, requestBody);

    const rows = (data.rows || []).map((row) => {
      const result: Record<string, string | number> = {};
      config.dimensions.forEach((dim, i) => {
        result[dim] = row.dimensionValues[i].value;
      });
      config.metrics.forEach((metric, i) => {
        const val = row.metricValues[i].value;
        result[metric] = val.includes(".") ? parseFloat(val) : parseInt(val, 10);
      });
      return result;
    });

    return {
      propertyId,
      reportType,
      period: `${startDate} to ${endDate}`,
      totalRows: data.rowCount || rows.length,
      rows,
    };
  },
  { level: "medium" }
);
