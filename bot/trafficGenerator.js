const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const UserAgents = require('user-agents');
const ProxyHandler = require('./proxyHandler');

puppeteer.use(StealthPlugin());

class TrafficGenerator {
  constructor() {
    this.activeSessions = new Map();
    this.sessionLogs = new Map();
    this.proxyHandler = new ProxyHandler();
    this.autoRestartEnabled = true;
  }

  async testPuppeteer() {
    let browser;
    try {
      console.log('Testing Puppeteer with Chrome path:', process.env.PUPPETEER_EXECUTABLE_PATH);
      
      browser = await puppeteer.launch({
        headless: "new",
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null
      });
      
      const page = await browser.newPage();
      await page.goto('https://httpbin.org/ip', { 
        waitUntil: 'networkidle2',
        timeout: 15000 
      });
      
      const content = await page.content();
      
      return { 
        success: true, 
        message: 'Puppeteer is working correctly',
        chromePath: process.env.PUPPETEER_EXECUTABLE_PATH 
      };
    } catch (error) {
      console.error('Puppeteer test error:', error);
      throw new Error(`Puppeteer test failed: ${error.message}`);
    } finally {
      if (browser) {
        await browser.close().catch(e => console.error('Error closing browser:', e));
      }
    }
  }

  async startNewSession(config) {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.log(sessionId, 'SESSION_INIT', 'Initializing new session...');
    
    // Validate and add proxies
    if (config.proxyList && config.proxyList.length > 0) {
      this.log(sessionId, 'PROXY_SETUP', `Processing ${config.proxyList.length} proxies...`);
      
      const validProxies = config.proxyList.filter(proxy => 
        this.proxyHandler.validateProxyFormat(proxy)
      );
      
      if (validProxies.length > 0) {
        this.proxyHandler.addMultipleProxies(validProxies);
        this.log(sessionId, 'PROXY_ADDED', `Added ${validProxies.length} valid proxies`);
      } else {
        this.log(sessionId, 'PROXY_WARNING', 'No valid proxies found, continuing without proxy');
      }
    }

    this.sessionLogs.set(sessionId, []);
    this.activeSessions.set(sessionId, {
      id: sessionId,
      config: config,
      status: 'running',
      startTime: new Date(),
      currentStep: 0,
      isAutoLoop: config.isAutoLoop || false,
      restartCount: 0,
      maxRestarts: config.maxRestarts || 3
    });

    this.log(sessionId, 'SESSION_STARTED', 
      `Session started with ${config.profileCount} profiles targeting: ${config.targetUrl}` +
      (config.isAutoLoop ? ' [AUTO-LOOP]' : '')
    );
    
    // Execute session with auto-restart capability
    this.executeSessionWithAutoRestart(sessionId, config);

    return sessionId;
  }

  async executeSessionWithAutoRestart(sessionId, config) {
    const session = this.activeSessions.get(sessionId);
    
    try {
      await this.executeSession(sessionId, config);
      
      // Session completed successfully
      this.log(sessionId, 'SESSION_COMPLETED', 'All steps completed successfully');
      
      // Auto-restart if enabled and it's an auto-loop session
      if (this.autoRestartEnabled && session.isAutoLoop && session.restartCount < session.maxRestarts) {
        session.restartCount++;
        this.log(sessionId, 'AUTO_RESTART', 
          `Restarting session (${session.restartCount}/${session.maxRestarts}) after 30 seconds...`);
        
        // Wait before restarting
        setTimeout(() => {
          if (this.activeSessions.has(sessionId) && this.activeSessions.get(sessionId).status === 'running') {
            this.log(sessionId, 'RESTARTING', 'Starting new iteration...');
            this.executeSessionWithAutoRestart(sessionId, config);
          }
        }, 30000); // 30 second delay between restarts
        
      } else {
        this.stopSession(sessionId);
      }
      
    } catch (error) {
      this.log(sessionId, 'SESSION_FAILED', `Session failed: ${error.message}`);
      
      // Auto-restart on failure for auto-loop sessions
      if (this.autoRestartEnabled && session.isAutoLoop && session.restartCount < session.maxRestarts) {
        session.restartCount++;
        this.log(sessionId, 'AUTO_RESTART_ON_ERROR', 
          `Restarting after error (${session.restartCount}/${session.maxRestarts}) in 60 seconds...`);
        
        // Longer delay on error
        setTimeout(() => {
          if (this.activeSessions.has(sessionId) && this.activeSessions.get(sessionId).status === 'running') {
            this.log(sessionId, 'RESTARTING_AFTER_ERROR', 'Starting new iteration after error...');
            this.executeSessionWithAutoRestart(sessionId, config);
          }
        }, 60000); // 60 second delay on error
        
      } else {
        this.stopSession(sessionId);
      }
    }
  }

