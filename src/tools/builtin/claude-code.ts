import { spawn } from "child_process";
import { ToolDefinition, AgentContext } from "../../core/types.js";
import { defineTool } from "../registry.js";

/**
 * Execute Claude Code CLI and capture output
 */
async function executeClaudeCode(
  task: string,
  workingDir?: string,
  timeoutMs: number = 300000 // 5 minutes default
): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    // -p for non-interactive print mode
    // --dangerously-skip-permissions to avoid prompts in container environment
    const args = ["-p", task, "--dangerously-skip-permissions"];

    const proc = spawn("claude", args, {
      cwd: workingDir || process.cwd(),
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error(`Claude Code timed out after ${timeoutMs / 1000} seconds`));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      const output = stdout + (stderr ? `\n\nStderr:\n${stderr}` : "");
      resolve({
        output: output.trim() || "(no output)",
        exitCode: code ?? 0,
      });
    });

    proc.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to execute Claude Code: ${error.message}`));
    });
  });
}

export const claudeCodeTool: ToolDefinition = defineTool(
  "claude_code",
  "Execute a coding task using Claude Code CLI. Use this for tasks that require " +
    "file system access, code editing, git operations, or running commands. " +
    "Claude Code can read/write files, run tests, create commits, and more. " +
    "Provide a clear, specific task description.",
  {
    type: "object",
    properties: {
      task: {
        type: "string",
        description:
          "The coding task to perform. Be specific about what files to modify, " +
          "what changes to make, and any constraints. Examples: " +
          "'Add input validation to the login function in src/auth.ts', " +
          "'Fix the bug in the calculateTotal function that causes NaN for empty arrays', " +
          "'Create a new React component for displaying user profiles'",
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
