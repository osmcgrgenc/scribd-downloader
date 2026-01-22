import puppeteer from 'puppeteer'

class PuppeteerSg {
  constructor() {
    if (!PuppeteerSg.instance) {
      PuppeteerSg.instance = this;
      this.browser = null;
      this.isClosing = false;
      
      // Cleanup on process exit
      this._cleanupHandler = this.close.bind(this);
      process.on('exit', this._cleanupHandler);
      process.on('SIGINT', this._cleanupHandler);
      process.on('SIGTERM', this._cleanupHandler);
      process.on('uncaughtException', async (err) => {
        console.error('Uncaught Exception:', err);
        await this.close();
        process.exit(1);
      });
    }
    return PuppeteerSg.instance;
  }

  /**
   * Launch a browser instance if not already running
   */
  async launch() {
    if (this.browser) return;

    const isCI = process.env.CI === 'true';
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu'
    ];

    try {
      this.browser = await puppeteer.launch({
        headless: "new",
        defaultViewport: null,
        args: isCI ? args : [],
        timeout: 30000, // 30s timeout for launch
      });
      
      this.browser.on('disconnected', () => {
        this.browser = null;
      });
      
    } catch (error) {
      console.error("Failed to launch Puppeteer:", error);
      throw error;
    }
  }

  /**
   * Create a new page
   * @param {string} url 
   * @returns {Promise<import('puppeteer').Page>}
   */
  async getPage(url) {
    if (!this.browser) {
      await this.launch();
    }
    
    try {
      const page = await this.browser.newPage();
      
      // Basic stealth / fingerprinting mitigation could be added here
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      if (url) {
        await page.goto(url, {
          waitUntil: "networkidle2", // Better than "load" for SPA/heavy sites
          timeout: 60000 
        });
      }
      return page;
    } catch (error) {
      console.error(`Failed to open page ${url}:`, error);
      throw error;
    }
  }

  /**
   * Close the browser instance
   */
  async close() {
    if (this.browser && !this.isClosing) {
      this.isClosing = true;
      try {
        await this.browser.close();
      } catch (err) {
        // Ignore errors during close (e.g. already closed)
      } finally {
        this.browser = null;
        this.isClosing = false;
      }
    }
  }
}

export const puppeteerSg = new PuppeteerSg()
