import { spawn } from "child_process";
import { ToolDefinition, AgentContext } from "../../core/types.js";
import { defineTool } from "../registry.js";

/**
 * Execute Claude Code CLI and capture output
 */
// Default tools that Claude Code is allowed to use (restricted for safety)
const DEFAULT_ALLOWED_TOOLS = "Read,Glob,Grep";

async function executeClaudeCode(
  task: string,
  workingDir?: string,
  timeoutMs: number = 300000, // 5 minutes default
  maxTurns: number = 10
): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    // SECURITY: Resource limits
    const MAX_OUTPUT_SIZE = 5 * 1024 * 1024; // 5MB max output
    const KILL_TIMEOUT_MS = 2000; // 2s after SIGTERM before SIGKILL

    // Get allowed tools from environment or use restricted default
    const allowedTools = process.env.MAESTRO_CLAUDE_CODE_ALLOWED_TOOLS || DEFAULT_ALLOWED_TOOLS;

    // -p for non-interactive print mode
    // --allowedTools restricts what operations Claude Code can perform
    // --max-turns limits the number of agentic turns to prevent runaway loops
    const args = [
      "-p", task,
      "--allowedTools", allowedTools,
      "--max-turns", String(maxTurns),
    ];

    const proc = spawn("claude", args, {
      cwd: workingDir || process.cwd(),
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let outputTruncated = false;
    let killTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

    // SECURITY: Monitor output size and truncate if necessary
    proc.stdout.on("data", (data) => {
      const chunk = data.toString();
      if ((stdout + chunk).length > MAX_OUTPUT_SIZE) {
        stdout = stdout.slice(0, MAX_OUTPUT_SIZE - 100); // Leave room for truncation message
        stdout += "\n... [OUTPUT TRUNCATED - size limit exceeded] ...\n";
        outputTruncated = true;
        // Kill process if output exceeds limit
        proc.kill("SIGTERM");
      } else {
        stdout += chunk;
      }
    });

    proc.stderr.on("data", (data) => {
      const chunk = data.toString();
      if ((stderr + chunk).length > MAX_OUTPUT_SIZE / 2) {
        stderr = stderr.slice(0, MAX_OUTPUT_SIZE / 2 - 50);
        stderr += "\n... [STDERR TRUNCATED] ...\n";
        proc.kill("SIGTERM");
      } else {
        stderr += chunk;
      }
    });

    let timeoutHandle = setTimeout(() => {
      // First try SIGTERM for graceful shutdown
      proc.kill("SIGTERM");

      // If process doesn't exit within KILL_TIMEOUT_MS, use SIGKILL
      killTimeoutHandle = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error(`Claude Code timed out after ${timeoutMs / 1000} seconds and did not respond to SIGTERM`));
      }, KILL_TIMEOUT_MS);
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timeoutHandle);
      if (killTimeoutHandle) {
        clearTimeout(killTimeoutHandle);
      }

      const output = stdout + (stderr ? `\n\nStderr:\n${stderr}` : "");
      const finalOutput = outputTruncated
        ? output + "\n[WARNING: Output was truncated due to size limits]"
        : output;

      resolve({
        output: finalOutput.trim() || "(no output)",
        exitCode: code ?? 0,
      });
    });

    proc.on("error", (error) => {
      clearTimeout(timeoutHandle);
      if (killTimeoutHandle) {
        clearTimeout(killTimeoutHandle);
      }
      reject(new Error(`Failed to execute Claude Code: ${error.message}`));
    });
  });
}

export const claudeCodeTool: ToolDefinition = defineTool(
  "claude_code",
  "Execute a coding task using Claude Code CLI with restricted permissions. " +
    "By default, Claude Code can only read files and search code (Read, Glob, Grep). " +
    "Additional tools can be enabled via MAESTRO_CLAUDE_CODE_ALLOWED_TOOLS. " +
    "Use this for code analysis, reading files, and searching through codebases.",
  {
    type: "object",
    properties: {
      task: {
        type: "string",
        description:
          "The coding task to perform. Be specific about what files to read, " +
          "what to search for, and what analysis to perform. Examples: " +
          "'Find all usages of the calculateTotal function in the codebase', " +
          "'Read and summarize the authentication logic in src/auth/', " +
          "'Search for TODO comments and list them with their file locations'",
      },
      working_directory: {
        type: "string",
        description:
          "Optional working directory for the task. Defaults to current directory.",
      },
      timeout_seconds: {
        type: "number",
        description:
          "Optional timeout in seconds (default: 300, max: 600). " +
          "Increase for longer tasks.",
      },
    },
    required: ["task"],
  },
  async (args, context: AgentContext) => {
    const task = args.task as string;
    const explicitWorkingDir = args.working_directory as string | undefined;
    const timeoutSeconds = Math.min((args.timeout_seconds as number) || 300, 600);

    // Use explicit working_directory, or fall back to current project from context
    const currentProjectPath = context.metadata.currentProjectPath as string | undefined;
    const workingDir = explicitWorkingDir || currentProjectPath;

    if (!task || typeof task !== "string") {
      return { error: "Task is required and must be a string" };
    }

    if (task.length < 10) {
      return {
        error: "Task description is too short. Please provide a clear, specific task.",
      };
    }

    // Warn if no project is set
    if (!workingDir) {
      return {
        error: "No project is currently active. Use clone_project to clone a repository first, or specify a working_directory.",
        suggestion: "Try: clone_project with a repository URL",
      };
    }

    try {
      const result = await executeClaudeCode(
        task,
        workingDir,
        timeoutSeconds * 1000
      );

      const currentProject = context.metadata.currentProject as string | undefined;

      return {
        task,
        project: currentProject || null,
        working_directory: workingDir,
        exit_code: result.exitCode,
        success: result.exitCode === 0,
        output: result.output,
      };
    } catch (error) {
      return {
        task,
        error: error instanceof Error ? error.message : String(error),
        success: false,
      };
    }
  }
);
