import { chromium, Browser, BrowserContext, Page } from "playwright";

// SECURITY: Block internal IPs, localhost, and cloud metadata endpoints
const BLOCKED_HOSTS = [
  // Localhost variants
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  // IPv6 localhost and variants
  "::1",
  "::ffff:127.0.0.1", // IPv6-mapped IPv4 localhost
  "::ffff:0:0",       // IPv6-mapped 0.0.0.0
  // Link-local and special ranges
  "169.254.",         // Link-local
  "169.254.169.254",  // AWS metadata service (more specific)
  // Private ranges
  "10.",              // Private range 10.0.0.0/8
  "172.16.",          // Private range 172.16.0.0/12
  "172.17.",
  "172.18.",
  "172.19.",
  "172.20.",
  "172.21.",
  "172.22.",
  "172.23.",
  "172.24.",
  "172.25.",
  "172.26.",
  "172.27.",
  "172.28.",
  "172.29.",
  "172.30.",
  "172.31.",
  "192.168.",         // Private range 192.168.0.0/16
  // IPv6 private ranges
  "fc00:",            // IPv6 Unique Local Addresses (Fc00::/7)
  "fd00:",
  "fe80:",            // IPv6 Link-local (fe80::/10)
];

export interface BrowserEngineOptions {
  headless?: boolean;
  timeout?: number;
  maxPagesPerContext?: number;
}

export class BrowserEngine {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pages: Map<string, Page> = new Map();
  private options: Required<BrowserEngineOptions>;
  private pageCounter = 0;

  constructor(options: BrowserEngineOptions = {}) {
    this.options = {
      headless: options.headless ?? true,
      timeout: options.timeout ?? 30000,
      maxPagesPerContext: options.maxPagesPerContext ?? 5,
    };
  }

  private isBlockedUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      // SECURITY: Block file:// and other non-http(s) protocols first
      if (!parsed.protocol.startsWith("http")) {
        return true;
      }

      // SECURITY: Check against blocked hosts list
      for (const blocked of BLOCKED_HOSTS) {
        if (hostname === blocked || hostname.startsWith(blocked)) {
          return true;
        }
      }

      // SECURITY: Additional IPv6 checks
      // Check for IPv6 addresses directly (e.g., ::1, fc00::1, etc.)
      if (hostname.includes(":")) {
        // Block localhost IPv6
        if (hostname === "::1" || hostname.startsWith("::1:") || hostname === "::ffff:127.0.0.1") {
          return true;
        }
        // Block IPv6 private ranges
        if (hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80:")) {
          return true;
        }
        // Block IPv6 link-local
        if (hostname.startsWith("fe80:")) {
          return true;
        }
      }

