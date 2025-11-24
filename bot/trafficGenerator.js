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
    this.profileNames = this.generateProfileNames();
  }

  // Generate random profile names
  generateProfileNames() {
    const firstNames = ['Ahmad', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gita', 'Hadi', 'Indra', 'Joko', 'Kartika', 'Lestari', 'Mulyadi', 'Ningsih', 'Oktaviani', 'Putra', 'Qory', 'Rahayu', 'Sari', 'Tri'];
    const lastNames = ['Santoso', 'Wijaya', 'Kusuma', 'Pratama', 'Setiawan', 'Hidayat', 'Saputra', 'Gunawan', 'Ramadan', 'Nugroho', 'Yulianto', 'Zulkarnain', 'Purnomo', 'Siregar', 'Halim', 'Wibowo', 'Sihombing', 'Nainggolan', 'Pangestu', 'Wicaksono'];
    return firstNames.flatMap(fn => lastNames.map(ln => `${fn} ${ln}`));
  }

  // Get random profile name
  getRandomProfileName() {
    return this.profileNames[Math.floor(Math.random() * this.profileNames.length)];
  }

  async startNewSession(config) {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const profileName = this.getRandomProfileName();
    
    this.log(sessionId, 'SESSION_INIT', `Initializing new session with profile: ${profileName}`);
    
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
        this.log(sessionId, 'PROXY_WARNING', 'No valid proxies found, will try to use active proxies from previous sessions');
      }
    }

    this.sessionLogs.set(sessionId, []);
    this.activeSessions.set(sessionId, {
      id: sessionId,
      config: config,
      profileName: profileName,
      status: 'running',
      startTime: new Date(),
      currentStep: 0,
      isAutoLoop: config.isAutoLoop || false,
      restartCount: 0,
      maxRestarts: config.maxRestarts || 3
    });

    this.log(sessionId, 'SESSION_STARTED', 
      `Session started with profile "${profileName}" targeting: ${config.targetUrl}` +
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
                            error.message.includes('ERR_') ||
                            error.message.includes('Navigation');
      
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
    let currentProxy = null;
    
    try {
      // STEP 1: Buat profile Google dengan name acak
      this.log(sessionId, 'STEP_1', `Creating Google profile: ${this.activeSessions.get(sessionId).profileName}`);
      
      // STEP 2: Launch Browser dengan proxy aktif
      this.log(sessionId, 'STEP_2', 'Launching browser with active proxy...');
      const launchResult = await this.launchBrowserWithActiveProxy(config, sessionId);
      browser = launchResult.browser;
      currentProxy = launchResult.proxy;
      
      if (currentProxy) {
        this.proxyHandler.markProxyAsActive(currentProxy.url);
        this.log(sessionId, 'PROXY_SUCCESS', `Using active proxy: ${currentProxy.url}`);
      } else {
        this.log(sessionId, 'PROXY_WARNING', 'No proxy available, using direct connection');
      }

      const page = await browser.newPage();
      
      // Configure page timeouts
      page.setDefaultTimeout(45000);
      page.setDefaultNavigationTimeout(60000);

      // Setup User Agent dan viewport dengan profile acak
      const userAgent = new UserAgents({ 
        deviceCategory: config.deviceType 
      }).toString();
      
      await page.setUserAgent(userAgent);
      await page.setViewport({ 
        width: config.deviceType === 'mobile' ? 375 : 1280, 
        height: config.deviceType === 'mobile' ? 667 : 720 
      });

      // Block resources yang tidak penting
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      this.log(sessionId, 'STEP_2_COMPLETE', `Browser launched with profile "${this.activeSessions.get(sessionId).profileName}"`);

      // STEP 3: Navigate to Target
      this.log(sessionId, 'STEP_3', `Navigating to: ${config.targetUrl}`);
      
      try {
        const response = await page.goto(config.targetUrl, { 
          waitUntil: 'domcontentloaded',
          timeout: 60000
        });
        
        if (!response) {
          this.log(sessionId, 'NAVIGATION_WARNING', 'Navigation completed but no response object');
        } else if (!response.ok() && response.status() !== 304) {
          this.log(sessionId, 'NAVIGATION_WARNING', 
            `Navigation completed with status: ${response.status()} ${response.statusText()}`);
        }

        this.log(sessionId, 'STEP_3_COMPLETE', 'Successfully navigated to target URL');

        // Eksekusi semua steps
        await this.executeAllSteps(page, sessionId, config);

        this.log(sessionId, 'SESSION_COMPLETED', 'All steps completed successfully');

      } catch (navError) {
        this.log(sessionId, 'NAVIGATION_ERROR', `Navigation failed: ${navError.message}`);
        throw navError;
      }

    } catch (error) {
      // Tandai proxy sebagai gagal jika error terkait proxy
      if (currentProxy && (error.message.includes('proxy') || error.message.includes('timeout') || error.message.includes('NETWORK'))) {
        this.proxyHandler.markProxyAsFailed(currentProxy.url);
        this.log(sessionId, 'PROXY_FAILED', `Proxy marked as failed: ${currentProxy.url}`);
      }
      
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

  async launchBrowserWithActiveProxy(config, sessionId) {
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
      '--disable-renderer-backgrounding',
      '--disable-web-security',
      '--disable-features=site-per-process',
      '--window-size=1920,1080'
    ];

    let currentProxy = null;
    
    // Coba proxy aktif terlebih dahulu
    currentProxy = this.proxyHandler.getRandomActiveProxy();
    
    // Jika tidak ada proxy aktif, coba proxy baru
    if (!currentProxy) {
      currentProxy = this.proxyHandler.getNextProxy();
    }

    // Add proxy jika tersedia dan valid
    if (currentProxy) {
      args.push(`--proxy-server=${currentProxy.url}`);
      this.log(sessionId, 'PROXY_SELECTED', `Trying proxy: ${currentProxy.url}`);
    } else {
      this.log(sessionId, 'PROXY_WARNING', 'No proxies available, using direct connection');
    }

    const launchOptions = {
      headless: "new",
      args: args,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
      ignoreHTTPSErrors: true,
      ignoreDefaultArgs: ['--disable-extensions'],
      timeout: 60000
    };

    console.log('Launching browser with options:', {
      headless: launchOptions.headless,
      hasProxy: !!currentProxy,
      proxy: currentProxy ? currentProxy.url : 'none',
      executablePath: launchOptions.executablePath ? 'set' : 'default'
    });

    const browser = await puppeteer.launch(launchOptions);
    return { browser, proxy: currentProxy };
  }

  async executeAllSteps(page, sessionId, config) {
    const session = this.activeSessions.get(sessionId);
    const isOddSession = parseInt(sessionId.split('_')[1]) % 2 !== 0; // Cek session ganjil
    
    const steps = [
      // STEP 4: Human-like scroll simulation
      {
        name: 'STEP_4',
        action: async () => {
          this.log(sessionId, 'STEP_4', 'Starting human-like scroll simulation...');
          await this.humanScroll(page);
        },
        successMessage: 'Scroll simulation completed',
        timeout: 30000
      },
      
      // STEP 5: Click random link
      {
        name: 'STEP_5', 
        action: async () => {
          this.log(sessionId, 'STEP_5', 'Looking for random post to click...');
          const clicked = await this.clickRandomLink(page);
          if (!clicked) {
            this.log(sessionId, 'STEP_5_SKIP', 'No suitable links found, skipping click step');
          }
        },
        successMessage: 'Random click completed',
        timeout: 15000
      },
      
      // STEP 6: Skip Google ads
      {
        name: 'STEP_6',
        action: async () => {
          this.log(sessionId, 'STEP_6', 'Checking for Google ads to skip...');
          await this.skipGoogleAds(page);
        },
        successMessage: 'Ads handled',
        timeout: 10000
      },
      
      // STEP 7: Continue reading dengan scroll + about menu untuk session ganjil
      {
        name: 'STEP_7',
        action: async () => {
          this.log(sessionId, 'STEP_7', 'Continuing reading with human-like scroll...');
          await this.humanScroll(page);
          
          // Untuk session ganjil, klik menu about
          if (isOddSession) {
            this.log(sessionId, 'STEP_7_EXTRA', 'Odd session - clicking about menu...');
            const aboutClicked = await this.clickAboutMenu(page);
            if (aboutClicked) {
              await page.waitForTimeout(3000);
              // Kembali ke halaman sebelumnya
              await page.goBack();
            }
          }
        },
        successMessage: 'Continued reading completed' + (isOddSession ? ' with about menu click' : ''),
        timeout: 30000
      },
      
      // STEP 8: Click random link lagi
      {
        name: 'STEP_8',
        action: async () => {
          this.log(sessionId, 'STEP_8', 'Clicking another random link...');
          const clicked = await this.clickRandomLink(page);
          if (!clicked) {
            this.log(sessionId, 'STEP_8_SKIP', 'No suitable links found, skipping click step');
          }
        },
        successMessage: 'Second random click completed',
        timeout: 15000
      },
      
      // STEP 9: Klik iklan Google dan kembali (5 detik)
      {
        name: 'STEP_9',
        action: async () => {
          this.log(sessionId, 'STEP_9', 'Attempting to click Google ads with 5-second duration...');
          const adClicked = await this.clickGoogleAdsAndReturn(page, sessionId, config.targetUrl, 5000);
          if (!adClicked) {
            this.log(sessionId, 'STEP_9_SKIP', 'No Google ads found, skipping ad click step');
          }
        },
        successMessage: 'Google ads process completed',
        timeout: 45000
      },
      
      // STEP 10: Return to home
      {
        name: 'STEP_10',
        action: async () => {
          this.log(sessionId, 'STEP_10', 'Returning to home page...');
          await this.clickHome(page);
        },
        successMessage: 'Returned to home',
        timeout: 15000
      },
      
      // STEP 11: Clear cache & cookies
      {
        name: 'STEP_11',
        action: async () => {
          this.log(sessionId, 'STEP_11', 'Clearing cache and cookies...');
          await this.clearCacheAndCookies(page);
        },
        successMessage: 'Cache and cookies cleared',
        timeout: 5000
      }
    ];

    for (const step of steps) {
      try {
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

  // Method baru: Click About Menu
  async clickAboutMenu(page) {
    try {
      const aboutSelectors = [
        'a[href*="about"]',
        'a[href*="tentang"]', 
        'a[href*="about-us"]',
        'a[href*="tentang-kami"]',
        '.about-link',
        '[data-testid="about-link"]',
        'nav a[href*="about"]',
        'footer a[href*="about"]'
      ];
      
      for (const selector of aboutSelectors) {
        try {
          const elements = await page.$$(selector);
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
              await element.click();
              return true;
            }
          }
        } catch (e) {
          // Continue ke selector berikutnya
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  // Modifikasi method clickGoogleAdsAndReturn untuk durasi 5 detik
  async clickGoogleAdsAndReturn(page, sessionId, targetUrl, duration = 5000) {
    try {
      this.log(sessionId, 'GOOGLE_ADS_START', 'Looking for Google ads to click...');
      
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
      
      for (const selector of adSelectors) {
        try {
          const elements = await page.$$(selector);
          if (elements.length > 0) {
            this.log(sessionId, 'ADS_FOUND', `Found ${elements.length} elements with selector: ${selector}`);
            
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
              const randomAd = visibleElements[Math.floor(Math.random() * visibleElements.length)];
              
              const adUrl = await page.evaluate(el => {
                if (el.tagName === 'A') return el.href;
                const link = el.closest('a');
                return link ? link.href : null;
              }, randomAd);
              
              if (adUrl && (adUrl.includes('google') || adUrl.includes('doubleclick'))) {
                this.log(sessionId, 'AD_CLICK_ATTEMPT', `Attempting to click ad with URL: ${adUrl.substring(0, 100)}...`);
                
                await page.evaluate(el => {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, randomAd);
                
                await page.waitForTimeout(2000);
                
                await randomAd.click();
                adClicked = true;
                
                await page.waitForTimeout(3000); // Tunggu navigasi
                
                this.log(sessionId, 'AD_CLICKED', 'Successfully clicked Google ad, staying for 5 seconds');
                
                // Tepat 5 detik di halaman iklan
                await page.waitForTimeout(duration);
                
                // Close tab iklan jika ada tab baru, atau kembali
                const pages = await browser.pages();
                if (pages.length > 1) {
                  await pages[pages.length - 1].close();
                } else {
                  await page.goBack();
                }
                
                this.log(sessionId, 'AD_CLOSED', 'Ad closed and returned to main page');
                break;
              }
            }
          }
        } catch (error) {
          this.log(sessionId, 'AD_CLICK_ERROR', `Failed to click ad with selector ${selector}: ${error.message}`);
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

  // Method enhanced: Clear cache dan cookies
  async clearCacheAndCookies(page) {
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
      
      // Clear browser cache
      const client = await page.target().createCDPSession();
      await client.send('Network.clearBrowserCache');
      await client.send('Network.clearBrowserCookies');
      
      return true;
    } catch (error) {
      return false;
    }
  }

  // Human scroll method
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

  // Click random link method
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

  // Skip Google ads method
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

  // Click home method
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

  // Method untuk mendapatkan info proxy
  getProxyInfo() {
    return {
      total: this.proxyHandler.getAllProxies().length,
      active: this.proxyHandler.getActiveProxies().length,
      failed: this.proxyHandler.getFailedProxies().length
    };
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
        profileName: session.profileName,
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