  async executeSession(sessionId, config) {
    let browser;
    try {
      // STEP 1: Launch Browser
      this.log(sessionId, 'STEP_1', 'Launching browser...');
      browser = await this.launchBrowserWithTimeout(config, 45000); // 45 second timeout
      
      const page = await browser.newPage();
      
      // Configure page timeouts
      page.setDefaultTimeout(30000);
      page.setDefaultNavigationTimeout(30000);

      // Setup User Agent and device simulation
      const userAgent = new UserAgents({ 
        deviceCategory: config.deviceType 
      }).toString();
      
      await page.setUserAgent(userAgent);
      await page.setViewport({ 
        width: config.deviceType === 'mobile' ? 375 : 1280, 
        height: config.deviceType === 'mobile' ? 667 : 720 
      });

      this.log(sessionId, 'STEP_1_COMPLETE', `Browser launched with ${config.deviceType} user agent`);

      // STEP 2: Navigate to Target
      this.log(sessionId, 'STEP_2', `Navigating to: ${config.targetUrl}`);
      
      const response = await page.goto(config.targetUrl, { 
        waitUntil: 'networkidle2',
        timeout: 60000
      });
      
      if (!response || !response.ok()) {
        this.log(sessionId, 'NAVIGATION_WARNING', `Navigation completed but with status: ${response?.status()}`);
      }
      
      // Check for data leaks
      const currentUrl = page.url();
      if (currentUrl.includes('google.com') && currentUrl.includes('url=')) {
        this.log(sessionId, 'DATA_LEAK_CHECK', 'Warning: Possible data leak detected');
      }

      this.log(sessionId, 'STEP_2_COMPLETE', 'Successfully navigated to target URL');

      // Execute all steps with individual error handling
      await this.executeAllSteps(page, sessionId);

      this.log(sessionId, 'SESSION_COMPLETED', 'All steps completed successfully');

    } catch (error) {
      this.log(sessionId, 'EXECUTION_ERROR', `Error during session execution: ${error.message}`);
      throw error;
    } finally {
      if (browser) {
        try {
          await browser.close();
          this.log(sessionId, 'BROWSER_CLOSED', 'Browser closed successfully');
        } catch (closeError) {
          this.log(sessionId, 'BROWSER_CLOSE_ERROR', `Error closing browser: ${closeError.message}`);
        }
      }
    }
  }

