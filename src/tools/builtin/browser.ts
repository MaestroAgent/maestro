import { defineTool } from "../registry.js";
import { getBrowserEngine, initBrowserEngine } from "../../browser/index.js";

// Helper to ensure browser is initialized
async function ensureBrowser() {
  let engine = getBrowserEngine();
  if (!engine) {
    engine = initBrowserEngine({ headless: true });
  }
  await engine.initialize();
  return engine;
}

export const browseWebTool = defineTool(
  "browse_web",
  "Navigate to a URL and interact with web pages. Supports navigation, reading content, clicking, typing, and taking screenshots. Each action returns a pageId that should be used for subsequent actions on the same page.",
  {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["navigate", "read", "click", "type", "screenshot", "extract", "close"],
        description: "The action to perform: 'navigate' to go to a URL, 'read' to get page content, 'click' to click an element, 'type' to enter text, 'screenshot' to capture the page, 'extract' to get data from elements, 'close' to close a page.",
      },
      url: {
        type: "string",
        description: "URL to navigate to (required for 'navigate' action).",
      },
      pageId: {
        type: "string",
        description: "ID of an existing page to interact with. If not provided for 'navigate', a new page is created.",
      },
      selector: {
        type: "string",
        description: "CSS selector for the element to interact with (required for 'click', 'type', 'extract' actions).",
      },
      text: {
        type: "string",
        description: "Text to type into the element (required for 'type' action).",
      },
      attribute: {
        type: "string",
        description: "Attribute to extract from elements (optional for 'extract' action, defaults to text content).",
      },
      fullPage: {
        type: "string",
        enum: ["true", "false"],
        description: "Whether to capture full page screenshot (optional for 'screenshot' action).",
      },
    },
    required: ["action"],
  },
  async (args) => {
    const action = args.action as string;
    const url = args.url as string | undefined;
    const pageId = args.pageId as string | undefined;
    const selector = args.selector as string | undefined;
    const text = args.text as string | undefined;
    const attribute = args.attribute as string | undefined;
    const fullPage = args.fullPage === "true";

    try {
      const engine = await ensureBrowser();

      switch (action) {
        case "navigate": {
          if (!url) {
            return { success: false, error: "URL is required for navigate action" };
          }
          const result = await engine.navigate(url, pageId);
          return result;
        }

        case "read": {
          if (!pageId) {
            return { success: false, error: "pageId is required for read action" };
          }
          const result = await engine.readPage(pageId);
          // Truncate content for reasonable response size
          if (result.content && result.content.length > 10000) {
            result.content = result.content.slice(0, 10000) + "\n\n... (content truncated)";
          }
          return result;
        }

        case "click": {
          if (!pageId) {
            return { success: false, error: "pageId is required for click action" };
          }
          if (!selector) {
            return { success: false, error: "selector is required for click action" };
          }
          const result = await engine.click(pageId, selector);
          return result;
        }

        case "type": {
          if (!pageId) {
            return { success: false, error: "pageId is required for type action" };
          }
          if (!selector) {
            return { success: false, error: "selector is required for type action" };
          }
          if (!text) {
            return { success: false, error: "text is required for type action" };
          }
          const result = await engine.type(pageId, selector, text);
          return result;
        }

        case "screenshot": {
          if (!pageId) {
            return { success: false, error: "pageId is required for screenshot action" };
          }
          const result = await engine.screenshot(pageId, fullPage);
          if (result.success && result.screenshot) {
            // Return info about screenshot rather than the base64 blob
            return {
              success: true,
              message: "Screenshot captured successfully",
              size: `${Math.round(result.screenshot.length * 0.75 / 1024)}KB`,
              format: "PNG",
            };
          }
          return result;
        }

        case "extract": {
          if (!pageId) {
            return { success: false, error: "pageId is required for extract action" };
          }
          if (!selector) {
            return { success: false, error: "selector is required for extract action" };
          }
          const result = await engine.extractData(pageId, selector, attribute);
          return result;
        }

        case "close": {
          if (!pageId) {
            return { success: false, error: "pageId is required for close action" };
          }
          const closed = await engine.closePage(pageId);
          return {
            success: closed,
            message: closed ? "Page closed successfully" : "Page not found",
          };
        }

        default:
          return {
            success: false,
            error: `Unknown action: ${action}. Valid actions are: navigate, read, click, type, screenshot, extract, close`,
          };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
);

export const listBrowserPagesTool = defineTool(
  "list_browser_pages",
  "List all currently open browser pages/tabs.",
  {
    type: "object",
    properties: {},
  },
  async () => {
    const engine = getBrowserEngine();
    if (!engine) {
      return {
        success: true,
        pages: [],
        message: "Browser not initialized. Use browse_web with 'navigate' action to open a page.",
      };
    }

    const pages = engine.getActivePages();
    return {
      success: true,
      pages,
      count: pages.length,
    };
  }
);

export const browserTools = [browseWebTool, listBrowserPagesTool];
