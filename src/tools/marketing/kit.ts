import { ToolDefinition } from "../../core/types.js";
import { defineTool } from "../registry.js";

/**
 * Kit (ConvertKit) API integration.
 * Requires KIT_API_SECRET env var.
 * Provides subscriber management, sequence management, and broadcast data.
 */

const KIT_API_BASE = "https://api.convertkit.com/v3";

function getApiSecret(): string {
  const secret = process.env.KIT_API_SECRET;
  if (!secret) {
    throw new Error("KIT_API_SECRET environment variable not set.");
  }
  return secret;
}

async function kitApiRequest(
  endpoint: string,
  method: string = "GET",
  body?: unknown
): Promise<unknown> {
  const secret = getApiSecret();
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${KIT_API_BASE}${endpoint}${separator}api_secret=${secret}`;

  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kit API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

export const kitTool: ToolDefinition = defineTool(
  "kit",
  "Interact with Kit (ConvertKit) email marketing platform. Manage subscribers, sequences, tags, and broadcasts. " +
    "Use this to check subscriber counts, list sequences, view tags, and analyze email performance.",
  {
    type: "object",
    properties: {
      action: {
        type: "string",
        description:
          "Action to perform: 'subscribers' (list/count), 'sequences' (list all), 'tags' (list all), " +
          "'sequence_subscribers' (subscribers in a sequence), 'tag_subscribers' (subscribers with a tag), " +
          "'broadcasts' (list sent broadcasts), 'subscriber_tags' (tags for a subscriber), " +
          "'add_tag' (tag a subscriber), 'add_to_sequence' (add subscriber to sequence)",
      },
      subscriber_email: {
        type: "string",
        description: "Subscriber email address (for subscriber-specific actions)",
      },
      sequence_id: {
        type: "string",
        description: "Sequence ID (for sequence_subscribers or add_to_sequence)",
      },
      tag_id: {
        type: "string",
        description: "Tag ID (for tag_subscribers or add_tag)",
      },
      page: {
        type: "string",
        description: "Page number for paginated results (default: '1')",
      },
    },
    required: ["action"],
  },
  async (args) => {
    const action = args.action as string;
    const page = (args.page as string) || "1";

    switch (action) {
      case "subscribers": {
        const data = await kitApiRequest(`/subscribers?page=${page}&sort_order=desc`) as {
          total_subscribers: number;
          page: number;
          total_pages: number;
          subscribers: Array<{ id: number; email_address: string; state: string; created_at: string }>;
        };
        return {
          totalSubscribers: data.total_subscribers,
          page: data.page,
          totalPages: data.total_pages,
          subscribers: data.subscribers.map((s) => ({
            id: s.id,
            email: s.email_address,
            state: s.state,
            createdAt: s.created_at,
          })),
        };
      }

      case "sequences": {
        const data = await kitApiRequest("/sequences") as {
          courses: Array<{ id: number; name: string; created_at: string; subscriber_count?: number }>;
        };
        return {
          totalSequences: data.courses.length,
          sequences: data.courses.map((s) => ({
            id: s.id,
            name: s.name,
            subscriberCount: s.subscriber_count,
            createdAt: s.created_at,
          })),
        };
      }

      case "tags": {
        const data = await kitApiRequest("/tags") as {
          tags: Array<{ id: number; name: string; created_at: string }>;
        };
        return {
          totalTags: data.tags.length,
          tags: data.tags.map((t) => ({
            id: t.id,
            name: t.name,
            createdAt: t.created_at,
          })),
        };
      }

      case "sequence_subscribers": {
        const seqId = args.sequence_id as string;
        if (!seqId) throw new Error("sequence_id required for sequence_subscribers action");
        const data = await kitApiRequest(`/sequences/${seqId}/subscriptions?page=${page}`) as {
          total_subscriptions: number;
          subscriptions: Array<{ subscriber: { id: number; email_address: string }; created_at: string }>;
        };
        return {
          sequenceId: seqId,
          total: data.total_subscriptions,
          subscribers: data.subscriptions.map((s) => ({
            id: s.subscriber.id,
            email: s.subscriber.email_address,
            addedAt: s.created_at,
          })),
        };
      }

      case "tag_subscribers": {
        const tagId = args.tag_id as string;
        if (!tagId) throw new Error("tag_id required for tag_subscribers action");
        const data = await kitApiRequest(`/tags/${tagId}/subscriptions?page=${page}`) as {
          total_subscriptions: number;
          subscriptions: Array<{ subscriber: { id: number; email_address: string }; created_at: string }>;
        };
        return {
          tagId,
          total: data.total_subscriptions,
          subscribers: data.subscriptions.map((s) => ({
            id: s.subscriber.id,
            email: s.subscriber.email_address,
            taggedAt: s.created_at,
          })),
        };
      }

      case "broadcasts": {
        const data = await kitApiRequest("/broadcasts") as {
          broadcasts: Array<{
            id: number;
            subject: string;
            created_at: string;
            sent_at: string | null;
            stats?: { recipients: number; open_rate: number; click_rate: number; unsubscribes: number };
          }>;
        };
        return {
          totalBroadcasts: data.broadcasts.length,
          broadcasts: data.broadcasts.map((b) => ({
            id: b.id,
            subject: b.subject,
            sentAt: b.sent_at,
            stats: b.stats ? {
              recipients: b.stats.recipients,
              openRate: Math.round(b.stats.open_rate * 100) / 100,
              clickRate: Math.round(b.stats.click_rate * 100) / 100,
              unsubscribes: b.stats.unsubscribes,
            } : null,
          })),
        };
      }

      case "add_tag": {
        const email = args.subscriber_email as string;
        const tagId = args.tag_id as string;
        if (!email || !tagId) throw new Error("subscriber_email and tag_id required for add_tag");
        const data = await kitApiRequest(`/tags/${tagId}/subscribe`, "POST", { email });
        return { success: true, action: "add_tag", email, tagId, result: data };
      }

      case "add_to_sequence": {
        const email = args.subscriber_email as string;
        const seqId = args.sequence_id as string;
        if (!email || !seqId) throw new Error("subscriber_email and sequence_id required for add_to_sequence");
        const data = await kitApiRequest(`/sequences/${seqId}/subscribe`, "POST", { email });
        return { success: true, action: "add_to_sequence", email, sequenceId: seqId, result: data };
      }

      default:
        throw new Error(
          `Unknown action: ${action}. Use: subscribers, sequences, tags, sequence_subscribers, tag_subscribers, broadcasts, add_tag, add_to_sequence`
        );
    }
  },
  { level: "medium" }
);