  async executeAllSteps(page, sessionId) {
    const steps = [
      {
        name: 'STEP_3',
        action: async () => {
          this.log(sessionId, 'STEP_3', 'Starting human-like scroll simulation...');
          await this.humanScroll(page);
        },
        successMessage: 'Scroll simulation completed'
      },
      {
        name: 'STEP_4', 
        action: async () => {
          this.log(sessionId, 'STEP_4', 'Looking for random post to click...');
          await this.clickRandomLink(page);
        },
        successMessage: 'Random click completed'
      },
      {
        name: 'STEP_5',
        action: async () => {
          this.log(sessionId, 'STEP_5', 'Checking for Google ads...');
          await this.skipGoogleAds(page);
        },
        successMessage: 'Ads handled'
      },
      {
        name: 'STEP_6',
        action: async () => {
          this.log(sessionId, 'STEP_6', 'Continuing reading with scroll...');
          await this.humanScroll(page);
        },
        successMessage: 'Continued reading completed'
      },
      {
        name: 'STEP_7',
        action: async () => {
          this.log(sessionId, 'STEP_7', 'Returning to home...');
          await this.clickHome(page);
        },
        successMessage: 'Returned to home'
      },
      {
        name: 'STEP_8',
        action: async () => {
          this.log(sessionId, 'STEP_8', 'Clearing cache...');
          await this.clearCache(page);
        },
        successMessage: 'Cache cleared'
      }
    ];

    for (const step of steps) {
      try {
        await step.action();
        this.log(sessionId, `${step.name}_COMPLETE`, step.successMessage);
        
        // Random delay between steps (2-5 seconds)
        await page.waitForTimeout(Math.random() * 3000 + 2000);
        
      } catch (stepError) {
        this.log(sessionId, `${step.name}_ERROR`, `Step failed but continuing: ${stepError.message}`);
        // Continue with next step even if this one fails
      }
    }
  }

