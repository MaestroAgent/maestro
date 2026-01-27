/**
 * Allowlist utility for user authorization in channels
 */

/**
 * Parse a comma-separated allowlist from an environment variable
 * Returns null if the env var is not set or empty (meaning all users allowed)
 */
export function parseAllowlist(envVar: string | undefined): Set<string> | null {
  if (!envVar || envVar.trim() === "") {
    return null;
  }

  const ids = envVar
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id !== "");

  if (ids.length === 0) {
    return null;
  }

  return new Set(ids);
}

/**
 * Check if an ID is allowed
 * Returns true if allowlist is null (all users allowed) or if ID is in the allowlist
 */
export function isAllowed(id: string, allowlist: Set<string> | null): boolean {
  if (allowlist === null) {
    return true;
  }
  return allowlist.has(String(id));
}

// Pre-parsed allowlists for performance
let telegramAllowlist: Set<string> | null | undefined;
let slackAllowlist: Set<string> | null | undefined;

/**
 * Check if a Telegram chat ID is allowed
 */
export function isAllowedTelegramUser(chatId: number | string): boolean {
  if (telegramAllowlist === undefined) {
    telegramAllowlist = parseAllowlist(process.env.MAESTRO_TELEGRAM_ALLOWED_USERS);
  }
  return isAllowed(String(chatId), telegramAllowlist);
}

/**
 * Check if a Slack user ID is allowed
 */
export function isAllowedSlackUser(userId: string): boolean {
  if (slackAllowlist === undefined) {
    slackAllowlist = parseAllowlist(process.env.MAESTRO_SLACK_ALLOWED_USERS);
  }
  return isAllowed(userId, slackAllowlist);
}

/**
 * Reset cached allowlists (useful for testing)
 */
export function resetAllowlistCache(): void {
  telegramAllowlist = undefined;
  slackAllowlist = undefined;
}