      // SECURITY: Block common port scanning attempts
      const port = parsed.port ? parseInt(parsed.port, 10) : (parsed.protocol === "https:" ? 443 : 80);
      const commonInternalPorts = [
        3000, 3001, 3002, 5000, 5001, 8000, 8001, 8008, 8080, 8081, 8443, 9000, 9001, 9090,
      ];
      if (commonInternalPorts.includes(port)) {
        // Only block on localhost-like hosts
        if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1") {
          return true;
        }
      }

      return false;
    } catch {
      return true; // Block invalid URLs
    }
  }

  async initialize(): Promise<void> {
    if (this.browser) return;

    this.browser = await chromium.launch({
      headless: this.options.headless,
    });

    this.context = await this.browser.newContext({
      userAgent: "Maestro Browser Automation",
      viewport: { width: 1280, height: 720 },
      ignoreHTTPSErrors: false,
    });

    this.context.setDefaultTimeout(this.options.timeout);
  }

  async close(): Promise<void> {
    for (const page of this.pages.values()) {
      await page.close().catch(() => {});
    }
    this.pages.clear();

    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }

  private async getOrCreatePage(pageId?: string): Promise<{ page: Page; id: string }> {
    await this.initialize();

    if (pageId && this.pages.has(pageId)) {
      return { page: this.pages.get(pageId)!, id: pageId };
    }

    // Check max pages limit
    if (this.pages.size >= this.options.maxPagesPerContext) {
      // Close oldest page
      const oldestId = this.pages.keys().next().value;
      if (oldestId) {
        const oldPage = this.pages.get(oldestId);
        await oldPage?.close().catch(() => {});
        this.pages.delete(oldestId);
      }
    }

    const newPage = await this.context!.newPage();
    const newId = `page-${++this.pageCounter}`;
    this.pages.set(newId, newPage);

    return { page: newPage, id: newId };
  }

  async navigate(url: string, pageId?: string): Promise<{
    success: boolean;
    pageId: string;
    title?: string;
    error?: string;
  }> {
    if (this.isBlockedUrl(url)) {
      return {
        success: false,
        pageId: pageId || "",
        error: "URL is blocked for security reasons (internal network or invalid protocol)",
      };
    }

    try {
      const { page, id } = await this.getOrCreatePage(pageId);
      await page.goto(url, { waitUntil: "domcontentloaded" });

      return {
        success: true,
        pageId: id,
        title: await page.title(),
      };
    } catch (error) {
      return {
        success: false,
        pageId: pageId || "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async readPage(pageId: string): Promise<{
    success: boolean;
    url?: string;
    title?: string;
    content?: string;
    error?: string;
  }> {
    const page = this.pages.get(pageId);
    if (!page) {
      return { success: false, error: "Page not found" };
    }

    try {
      const [url, title, content] = await Promise.all([
        page.url(),
        page.title(),
        page.evaluate(() => {
          // Get text content while preserving structure
          const body = document.body;
          if (!body) return "";

          // Remove script and style tags
          const clone = body.cloneNode(true) as HTMLElement;
          clone.querySelectorAll("script, style, noscript").forEach((el) => el.remove());

          // Get text with newlines for block elements
          const text = clone.innerText || clone.textContent || "";
          return text.slice(0, 50000); // Limit content size
        }),
      ]);

      return {
        success: true,
        url,
        title,
        content,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async click(pageId: string, selector: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    const page = this.pages.get(pageId);
    if (!page) {
      return { success: false, error: "Page not found" };
    }

    try {
      await page.click(selector, { timeout: 10000 });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async type(pageId: string, selector: string, text: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    const page = this.pages.get(pageId);
    if (!page) {
      return { success: false, error: "Page not found" };
    }

    try {
      await page.fill(selector, text, { timeout: 10000 });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async screenshot(pageId: string, fullPage: boolean = false): Promise<{
    success: boolean;
    screenshot?: string; // Base64 encoded
    error?: string;
  }> {
    const page = this.pages.get(pageId);
    if (!page) {
      return { success: false, error: "Page not found" };
    }

    try {
      const buffer = await page.screenshot({
        fullPage,
        type: "png",
      });

      return {
        success: true,
        screenshot: buffer.toString("base64"),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async extractData(
    pageId: string,
    selector: string,
    attribute?: string
  ): Promise<{
    success: boolean;
    data?: string[];
    error?: string;
  }> {
    const page = this.pages.get(pageId);
    if (!page) {
      return { success: false, error: "Page not found" };
    }

    try {
      const data = await page.$$eval(
        selector,
        (elements, attr) => {
          return elements.map((el) => {
            if (attr) {
              return el.getAttribute(attr) || "";
            }
            return el.textContent || "";
          });
        },
        attribute
      );

      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async waitForSelector(pageId: string, selector: string, timeout?: number): Promise<{
    success: boolean;
    error?: string;
  }> {
    const page = this.pages.get(pageId);
    if (!page) {
      return { success: false, error: "Page not found" };
    }

    try {
      await page.waitForSelector(selector, {
        timeout: timeout || this.options.timeout,
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async closePage(pageId: string): Promise<boolean> {
    const page = this.pages.get(pageId);
    if (!page) return false;

    await page.close().catch(() => {});
    this.pages.delete(pageId);
    return true;
  }

  getActivePages(): string[] {
    return Array.from(this.pages.keys());
  }
}

// Global browser engine instance
let browserEngine: BrowserEngine | null = null;

export function initBrowserEngine(options?: BrowserEngineOptions): BrowserEngine {
  if (browserEngine) {
    browserEngine.close();
  }
  browserEngine = new BrowserEngine(options);
  return browserEngine;
}

export function getBrowserEngine(): BrowserEngine | null {
  return browserEngine;
}

export async function closeBrowserEngine(): Promise<void> {
  if (browserEngine) {
    await browserEngine.close();
    browserEngine = null;
  }
}