  async launchBrowserWithTimeout(config, timeout) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Browser launch timeout after ${timeout}ms`));
      }, timeout);

      try {
        const browser = await this.launchBrowser(config);
        clearTimeout(timeoutId);
        resolve(browser);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  async launchBrowser(config) {
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--lang=en-US,en;q=0.9',
    ];

    // Add proxy if available and valid
    if (config.proxyList && config.proxyList.length > 0) {
      const randomProxy = this.proxyHandler.getRandomProxy();
      if (randomProxy) {
        args.push(`--proxy-server=${randomProxy.url}`);
        this.log('PROXY_INFO', `Using proxy: ${randomProxy.url}`);
      }
    }

    const launchOptions = {
      headless: "new",
      args: args,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
      ignoreHTTPSErrors: true,
    };

    console.log('Launching browser with options:', {
      headless: launchOptions.headless,
      hasProxy: config.proxyList && config.proxyList.length > 0,
      executablePath: launchOptions.executablePath ? 'set' : 'default'
    });

    return await puppeteer.launch(launchOptions);
  }

  async humanScroll(page) {
    const viewportHeight = page.viewport().height;
    let scrollHeight = 0;
    
    const totalHeight = await page.evaluate(() => document.body.scrollHeight);
    const scrollableHeight = totalHeight - viewportHeight;
    
    while (scrollHeight < scrollableHeight) {
      const scrollAmount = Math.floor(Math.random() * 200) + 100;
      scrollHeight = Math.min(scrollHeight + scrollAmount, scrollableHeight);
      
      await page.evaluate((scrollTo) => {
        window.scrollTo(0, scrollTo);
      }, scrollHeight);
      
      // Random delay between scrolls (1-3 seconds)
      await page.waitForTimeout(Math.random() * 2000 + 1000);
    }
    
    // Scroll back to top
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    
    await page.waitForTimeout(1000);
  }

  async clickRandomLink(page) {
    try {
      const links = await page.$$eval('a[href]', anchors => 
        anchors
          .filter(a => {
            const href = a.href;
            const text = a.textContent.trim();
            return href && 
                   !href.includes('#') && 
                   !href.startsWith('javascript:') &&
                   href !== window.location.href &&
                   text.length > 0 &&
                   a.offsetWidth > 0 && // Visible
                   a.offsetHeight > 0;
          })
          .map(a => ({ 
            href: a.href, 
            text: a.textContent.trim().substring(0, 50) 
          }))
      );
      
      if (links.length > 0) {
        const randomLink = links[Math.floor(Math.random() * links.length)];
        
        // Use different method to click to avoid detection
        await page.evaluate((href) => {
          const link = document.querySelector(`a[href="${href}"]`);
          if (link) {
            link.click();
          }
        }, randomLink.href);
        
        await page.waitForTimeout(3000);
        return true;
      }
      
      return false;
    } catch (error) {
      console.log('Cannot click link:', error.message);
      return false;
    }
  }

  async skipGoogleAds(page) {
    try {
      const skipSelectors = [
        'button[aria-label="Skip ad"]',
        '.videoAdUiSkipButton',
        '.ytp-ad-skip-button',
        'div.skip-ad-button',
        'button[class*="skip"]',
        '.ad-skip-button'
      ];
      
      for (const selector of skipSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await element.click();
            await page.waitForTimeout(1000);
            return true;
          }
        } catch (e) {
          // Continue to next selector
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async clickHome(page) {
    try {
      const homeSelectors = [
        'a[href="/"]',
        'a[href*="home"]',
        '.home-button',
        '.navbar-brand',
        'header a',
        'a.logo',
        '[data-testid="home-link"]'
      ];
      
      for (const selector of homeSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await element.click();
            await page.waitForTimeout(2000);
            return true;
          }
        } catch (e) {
          // Continue to next selector
        }
      }
      
      // Fallback: go to root URL
      await page.goto(new URL('/', page.url()).href, { 
        waitUntil: 'networkidle2',
        timeout: 20000 
      });
      return true;
      
    } catch (error) {
      return false;
    }
  }

  async clearCache(page) {
    try {
      await page.evaluate(() => {
        try {
          localStorage.clear();
          sessionStorage.clear();
          
          // Clear cookies
          document.cookie.split(";").forEach(function(c) {
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
          });
        } catch (e) {
          // Ignore storage clearing errors
        }
      });
      
      return true;
    } catch (error) {
      return false;
    }
  }

  log(sessionId, step, message) {
    const timestamp = new Date().toLocaleString('id-ID');
    const logEntry = { timestamp, step, message };
    
    if (this.sessionLogs.has(sessionId)) {
      this.sessionLogs.get(sessionId).push(logEntry);
    }
    
    // Also log to console for debugging
    const logMessage = `[${sessionId}] ${step}: ${message}`;
    if (step.includes('ERROR') || step.includes('FAILED')) {
      console.error('❌', logMessage);
    } else if (step.includes('WARNING')) {
      console.warn('⚠️', logMessage);
    } else {
      console.log('✅', logMessage);
    }
  }

  getSessionLogs(sessionId) {
    return this.sessionLogs.get(sessionId) || [];
  }

  getAllSessions() {
    const sessions = [];
    for (const [sessionId, session] of this.activeSessions) {
      sessions.push({
        id: sessionId,
        status: session.status,
        startTime: session.startTime,
        currentStep: session.currentStep,
        config: session.config,
        isAutoLoop: session.isAutoLoop,
        restartCount: session.restartCount,
        maxRestarts: session.maxRestarts
      });
    }
    return sessions;
  }

  stopSession(sessionId) {
    if (this.activeSessions.has(sessionId)) {
      this.activeSessions.get(sessionId).status = 'stopped';
      this.log(sessionId, 'SESSION_STOPPED', 'Session stopped by user');
    }
  }

  stopAllSessions() {
    for (const [sessionId] of this.activeSessions) {
      this.stopSession(sessionId);
    }
    this.log('SYSTEM', 'ALL_SESSIONS_STOPPED', 'All sessions stopped');
  }

  clearAllSessions() {
    this.activeSessions.clear();
    this.sessionLogs.clear();
    this.log('SYSTEM', 'ALL_SESSIONS_CLEARED', 'All sessions and logs cleared');
  }

  setAutoRestart(enabled) {
    this.autoRestartEnabled = enabled;
    console.log(`🔄 Auto-restart ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }
}

module.exports = TrafficGenerator;
