import { appendFileSync, mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import { LogLevel, LogEvent } from "./types.js";

export interface LoggerOptions {
  level?: LogLevel;
  logFile?: string;
  console?: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private level: number;
  private logFile?: string;
  private consoleEnabled: boolean;

  constructor(options: LoggerOptions = {}) {
    this.level = LOG_LEVELS[options.level ?? "info"];
    this.logFile = options.logFile;
    this.consoleEnabled = options.console ?? true;

    // Ensure log directory exists
    if (this.logFile) {
      const dir = dirname(this.logFile);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= this.level;
  }

  private formatForConsole(event: LogEvent): string {
    const time = new Date(event.timestamp).toLocaleTimeString();
    const level = event.level.toUpperCase().padEnd(5);
    const agent = event.agentName ? `[${event.agentName}]` : "";
    const session = event.sessionId ? `(${event.sessionId.slice(0, 8)})` : "";

    let message = `${time} ${level} ${agent}${session} ${event.event}`;

    // Add context based on event type
    if ("input" in event) {
      message += `: ${event.input.slice(0, 50)}${event.input.length > 50 ? "..." : ""}`;
    }
    if ("inputTokens" in event && "outputTokens" in event) {
      message += `: ${event.inputTokens}/${event.outputTokens} tokens, ${event.durationMs}ms`;
    }
    if ("toolName" in event) {
      message += `: ${event.toolName}`;
    }
    if ("error" in event) {
      message += `: ${event.error}`;
    }

    return message;
  }

  private output(event: LogEvent): void {
    // Console output
    if (this.consoleEnabled && this.shouldLog(event.level)) {
      const formatted = this.formatForConsole(event);
      switch (event.level) {
        case "error":
          console.error(formatted);
          break;
        case "warn":
          console.warn(formatted);
          break;
        default:
          console.log(formatted);
      }
    }

    // File output (JSON lines)
    if (this.logFile) {
      try {
        appendFileSync(this.logFile, JSON.stringify(event) + "\n");
      } catch (error) {
        console.error("Failed to write to log file:", error);
      }
    }
  }

  private createEvent(
    level: LogLevel,
    event: string,
    data: Record<string, unknown>,
    context?: { sessionId?: string; agentName?: string }
  ): LogEvent {
    return {
      timestamp: new Date().toISOString(),
      level,
      event,
      sessionId: context?.sessionId,
      agentName: context?.agentName,
      ...data,
    } as LogEvent;
  }

  // Convenience methods
  debug(message: string, context?: { sessionId?: string; agentName?: string }): void {
    if (this.shouldLog("debug")) {
      this.output(this.createEvent("debug", "debug", { message }, context));
    }
  }

  info(message: string, context?: { sessionId?: string; agentName?: string }): void {
    if (this.shouldLog("info")) {
      this.output(this.createEvent("info", "info", { message }, context));
    }
  }

  warn(message: string, context?: { sessionId?: string; agentName?: string }): void {
    if (this.shouldLog("warn")) {
      this.output(this.createEvent("warn", "warn", { message }, context));
    }
  }

  error(
    error: Error | string,
    context?: { sessionId?: string; agentName?: string; additionalContext?: Record<string, unknown> }
  ): void {
    const errorMessage = error instanceof Error ? error.message : error;
    const stack = error instanceof Error ? error.stack : undefined;

    this.output(
      this.createEvent(
        "error",
        "error",
        { error: errorMessage, stack, context: context?.additionalContext },
        context
      )
    );
  }

  // Structured event logging
  agentInvoke(
    input: string,
    context: { sessionId: string; agentName: string }
  ): void {
    this.output(this.createEvent("info", "agent.invoke", { input }, context));
  }

  agentResponse(
    inputTokens: number,
    outputTokens: number,
    durationMs: number,
    context: { sessionId: string; agentName: string }
  ): void {
    this.output(
      this.createEvent(
        "info",
        "agent.response",
        { inputTokens, outputTokens, durationMs },
        context
      )
    );
  }

  toolCall(
    toolName: string,
    args: Record<string, unknown>,
    context: { sessionId: string; agentName: string }
  ): void {
    this.output(
      this.createEvent("debug", "tool.call", { toolName, arguments: args }, context)
    );
  }

  toolResult(
    toolName: string,
    result: unknown,
    isError: boolean,
    durationMs: number,
    context: { sessionId: string; agentName: string }
  ): void {
    this.output(
      this.createEvent(
        isError ? "warn" : "debug",
        "tool.result",
        { toolName, result, isError, durationMs },
        context
      )
    );
  }

  sessionStart(
    sessionId: string,
    channel: string,
    userId: string
  ): void {
    this.output(
      this.createEvent("info", "session.start", { channel, userId }, { sessionId })
    );
  }

  sessionEnd(sessionId: string): void {
    this.output(this.createEvent("info", "session.end", {}, { sessionId }));
  }
}

// Global logger instance
let globalLogger: Logger | null = null;

export function initLogger(options: LoggerOptions = {}): Logger {
  globalLogger = new Logger(options);
  return globalLogger;
}

export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = new Logger();
  }
  return globalLogger;
}
