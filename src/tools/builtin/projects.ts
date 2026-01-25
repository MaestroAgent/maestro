import { execSync } from "child_process";
import { existsSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
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
    execSync(`mkdir -p "${PROJECTS_DIR}"`);
  }
}

/**
 * Inject GitHub token into HTTPS URL for private repo access
 */
function injectGitHubToken(url: string): string {
  const token = process.env.GITHUB_TOKEN;

  if (!token) {
    return url;
  }

  // Only inject for GitHub HTTPS URLs
  // https://github.com/user/repo → https://{token}@github.com/user/repo
  const githubHttpsPattern = /^https:\/\/github\.com\//;

  if (githubHttpsPattern.test(url)) {
    return url.replace("https://github.com/", `https://${token}@github.com/`);
  }

  return url;
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
    "and set as your current active project. Use this before asking to make code changes.",
  {
    type: "object",
    properties: {
      repo_url: {
        type: "string",
        description:
          "The git repository URL to clone (e.g., 'https://github.com/user/repo' or 'git@github.com:user/repo.git')",
      },
      project_name: {
        type: "string",
        description:
          "Optional custom name for the project directory. If not provided, uses the repo name.",
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

    ensureProjectsDir();

    const projectName = customName || getProjectNameFromUrl(repoUrl);
    const projectPath = join(PROJECTS_DIR, projectName);

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
      // Inject GitHub token if available (for private repos)
      const cloneUrl = injectGitHubToken(repoUrl);

      // Clone the repository
      execSync(`git clone "${cloneUrl}" "${projectPath}"`, {
        stdio: "pipe",
        timeout: 120000, // 2 minute timeout
      });

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
      const errorMsg = error instanceof Error ? error.message : String(error);
      const hint = !process.env.GITHUB_TOKEN && repoUrl.includes("github.com")
        ? " Hint: For private repos, set GITHUB_TOKEN in your .env file."
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

    ensureProjectsDir();

    const projectPath = join(PROJECTS_DIR, projectName);

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
