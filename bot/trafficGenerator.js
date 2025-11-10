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
        this.isRunning = false;
    }

    async testPuppeteer() {
        let browser;
        try {
            browser = await puppeteer.launch({
                headless: true,
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
            await page.goto('https://httpbin.org/ip', { waitUntil: 'networkidle2' });
            const content = await page.content();
            
            return { 
                success: true, 
                message: 'Puppeteer is working correctly',
                chromePath: process.env.PUPPETEER_EXECUTABLE_PATH 
            };
        } catch (error) {
            throw new Error(`Puppeteer test failed: ${error.message}`);
        } finally {
            if (browser) await browser.close();
        }
    }

    async startNewSession(config) {
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Tambahkan proxy manual ke handler jika ada
        if (config.proxyList && config.proxyList.length > 0) {
            this.proxyHandler.addMultipleProxies(config.proxyList);
        }

        this.sessionLogs.set(sessionId, []);
        this.activeSessions.set(sessionId, {
            id: sessionId,
            config: config,
            status: 'running',
            startTime: new Date(),
            currentStep: 0
        });

        this.log(sessionId, 'SESSION_STARTED', `Session started dengan ${config.profileCount} profiles`);
        
        // Execute session in background
        this.executeSession(sessionId, config).catch(error => {
            this.log(sessionId, 'SESSION_ERROR', `Session failed: ${error.message}`);
            this.stopSession(sessionId);
        });

        return sessionId;
    }

    async executeSession(sessionId, config) {
        let browser;
        try {
            // STEP 1: Launch Browser dengan Proxy
            this.log(sessionId, 'STEP_1', 'Launching browser dengan proxy...');
            browser = await this.launchBrowser(config);
            const page = await browser.newPage();

            // Setup User Agent
            const userAgent = new UserAgents({ 
                deviceCategory: config.deviceType 
            }).toString();
            await page.setUserAgent(userAgent);
            await page.setViewport({ 
                width: config.deviceType === 'mobile' ? 375 : 1280, 
                height: config.deviceType === 'mobile' ? 667 : 720 
            });

            this.log(sessionId, 'STEP_1_COMPLETE', `Browser launched dengan ${config.deviceType} user agent`);

            // STEP 2: Buka Target URL
            this.log(sessionId, 'STEP_2', `Membuka URL target: ${config.targetUrl}`);
            await page.goto(config.targetUrl, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });
            
            // Cek kebocoran data
            const currentUrl = page.url();
            if (currentUrl.includes('google.com') && currentUrl.includes('url=')) {
                this.log(sessionId, 'DATA_LEAK_CHECK', 'Peringatan: Kemungkinan kebocoran data terdeteksi');
            }

            this.log(sessionId, 'STEP_2_COMPLETE', 'Berhasil membuka URL target');

            // STEP 3: Simulasi Scroll Manusia
            this.log(sessionId, 'STEP_3', 'Memulai simulasi scroll manusia...');
            await this.humanScroll(page);
            this.log(sessionId, 'STEP_3_COMPLETE', 'Simulasi scroll selesai');

            // STEP 4: Klik Random Post
            this.log(sessionId, 'STEP_4', 'Mencari postingan untuk diklik...');
            await this.clickRandomLink(page);
            this.log(sessionId, 'STEP_4_COMPLETE', 'Berhasil klik postingan');

            // STEP 5: Skip Google Ads jika ada
            this.log(sessionId, 'STEP_5', 'Memeriksa iklan Google...');
            await this.skipGoogleAds(page);
            this.log(sessionId, 'STEP_5_COMPLETE', 'Iklan dilewati');

            // STEP 6: Lanjutkan Reading dengan Scroll
            this.log(sessionId, 'STEP_6', 'Melanjutkan membaca dengan scroll...');
            await this.humanScroll(page);
            this.log(sessionId, 'STEP_6_COMPLETE', 'Membaca selesai');

            // STEP 7: Klik Menu Home
            this.log(sessionId, 'STEP_7', 'Kembali ke home...');
            await this.clickHome(page);
            this.log(sessionId, 'STEP_7_COMPLETE', 'Berhasil kembali ke home');

            // STEP 8: Clear Cache
            this.log(sessionId, 'STEP_8', 'Membersihkan cache...');
            await this.clearCache(browser);
            this.log(sessionId, 'STEP_8_COMPLETE', 'Cache dibersihkan');

            // Session Completed
            this.log(sessionId, 'SESSION_COMPLETED', 'Semua step berhasil diselesaikan');
            this.stopSession(sessionId);

        } catch (error) {
            this.log(sessionId, 'ERROR', `Error pada step execution: ${error.message}`);
            this.stopSession(sessionId);
        } finally {
            if (browser) {
                await browser.close();
                this.log(sessionId, 'BROWSER_CLOSED', 'Browser ditutup');
            }
        }
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

        // Add proxy jika tersedia
        if (config.proxyList && config.proxyList.length > 0) {
            const randomProxy = config.proxyList[Math.floor(Math.random() * config.proxyList.length)];
            args.push(`--proxy-server=${randomProxy}`);
            this.log('PROXY_INFO', `Menggunakan proxy: ${randomProxy}`);
        }

        return await puppeteer.launch({
            headless: true,
            args: args,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
        });
    }

    async humanScroll(page) {
        const viewportHeight = page.viewport().height;
        let scrollHeight = 0;
        
        // Get total scroll height
        const totalHeight = await page.evaluate(() => document.body.scrollHeight);
        
        while (scrollHeight < totalHeight) {
            // Scroll random amount (100-300px)
            const scrollAmount = Math.floor(Math.random() * 200) + 100;
            scrollHeight += scrollAmount;
            
            await page.evaluate((scrollTo) => {
                window.scrollTo(0, scrollTo);
            }, scrollHeight);
            
            // Random delay between scrolls (1-3 seconds)
            await page.waitForTimeout(Math.random() * 2000 + 1000);
        }
        
        // Scroll back to top
        await page.evaluate(() => {
            window.scrollTo(0, 0);
        });
    }

    async clickRandomLink(page) {
        try {
            // Cari semua link yang mungkin
            const links = await page.$$eval('a[href]', anchors => 
                anchors
                    .filter(a => a.href && !a.href.includes('#') && a.href !== window.location.href)
                    .map(a => ({ href: a.href, text: a.textContent }))
            );
            
            if (links.length > 0) {
                const randomLink = links[Math.floor(Math.random() * links.length)];
                await page.click(`a[href="${randomLink.href}"]`);
                await page.waitForTimeout(2000);
                return true;
            }
            return false;
        } catch (error) {
            console.log('Tidak bisa klik link:', error.message);
            return false;
        }
    }

    async skipGoogleAds(page) {
        try {
            // Coba skip berbagai jenis iklan Google
            const skipSelectors = [
                'button[aria-label="Skip ad"]',
                '.videoAdUiSkipButton',
                '.ytp-ad-skip-button',
                'div.skip-ad-button'
            ];
            
            for (const selector of skipSelectors) {
                try {
                    const element = await page.$(selector);
                    if (element) {
                        await element.click();
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
            // Coba berbagai selector untuk home button
            const homeSelectors = [
                'a[href="/"]',
                'a[href*="home"]',
                '.home-button',
                '.navbar-brand',
                'header a'
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
            return false;
        } catch (error) {
            return false;
        }
    }

    async clearCache(browser) {
        try {
            const pages = await browser.pages();
            for (const page of pages) {
                await page.evaluate(() => {
                    localStorage.clear();
                    sessionStorage.clear();
                });
            }
        } catch (error) {
            // Ignore cache clearing errors
        }
    }

    // Log management
    log(sessionId, step, message) {
        const timestamp = new Date().toLocaleString('id-ID');
        const logEntry = { timestamp, step, message };
        
        if (this.sessionLogs.has(sessionId)) {
            this.sessionLogs.get(sessionId).push(logEntry);
        }
        
        console.log(`[${sessionId}] ${step}: ${message}`);
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
                config: session.config
            });
        }
        return sessions;
    }

    stopSession(sessionId) {
        if (this.activeSessions.has(sessionId)) {
            this.activeSessions.get(sessionId).status = 'stopped';
            this.log(sessionId, 'SESSION_STOPPED', 'Session dihentikan');
        }
    }

    stopAllSessions() {
        for (const [sessionId] of this.activeSessions) {
            this.stopSession(sessionId);
        }
    }

    clearAllSessions() {
        this.activeSessions.clear();
        this.sessionLogs.clear();
    }
}

module.exports = TrafficGenerator;
