import { ToolDefinition } from "../../core/types.js";
import { defineTool } from "../registry.js";

export const datetimeTool: ToolDefinition = defineTool(
  "datetime",
  "Get the current date, time, or timezone information. Use this when asked about " +
    "the current time, today's date, what day it is, or timezone information.",
  {
    type: "object",
    properties: {
      format: {
        type: "string",
        description:
          "Output format: 'full' (date and time), 'date' (date only), " +
          "'time' (time only), 'iso' (ISO 8601), 'unix' (Unix timestamp)",
        enum: ["full", "date", "time", "iso", "unix"],
      },
      timezone: {
        type: "string",
        description:
          "IANA timezone (e.g., 'America/New_York', 'Europe/London'). " +
          "Defaults to system timezone if not specified.",
      },
    },
  },
  async (args) => {
    const format = (args.format as string) || "full";
    const timezone = args.timezone as string | undefined;

    const now = new Date();

    // Get timezone name
    const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const targetTimezone = timezone || systemTimezone;

    // Validate timezone
    try {
      Intl.DateTimeFormat("en-US", { timeZone: targetTimezone });
    } catch {
      return {
        error: `Invalid timezone: ${targetTimezone}`,
        validExample: "America/New_York, Europe/London, Asia/Tokyo",
      };
    }

    // Format options
    const dateOptions: Intl.DateTimeFormatOptions = {
      timeZone: targetTimezone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };

    const timeOptions: Intl.DateTimeFormatOptions = {
      timeZone: targetTimezone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    };

    const fullOptions: Intl.DateTimeFormatOptions = {
      ...dateOptions,
      ...timeOptions,
    };

    // Get formatted values
    const dateStr = now.toLocaleDateString("en-US", dateOptions);
    const timeStr = now.toLocaleTimeString("en-US", timeOptions);
    const fullStr = now.toLocaleString("en-US", fullOptions);

    // Get UTC offset
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: targetTimezone,
      timeZoneName: "longOffset",
    });
    const parts = formatter.formatToParts(now);
    const offsetPart = parts.find((p) => p.type === "timeZoneName");
    const offset = offsetPart?.value || "Unknown";

    // Return based on format
    switch (format) {
      case "date":
        return {
          date: dateStr,
          dayOfWeek: now.toLocaleDateString("en-US", {
            timeZone: targetTimezone,
            weekday: "long",
          }),
          timezone: targetTimezone,
        };

      case "time":
        return {
          time: timeStr,
          timezone: targetTimezone,
          utcOffset: offset,
        };

      case "iso":
        return {
          iso: now.toISOString(),
          timezone: targetTimezone,
        };

      case "unix":
        return {
          unix: Math.floor(now.getTime() / 1000),
          milliseconds: now.getTime(),
        };

      case "full":
      default:
        return {
          datetime: fullStr,
          date: dateStr,
          time: timeStr,
          timezone: targetTimezone,
          utcOffset: offset,
          unix: Math.floor(now.getTime() / 1000),
        };
    }
  }
);
