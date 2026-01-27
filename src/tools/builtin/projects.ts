import { spawnSync } from "child_process";
import { existsSync, readdirSync, statSync, mkdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { ToolDefinition, AgentContext } from "../../core/types.js";
import { defineTool } from "../registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTS_DIR = join(__dirname, "..", "..", "..", "projects");

/**
 * Ensure projects directory exists
 */
function ensureProjectsDir(): void {
  if (!existsSync(PROJECTS_DIR)) {
    mkdirSync(PROJECTS_DIR, { recursive: true });
  }
}

/**
 * Validate project name to prevent path traversal and injection attacks
 * Only allows alphanumeric characters, dashes, underscores, and dots
 */
function isValidProjectName(name: string): boolean {
  // Must be non-empty and reasonable length
  if (!name || name.length === 0 || name.length > 100) {
    return false;
  }
  // Only allow safe characters
  if (!/^[a-zA-Z0-9_.-]+$/.test(name)) {
    return false;
  }
  // Prevent path traversal
  if (name.includes("..") || name.startsWith(".") || name.startsWith("-")) {
    return false;
  }
  return true;
}

/**
 * Validate git URL to prevent command injection
 * Only allows HTTPS URLs from known git hosting providers
 */
function isValidGitUrl(url: string): boolean {
  // Must be a valid URL format
  try {
    const parsed = new URL(url);
    // Only allow HTTPS protocol
    if (parsed.protocol !== "https:") {
      return false;
    }
    // Only allow known git hosting providers
    const allowedHosts = ["github.com", "gitlab.com", "bitbucket.org"];
    if (!allowedHosts.includes(parsed.hostname)) {
      return false;
    }
    // Path should be reasonable (owner/repo format)
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    if (pathParts.length < 2 || pathParts.length > 3) {
      return false;
    }
    // Each path segment should be reasonable
    for (const part of pathParts) {
      const cleanPart = part.replace(/\.git$/, "");
      if (!/^[a-zA-Z0-9_.-]+$/.test(cleanPart)) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate that a resolved path is within the PROJECTS_DIR
 */
function isPathWithinProjectsDir(targetPath: string): boolean {
  const resolved = resolve(targetPath);
  const projectsResolved = resolve(PROJECTS_DIR);
  return resolved.startsWith(projectsResolved + "/") || resolved === projectsResolved;
}

/**
 * Sanitize error messages to remove any embedded tokens/credentials
 * Removes patterns like https://TOKEN@host/... and common git credential patterns
 * SECURITY: Multiple patterns to catch various credential exposure vectors
 */
function sanitizeErrorMessage(message: string): string {
  let sanitized = message;
  // Remove https://TOKEN@host/... patterns
  sanitized = sanitized.replace(/https:\/\/[^@\s:/]+@/g, "https://***@");
  // Remove http://TOKEN@host/... patterns
  sanitized = sanitized.replace(/http:\/\/[^@\s:/]+@/g, "http://***@");
  // Remove git@... credentials in command output
  sanitized = sanitized.replace(/git@[^\s]+(:[^@\s]+)?@/g, "git@***@");
  // Remove Bearer tokens
  sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9_-]+/g, "Bearer ***");
  // Remove personal access tokens (common patterns)
  sanitized = sanitized.replace(/token[=\s:]+[A-Za-z0-9_-]{20,}/g, "token=***");
  // Remove git credential helper output
  sanitized = sanitized.replace(/password[=\s:]+[^\s]*/g, "password=***");
  return sanitized;
}

/**
 * Extract project name from git URL
 */
function getProjectNameFromUrl(url: string): string {
  // Handle URLs like:
  // https://github.com/user/repo.git
  // https://github.com/user/repo
  // git@github.com:user/repo.git
  const match = url.match(/\/([^\/]+?)(\.git)?$/);
  if (match) {
    return match[1];
  }
  // Fallback: use last segment
  return url.split("/").pop()?.replace(".git", "") || "project";
}

/**
 * Clone a git repository
 */
export const cloneProjectTool: ToolDefinition = defineTool(
  "clone_project",
  "Clone a git repository to work on. The repository will be cloned to the projects directory " +
    "and set as your current active project. Only HTTPS URLs from GitHub, GitLab, or Bitbucket are allowed.",
  {
    type: "object",
    properties: {
      repo_url: {
        type: "string",
        description:
          "The git repository URL to clone. Must be HTTPS URL from GitHub, GitLab, or Bitbucket " +
          "(e.g., 'https://github.com/user/repo')",
      },
      project_name: {
        type: "string",
        description:
          "Optional custom name for the project directory. Must contain only alphanumeric characters, " +
          "dashes, underscores, and dots. If not provided, uses the repo name.",
      },
    },
    required: ["repo_url"],
  },
  async (args, context: AgentContext) => {
    const repoUrl = args.repo_url as string;
    const customName = args.project_name as string | undefined;

    if (!repoUrl) {
      return { error: "Repository URL is required" };
    }

    // Validate repository URL
    if (!isValidGitUrl(repoUrl)) {
      return {
        success: false,
        error: "Invalid repository URL. Only HTTPS URLs from GitHub, GitLab, or Bitbucket are allowed.",
      };
    }

    const projectName = customName || getProjectNameFromUrl(repoUrl);

    // Validate project name
    if (!isValidProjectName(projectName)) {
      return {
        success: false,
        error: "Invalid project name. Use only alphanumeric characters, dashes, underscores, and dots.",
      };
    }

    ensureProjectsDir();

    const projectPath = join(PROJECTS_DIR, projectName);

    // Validate path is within projects directory (prevent path traversal)
    if (!isPathWithinProjectsDir(projectPath)) {
      return {
        success: false,
        error: "Invalid project path.",
      };
    }

    // Check if already exists
    if (existsSync(projectPath)) {
      // Set as current project
      context.metadata.currentProject = projectName;
      context.metadata.currentProjectPath = projectPath;

      return {
        success: true,
        message: `Project "${projectName}" already exists. Set as current project.`,
        project_name: projectName,
        project_path: projectPath,
        already_existed: true,
      };
    }

    try {
      // SECURITY: Do NOT embed credentials in URLs - use git credential helpers or SSH keys instead
      // Clone using spawnSync to avoid shell injection
      const result = spawnSync("git", ["clone", repoUrl, projectPath], {
        stdio: "pipe",
        timeout: 120000, // 2 minute timeout
        encoding: "utf-8",
        // Pass environment to enable git credential helpers (SSH keys, credential store, etc.)
        env: {
          ...process.env,
          // Ensure git can use local SSH agents and credential helpers
          GIT_TERMINAL_PROMPT: "0", // Prevent interactive prompts
        },
      });

      if (result.status !== 0) {
        // Sanitize error to remove any embedded tokens or credentials
        const errorMsg = sanitizeErrorMessage(result.stderr || "Unknown error");
        const hint = repoUrl.includes("github.com") || repoUrl.includes("gitlab.com") || repoUrl.includes("bitbucket.org")
          ? " Hint: For private repos, use SSH keys or git credentials. Set up: 'git config --global credential.helper' or use SSH key-based authentication."
          : "";
        return {
          success: false,
          error: `Failed to clone repository: ${errorMsg}${hint}`,
        };
      }

      // Set as current project
      context.metadata.currentProject = projectName;
      context.metadata.currentProjectPath = projectPath;

      return {
        success: true,
        message: `Cloned "${repoUrl}" to "${projectName}". This is now your active project.`,
        project_name: projectName,
        project_path: projectPath,
      };
    } catch (error) {
      // Sanitize error to remove any embedded tokens or credentials
      const rawErrorMsg = error instanceof Error ? error.message : String(error);
      const errorMsg = sanitizeErrorMessage(rawErrorMsg);
      const hint = repoUrl.includes("github.com") || repoUrl.includes("gitlab.com") || repoUrl.includes("bitbucket.org")
        ? " Hint: For private repos, use SSH keys or git credentials. Set up: 'git config --global credential.helper' or use SSH key-based authentication."
        : "";

      return {
        success: false,
        error: `Failed to clone repository: ${errorMsg}${hint}`,
      };
    }
  }
);

/**
 * Switch to a different project
 */
export const switchProjectTool: ToolDefinition = defineTool(
  "switch_project",
  "Switch to a different project that's already been cloned. " +
    "All subsequent coding tasks will run in this project's directory.",
  {
    type: "object",
    properties: {
      project_name: {
        type: "string",
        description: "The name of the project to switch to",
      },
    },
    required: ["project_name"],
  },
  async (args, context: AgentContext) => {
    const projectName = args.project_name as string;

    if (!projectName) {
      return { error: "Project name is required" };
    }

    // Validate project name
    if (!isValidProjectName(projectName)) {
      return {
        success: false,
        error: "Invalid project name.",
      };
    }

    ensureProjectsDir();

    const projectPath = join(PROJECTS_DIR, projectName);

    // Validate path is within projects directory
    if (!isPathWithinProjectsDir(projectPath)) {
      return {
        success: false,
        error: "Invalid project path.",
      };
    }

    if (!existsSync(projectPath)) {
      // List available projects
      const available = existsSync(PROJECTS_DIR)
        ? readdirSync(PROJECTS_DIR).filter((f) =>
            statSync(join(PROJECTS_DIR, f)).isDirectory()
          )
        : [];

      return {
        success: false,
        error: `Project "${projectName}" not found`,
        available_projects: available,
      };
    }

    // Set as current project
    context.metadata.currentProject = projectName;
    context.metadata.currentProjectPath = projectPath;

    return {
      success: true,
      message: `Switched to project "${projectName}"`,
      project_name: projectName,
      project_path: projectPath,
    };
  }
);

/**
 * List all projects
 */
export const listProjectsTool: ToolDefinition = defineTool(
  "list_projects",
  "List all available projects that have been cloned.",
  {
    type: "object",
    properties: {},
    required: [],
  },
  async (_args, context: AgentContext) => {
    ensureProjectsDir();

    const projects: Array<{
      name: string;
      path: string;
      is_current: boolean;
    }> = [];

    if (existsSync(PROJECTS_DIR)) {
      const entries = readdirSync(PROJECTS_DIR);
      const currentProject = context.metadata.currentProject as string | undefined;

      for (const entry of entries) {
        const fullPath = join(PROJECTS_DIR, entry);
        if (statSync(fullPath).isDirectory()) {
          projects.push({
            name: entry,
            path: fullPath,
            is_current: entry === currentProject,
          });
        }
      }
    }

    const currentProject = context.metadata.currentProject as string | undefined;

    return {
      projects,
      current_project: currentProject || null,
      projects_directory: PROJECTS_DIR,
    };
  }
);

/**
 * Get current project info
 */
export const currentProjectTool: ToolDefinition = defineTool(
  "current_project",
  "Get information about the currently active project.",
  {
    type: "object",
    properties: {},
    required: [],
  },
  async (_args, context: AgentContext) => {
    const currentProject = context.metadata.currentProject as string | undefined;
    const currentProjectPath = context.metadata.currentProjectPath as string | undefined;

    if (!currentProject) {
      return {
        has_project: false,
        message: "No project is currently active. Use clone_project to clone a repository first.",
      };
    }

    return {
      has_project: true,
      project_name: currentProject,
      project_path: currentProjectPath,
    };
  }
);

/**
 * All project management tools
 */
export const projectTools: ToolDefinition[] = [
  cloneProjectTool,
  switchProjectTool,
  listProjectsTool,
  currentProjectTool,
];
