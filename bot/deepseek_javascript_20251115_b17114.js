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
    
    // Execute session dengan error handling yang lebih baik
    this.executeSessionWithRetry(sessionId, config).catch(error => {
      this.log(sessionId, 'SESSION_ERROR', `Session failed: ${error.message}`);
      this.stopSession(sessionId);
    });

    return sessionId;
  }

  async executeSessionWithRetry(sessionId, config, retryCount = 0) {
    const maxRetries = 2;
    
    try {
      await this.executeSession(sessionId, config);
    } catch (error) {
      // Cek jika error terkait timeout atau network
      const isNetworkError = error.message.includes('timeout') || 
                            error.message.includes('TIMED_OUT') ||
                            error.message.includes('NETWORK') ||
                            error.message.includes('ERR_');
      
      if (retryCount < maxRetries && isNetworkError) {
        const delay = Math.pow(2, retryCount) * 10000; // Exponential backoff: 10s, 20s
        this.log(sessionId, 'RETRY_ATTEMPT', 
          `Network error, retrying in ${delay/1000}s... (${retryCount + 1}/${maxRetries})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        await this.executeSessionWithRetry(sessionId, config, retryCount + 1);
      } else {
        this.log(sessionId, 'SESSION_FAILED', 
          `Session failed after ${retryCount + 1} attempts: ${error.message}`);
        this.stopSession(sessionId);
      }
    }
  }

  async executeSession(sessionId, config) {
    let browser;
    try {
      // STEP 1: Launch Browser dengan timeout yang lebih panjang
      this.log(sessionId, 'STEP_1', 'Launching browser...');
      browser = await this.launchBrowserWithTimeout(config, 60000); // 60 detik timeout
      
      const page = await browser.newPage();
      
      // Configure page timeouts - lebih panjang untuk halaman berat
      page.setDefaultTimeout(45000);
      page.setDefaultNavigationTimeout(60000);

      // Setup User Agent dan viewport
      const userAgent = new UserAgents({ 
        deviceCategory: config.deviceType 
      }).toString();
      
      await page.setUserAgent(userAgent);
      await page.setViewport({ 
        width: config.deviceType === 'mobile' ? 375 : 1280, 
        height: config.deviceType === 'mobile' ? 667 : 720 
      });

      // Block resources yang tidak penting untuk mempercepat loading
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      this.log(sessionId, 'STEP_1_COMPLETE', `Browser launched with ${config.deviceType} user agent`);

      // STEP 2: Navigate to Target dengan retry mechanism
      this.log(sessionId, 'STEP_2', `Navigating to: ${config.targetUrl}`);
      
      try {
        const response = await page.goto(config.targetUrl, { 
          waitUntil: 'domcontentloaded', // Lebih cepat daripada 'networkidle2'
          timeout: 60000
        });
        
        if (!response) {
          this.log(sessionId, 'NAVIGATION_WARNING', 'Navigation completed but no response object');
        } else if (!response.ok() && response.status() !== 304) {
          this.log(sessionId, 'NAVIGATION_WARNING', 
            `Navigation completed with status: ${response.status()} ${response.statusText()}`);
        }

        this.log(sessionId, 'STEP_2_COMPLETE', 'Successfully navigated to target URL');

        // STEP 3-8: Execute steps dengan error handling individual
        await this.executeAllSteps(page, sessionId, config);

        this.log(sessionId, 'SESSION_COMPLETED', 'All steps completed successfully');

      } catch (navError) {
        this.log(sessionId, 'NAVIGATION_ERROR', `Navigation failed: ${navError.message}`);
        throw navError;
      }

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

  async executeAllSteps(page, sessionId, config) {
    const steps = [
      {
        name: 'STEP_3',
        action: async () => {
          this.log(sessionId, 'STEP_3', 'Starting human-like scroll simulation...');
          await this.humanScroll(page);
        },
        successMessage: 'Scroll simulation completed',
        timeout: 30000
      },
      {
        name: 'STEP_4', 
        action: async () => {
          this.log(sessionId, 'STEP_4', 'Looking for random post to click...');
          const clicked = await this.clickRandomLink(page);
          if (!clicked) {
            this.log(sessionId, 'STEP_4_SKIP', 'No suitable links found, skipping click step');
          }
        },
        successMessage: 'Random click completed',
        timeout: 15000
      },
      {
        name: 'STEP_5',
        action: async () => {
          this.log(sessionId, 'STEP_5', 'Checking for Google ads...');
          await this.skipGoogleAds(page);
        },
        successMessage: 'Ads handled',
        timeout: 10000
      },
      // STEP BARU: Klik iklan Google dan kembali
      {
        name: 'STEP_GOOGLE_ADS',
        action: async () => {
          this.log(sessionId, 'STEP_GOOGLE_ADS', 'Attempting to click Google ads...');
          const adClicked = await this.clickGoogleAdsAndReturn(page, sessionId, config.targetUrl);
          if (!adClicked) {
            this.log(sessionId, 'STEP_GOOGLE_ADS_SKIP', 'No Google ads found, skipping ad click step');
          }
        },
        successMessage: 'Google ads process completed',
        timeout: 60000 // 60 detik timeout untuk proses iklan
      },
      {
        name: 'STEP_6',
        action: async () => {
          this.log(sessionId, 'STEP_6', 'Continuing reading with scroll after ads...');
          await this.humanScroll(page);
        },
        successMessage: 'Continued reading completed',
        timeout: 30000
      },
      {
        name: 'STEP_7',
        action: async () => {
          this.log(sessionId, 'STEP_7', 'Returning to home...');
          await this.clickHome(page);
        },
        successMessage: 'Returned to home',
        timeout: 15000
      },
      {
        name: 'STEP_8',
        action: async () => {
          this.log(sessionId, 'STEP_8', 'Clearing cache...');
          await this.clearCache(page);
        },
        successMessage: 'Cache cleared',
        timeout: 5000
      }
    ];

    for (const step of steps) {
      try {
        // Set timeout untuk step individual
        await Promise.race([
          step.action(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Step ${step.name} timeout`)), step.timeout)
          )
        ]);
        
        this.log(sessionId, `${step.name}_COMPLETE`, step.successMessage);
        
        // Random delay antara steps (2-5 detik)
        await page.waitForTimeout(Math.random() * 3000 + 2000);
        
      } catch (stepError) {
        this.log(sessionId, `${step.name}_ERROR`, 
          `Step failed but continuing: ${stepError.message}`);
        // Continue dengan next step meski ada error
      }
    }
  }

  // METHOD BARU: Klik iklan Google dan kembali
  async clickGoogleAdsAndReturn(page, sessionId, targetUrl) {
    try {
      this.log(sessionId, 'GOOGLE_ADS_START', 'Looking for Google ads to click...');
      
      // Selector untuk berbagai jenis iklan Google
      const adSelectors = [
        'a[href*="googleadservices.com"]',
        'a[href*="doubleclick.net"]',
        'div[id*="google_ads"]',
        'ins.adsbygoogle',
        '.google-ad',
        '[data-google-query-id]',
        'a[onclick*="google"]',
        '.ad-container',
        '.advertisement',
        '.ad-unit',
        'a[href*="googlesyndication.com"]',
        '.adsbygoogle',
        '[id*="ad-container"]',
        '.ad-slot',
        '[data-ad-client]',
        '[data-ad-slot]'
      ];

      let adClicked = false;
      
      // Cari dan klik iklan Google
      for (const selector of adSelectors) {
        try {
          const elements = await page.$$(selector);
          if (elements.length > 0) {
            this.log(sessionId, 'ADS_FOUND', `Found ${elements.length} elements with selector: ${selector}`);
            
            // Filter elemen yang visible dan clickable
            const visibleElements = [];
            for (const element of elements) {
              const isVisible = await page.evaluate(el => {
                const rect = el.getBoundingClientRect();
                return rect.width > 0 && rect.height > 0 && 
                       el.offsetParent !== null &&
                       el.style.display !== 'none' &&
                       el.style.visibility !== 'hidden' &&
                       el.style.opacity !== '0';
              }, element);
              
              if (isVisible) {
                visibleElements.push(element);
              }
            }
            
            if (visibleElements.length > 0) {
              // Pilih iklan acak yang visible
              const randomAd = visibleElements[Math.floor(Math.random() * visibleElements.length)];
              
              // Dapatkan URL iklan sebelum diklik
              const adUrl = await page.evaluate(el => {
                if (el.tagName === 'A') return el.href;
                const link = el.closest('a');
                return link ? link.href : null;
              }, randomAd);
              
              if (adUrl && (adUrl.includes('google') || adUrl.includes('doubleclick'))) {
                this.log(sessionId, 'AD_CLICK_ATTEMPT', `Attempting to click ad with URL: ${adUrl.substring(0, 100)}...`);
                
                // Scroll ke iklan terlebih dahulu
                await page.evaluate(el => {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, randomAd);
                
                await page.waitForTimeout(2000);
                
                // Klik iklan dengan metode yang berbeda
                await randomAd.click();
                adClicked = true;
                
                // Tunggu navigasi
                await page.waitForTimeout(5000);
                
                this.log(sessionId, 'AD_CLICKED', 'Successfully clicked Google ad');
                
                // Durasi acak di halaman iklan (10-30 detik)
                const randomDuration = Math.floor(Math.random() * 20000) + 10000;
                this.log(sessionId, 'AD_PAGE_WAIT', `Staying on ad page for ${randomDuration/1000} seconds`);
                
                // Lakukan aktivitas manusia selama di halaman iklan
                await this.humanActivityOnAdPage(page, randomDuration);
                
                // Kembali ke website target
                this.log(sessionId, 'RETURN_TO_TARGET', 'Returning to target website...');
                await page.goto(targetUrl, { 
                  waitUntil: 'domcontentloaded',
                  timeout: 30000 
                });
                
                this.log(sessionId, 'RETURN_COMPLETE', 'Successfully returned to target website');
                break;
              }
            }
          }
        } catch (error) {
          this.log(sessionId, 'AD_CLICK_ERROR', `Failed to click ad with selector ${selector}: ${error.message}`);
          // Continue ke selector berikutnya
        }
      }
      
      if (!adClicked) {
        this.log(sessionId, 'NO_ADS_FOUND', 'No Google ads found to click');
      }
      
      return adClicked;
    } catch (error) {
      this.log(sessionId, 'ADS_PROCESS_ERROR', `Error in ad click process: ${error.message}`);
      return false;
    }
  }

  // METHOD BARU: Aktivitas manusia di halaman iklan
  async humanActivityOnAdPage(page, duration) {
    try {
      const startTime = Date.now();
      
      while (Date.now() - startTime < duration) {
        // Scroll acak di halaman iklan
        const scrollAmount = Math.floor(Math.random() * 300) + 100;
        await page.evaluate((scroll) => {
          window.scrollBy(0, scroll);
        }, scrollAmount);
        
        // Tunggu random interval antara scroll (2-5 detik)
        const waitTime = Math.random() * 3000 + 2000;
        await page.waitForTimeout(waitTime);
        
        // Kadang-kadang scroll ke atas
        if (Math.random() > 0.7) {
          await page.evaluate(() => {
            window.scrollBy(0, -200);
          });
          await page.waitForTimeout(1000);
        }
        
        // Kadang-kadang klik link acak di halaman iklan (25% chance)
        if (Math.random() > 0.75) {
          const links = await page.$$('a[href]');
          if (links.length > 0) {
            const randomLink = links[Math.floor(Math.random() * links.length)];
            try {
              await randomLink.click();
              await page.waitForTimeout(3000);
              // Kembali dengan browser back
              await page.goBack();
              await page.waitForTimeout(2000);
            } catch (e) {
              // Ignore click errors
            }
          }
        }
      }
    } catch (error) {
      // Ignore errors during ad page activity
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
      '--disable-features=VizDisplayCompositor',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ];

    // Add proxy jika tersedia dan valid
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
    try {
      const viewportHeight = page.viewport().height;
      let scrollHeight = 0;
      
      const totalHeight = await page.evaluate(() => document.body.scrollHeight);
      const scrollableHeight = totalHeight - viewportHeight;
      
      // Scroll hanya 80% dari total height untuk menghindari footer
      const targetScrollHeight = scrollableHeight * 0.8;
      
      while (scrollHeight < targetScrollHeight) {
        const scrollAmount = Math.floor(Math.random() * 200) + 100;
        scrollHeight = Math.min(scrollHeight + scrollAmount, targetScrollHeight);
        
        await page.evaluate((scrollTo) => {
          window.scrollTo(0, scrollTo);
        }, scrollHeight);
        
        // Random delay antara scrolls (1-3 detik)
        await page.waitForTimeout(Math.random() * 2000 + 1000);
      }
      
      // Scroll back to top
      await page.evaluate(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      
      await page.waitForTimeout(1000);
    } catch (error) {
      console.log('Scroll error:', error.message);
      // Continue meski scroll error
    }
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
                   !href.includes('mailto:') &&
                   !href.includes('tel:') &&
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
        
        // Gunakan approach yang berbeda untuk menghindari detection
        await page.evaluate((href) => {
          const link = document.querySelector(`a[href="${href}"]`);
          if (link) {
            const rect = link.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            
            // Simulate mouse movement dan click
            const mouseDown = new MouseEvent('mousedown', {
              view: window,
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y
            });
            
            const mouseUp = new MouseEvent('mouseup', {
              view: window,
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y
            });
            
            const click = new MouseEvent('click', {
              view: window,
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y
            });
            
            link.dispatchEvent(mouseDown);
            link.dispatchEvent(mouseUp);
            link.dispatchEvent(click);
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
        '.ad-skip-button',
        '[data-adskip]'
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
        '[data-testid="home-link"]',
        '.navbar-home',
        '[title="Home"]'
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
      const currentUrl = page.url();
      const baseUrl = new URL(currentUrl).origin;
      await page.goto(baseUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 10000 
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
      this.log(sessionId, 'SESSION_STOPPED', 'Session stopped');
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