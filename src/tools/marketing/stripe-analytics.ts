import { ToolDefinition } from "../../core/types.js";
import { defineTool } from "../registry.js";

/**
 * Stripe analytics integration.
 * Requires STRIPE_SECRET_KEY env var.
 * Provides revenue, subscription, and churn data.
 */

const STRIPE_API_BASE = "https://api.stripe.com/v1";

function getStripeKey(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY environment variable not set.");
  }
  return key;
}

async function stripeApiRequest(
  endpoint: string,
  params?: Record<string, string | string[]>
): Promise<unknown> {
  const key = getStripeKey();

  const url = new URL(`${STRIPE_API_BASE}${endpoint}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) {
        v.forEach((item, i) => url.searchParams.append(`${k}[${i}]`, item));
      } else {
        url.searchParams.set(k, v);
      }
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Stripe API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

export const stripeAnalyticsTool: ToolDefinition = defineTool(
  "stripe_analytics",
  "Query Stripe for revenue, subscription, and customer data. " +
    "Use this to analyze MRR, churn, subscription metrics, and revenue trends.",
  {
    type: "object",
    properties: {
      report_type: {
        type: "string",
        description:
          "Type of report: 'mrr' (monthly recurring revenue), 'subscriptions' (active subscription details), " +
          "'customers' (recent customers), 'charges' (recent charges/revenue), 'churn' (canceled subscriptions)",
      },
      limit: {
        type: "string",
        description: "Max results to return (default: '25', max: '100')",
      },
      start_date: {
        type: "string",
        description: "Start date in YYYY-MM-DD format (for charges report, default: 30 days ago)",
      },
      status_filter: {
        type: "string",
        description: "Filter subscriptions by status: 'active', 'canceled', 'past_due', 'trialing'",
      },
    },
    required: ["report_type"],
  },
  async (args) => {
    const reportType = args.report_type as string;
    const limit = (args.limit as string) || "25";

    switch (reportType) {
      case "mrr": {
        // Get active subscriptions and calculate MRR
        const data = await stripeApiRequest("/subscriptions", {
          status: "active",
          limit: "100",
          expand: ["data.plan"],
        }) as {
          data: Array<{
            id: string;
            plan: { amount: number; interval: string; currency: string; nickname: string | null };
            quantity: number;
            status: string;
          }>;
        };

        let totalMRR = 0;
        const subscriptions = data.data.map((sub) => {
          let monthlyAmount = sub.plan.amount * sub.quantity;
          if (sub.plan.interval === "year") {
            monthlyAmount = monthlyAmount / 12;
          } else if (sub.plan.interval === "week") {
            monthlyAmount = monthlyAmount * 4.33;
          }
          // Convert from cents to dollars
          const mrr = monthlyAmount / 100;
          totalMRR += mrr;
          return {
            id: sub.id,
            plan: sub.plan.nickname || `${sub.plan.currency.toUpperCase()} ${sub.plan.amount / 100}/${sub.plan.interval}`,
            quantity: sub.quantity,
            mrr: Math.round(mrr * 100) / 100,
          };
        });

        return {
          totalMRR: Math.round(totalMRR * 100) / 100,
          arr: Math.round(totalMRR * 12 * 100) / 100,
          activeSubscriptions: subscriptions.length,
          currency: "USD",
          subscriptions: subscriptions.slice(0, parseInt(limit, 10)),
        };
      }

      case "subscriptions": {
        const params: Record<string, string> = { limit };
        if (args.status_filter) {
          params.status = args.status_filter as string;
        }

        const data = await stripeApiRequest("/subscriptions", params) as {
          data: Array<{
            id: string;
            status: string;
            current_period_start: number;
            current_period_end: number;
            plan: { amount: number; interval: string; currency: string; nickname: string | null };
            quantity: number;
            cancel_at_period_end: boolean;
            created: number;
          }>;
        };

        return {
          total: data.data.length,
          subscriptions: data.data.map((sub) => ({
            id: sub.id,
            status: sub.status,
            plan: sub.plan.nickname || `${sub.plan.amount / 100}/${sub.plan.interval}`,
            quantity: sub.quantity,
            cancelAtPeriodEnd: sub.cancel_at_period_end,
            currentPeriodEnd: new Date(sub.current_period_end * 1000).toISOString().split("T")[0],
            created: new Date(sub.created * 1000).toISOString().split("T")[0],
          })),
        };
      }

      case "customers": {
        const data = await stripeApiRequest("/customers", {
          limit,
          expand: ["data.subscriptions"],
        }) as {
          data: Array<{
            id: string;
            email: string | null;
            name: string | null;
            created: number;
            subscriptions?: { data: Array<{ status: string }> };
          }>;
        };

        return {
          total: data.data.length,
          customers: data.data.map((c) => ({
            id: c.id,
            email: c.email,
            name: c.name,
            created: new Date(c.created * 1000).toISOString().split("T")[0],
            hasActiveSubscription: c.subscriptions?.data.some((s) => s.status === "active") || false,
          })),
        };
      }

      case "charges": {
        const now = Math.floor(Date.now() / 1000);
        const defaultStart = now - 30 * 24 * 60 * 60;
        const startTimestamp = args.start_date
          ? Math.floor(new Date(args.start_date as string).getTime() / 1000)
          : defaultStart;

        const data = await stripeApiRequest("/charges", {
          limit,
          "created[gte]": startTimestamp.toString(),
        }) as {
          data: Array<{
            id: string;
            amount: number;
            currency: string;
            status: string;
            created: number;
            description: string | null;
            customer: string | null;
          }>;
        };

        const totalRevenue = data.data
          .filter((c) => c.status === "succeeded")
          .reduce((sum, c) => sum + c.amount, 0);

        return {
          totalRevenue: totalRevenue / 100,
          chargeCount: data.data.length,
          charges: data.data.map((c) => ({
            id: c.id,
            amount: c.amount / 100,
            currency: c.currency.toUpperCase(),
            status: c.status,
            date: new Date(c.created * 1000).toISOString().split("T")[0],
            description: c.description,
          })),
        };
      }

      case "churn": {
        // Get recently canceled subscriptions
        const data = await stripeApiRequest("/subscriptions", {
          status: "canceled",
          limit,
        }) as {
          data: Array<{
            id: string;
            canceled_at: number;
            created: number;
            plan: { amount: number; interval: string; nickname: string | null };
            cancellation_details?: { reason: string | null; feedback: string | null };
          }>;
        };

        return {
          recentCancellations: data.data.length,
          cancellations: data.data.map((sub) => ({
            id: sub.id,
            plan: sub.plan.nickname || `${sub.plan.amount / 100}/${sub.plan.interval}`,
            canceledAt: new Date(sub.canceled_at * 1000).toISOString().split("T")[0],
            created: new Date(sub.created * 1000).toISOString().split("T")[0],
            reason: sub.cancellation_details?.reason || null,
            feedback: sub.cancellation_details?.feedback || null,
          })),
        };
      }

      default:
        throw new Error(
          `Unknown report type: ${reportType}. Use: mrr, subscriptions, customers, charges, churn`
        );
    }
  },
  { level: "medium" }
);
