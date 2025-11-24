const express = require('express');
const session = require('express-session');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const app = express();

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ✅ FIXED SESSION CONFIGURATION - No Redis connection errors
let redisClient = null;
let RedisStore = null;

// Only try to use Redis if REDIS_URL is available
if (process.env.REDIS_URL) {
  try {
    RedisStore = require('connect-redis').default;
    const Redis = require('redis');
    
    console.log('🔗 Initializing Redis connection...');
    
    redisClient = Redis.createClient({
      url: process.env.REDIS_URL,
      socket: {
        connectTimeout: 60000,
        lazyConnect: true
      }
    });

    redisClient.on('error', (err) => {
      console.log('❌ Redis Client Error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('✅ Connected to Redis successfully');
    });

    // Connect to Redis
    (async () => {
      try {
        await redisClient.connect();
        console.log('🔗 Redis connection established');
      } catch (error) {
        console.log('❌ Redis connection failed:', error.message);
        redisClient = null;
      }
    })();
  } catch (error) {
    console.log('❌ Redis initialization failed:', error.message);
    redisClient = null;
  }
} else {
  console.log('ℹ️  REDIS_URL not found, using MemoryStore');
}

// Session Configuration with proper fallback
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'github-traffic-bot-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true
  }
};

// Only use RedisStore if Redis client is properly connected
if (redisClient && RedisStore) {
  sessionConfig.store = new RedisStore({ 
    client: redisClient,
    prefix: 'session:'
  });
  console.log('🔐 Using Redis Store for sessions');
} else {
  console.log('⚠️ Using MemoryStore for sessions (Redis not available)');
}

app.use(session(sessionConfig));

const TrafficGenerator = require('./bot/trafficGenerator');
const botManager = new TrafficGenerator();

const AUTO_LOOP_CONFIG = {
  enabled: process.env.AUTO_LOOP === 'true' || false,
  interval: parseInt(process.env.LOOP_INTERVAL) || 30 * 60 * 1000,
  maxSessions: parseInt(process.env.MAX_SESSIONS) || 10,
  targetUrl: process.env.DEFAULT_TARGET_URL || 'https://github.com'
};

let autoLoopInterval = null;
let pingInterval = null;
let stateSaveInterval = null;

const STATE_FILE = './state.json';

function saveState() {
  try {
    const state = {
      autoLoopConfig: AUTO_LOOP_CONFIG,
      sessions: botManager.getAllSessions(),
      proxyInfo: botManager.getProxyInfo(),
      activeProxies: botManager.proxyHandler.getActiveProxies(),
      failedProxies: botManager.proxyHandler.getFailedProxies(),
      proxyList: botManager.proxyHandler.getAllProxies(),
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log('💾 State saved successfully');
  } catch (error) {
    console.error('❌ Error saving state:', error.message);
  }
}

function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const stateData = fs.readFileSync(STATE_FILE, 'utf8');
      const state = JSON.parse(stateData);
      
      if (state.autoLoopConfig) {
        Object.assign(AUTO_LOOP_CONFIG, state.autoLoopConfig);
      }
      
      if (state.proxyList && Array.isArray(state.proxyList)) {
        botManager.proxyHandler.clearProxies();
        botManager.proxyHandler.addMultipleProxies(state.proxyList);
      }
      
      if (state.activeProxies && Array.isArray(state.activeProxies)) {
        state.activeProxies.forEach(proxy => {
          botManager.proxyHandler.markProxyAsActive(proxy);
        });
      }
      
      console.log('💾 State loaded successfully');
      console.log(`🔄 Auto-loop: ${AUTO_LOOP_CONFIG.enabled ? 'ENABLED' : 'DISABLED'}`);
      console.log(`📊 Previous sessions: ${state.sessions ? state.sessions.length : 0}`);
      console.log(`🔌 Previous proxies: ${state.proxyList ? state.proxyList.length : 0}`);
    }
  } catch (error) {
    console.error('❌ Error loading state:', error.message);
  }
}

function startSelfPing() {
  const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`;
  
  pingInterval = setInterval(async () => {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        console.log('🏓 Self-ping successful - Keeping server alive');
      }
    } catch (error) {
      console.log('⚠️ Self-ping failed, but continuing...');
    }
  }, 4 * 60 * 1000);
}

function startAutoLooping() {
  if (autoLoopInterval) {
    clearInterval(autoLoopInterval);
  }

  autoLoopInterval = setInterval(async () => {
    try {
      const activeSessions = botManager.getAllSessions().filter(s => s.status === 'running');
      
      if (activeSessions.length < AUTO_LOOP_CONFIG.maxSessions) {
        console.log(`🔄 AUTO-LOOP: Starting new automated session (${activeSessions.length + 1}/${AUTO_LOOP_CONFIG.maxSessions})`);
        
        const sessionConfig = {
          profileCount: 1,
          proxyList: process.env.DEFAULT_PROXIES ? 
            process.env.DEFAULT_PROXIES.split(',').map(p => p.trim()).filter(p => p) : [],
          targetUrl: AUTO_LOOP_CONFIG.targetUrl,
          deviceType: Math.random() > 0.5 ? 'desktop' : 'mobile',
          isAutoLoop: true,
          maxRestarts: 5
        };

        await botManager.startNewSession(sessionConfig);
        
        console.log(`✅ AUTO-LOOP: Session started successfully`);
        saveState();
      } else {
        console.log(`⏸️ AUTO-LOOP: Maximum sessions reached (${activeSessions.length}/${AUTO_LOOP_CONFIG.maxSessions})`);
      }
    } catch (error) {
      console.error('❌ AUTO-LOOP: Error starting session:', error.message);
    }
  }, AUTO_LOOP_CONFIG.interval);
}

loadState();

if (AUTO_LOOP_CONFIG.enabled) {
  console.log('🔄 AUTO-LOOP: System starting with auto-looping enabled');
  startAutoLooping();
}

console.log('🏓 Starting self-ping mechanism...');
startSelfPing();

stateSaveInterval = setInterval(() => {
  saveState();
  console.log('💾 Auto-save: State saved automatically');
}, 5 * 60 * 1000);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/monitoring', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'monitoring.html'));
});

app.post('/api/start-session', async (req, res) => {
  try {
    console.log('Starting new session with config:', {
      ...req.body,
      proxies: req.body.proxies ? '***' + req.body.proxies.split('\n').length + ' proxies***' : 'none'
    });
    
    const { profiles, proxies, targetUrl, deviceType, autoLoop } = req.body;
    
    if (!targetUrl) {
      return res.status(400).json({
        success: false,
        error: 'Target URL is required'
      });
    }

    const sessionConfig = {
      profileCount: parseInt(profiles) || 1,
      proxyList: proxies ? proxies.split('\n')
        .map(p => p.trim())
        .filter(p => p && p.includes(':')) : [],
      targetUrl: targetUrl,
      deviceType: deviceType || 'desktop',
      isAutoLoop: autoLoop || false,
      maxRestarts: autoLoop ? 5 : 0
    };

    const sessionId = await botManager.startNewSession(sessionConfig);
    
    saveState();
    
    res.json({ 
      success: true, 
      sessionId,
      message: 'Session started with enhanced proxy management and random profiles'
    });
  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.get('/api/session-logs/:sessionId', (req, res) => {
  try {
    const logs = botManager.getSessionLogs(req.params.sessionId);
    res.json({ success: true, logs });
  } catch (error) {
    console.error('Error getting session logs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/all-sessions', (req, res) => {
  try {
    const sessions = botManager.getAllSessions();
    res.json({ success: true, sessions });
  } catch (error) {
    console.error('Error getting all sessions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/stop-session/:sessionId', (req, res) => {
  try {
    botManager.stopSession(req.params.sessionId);
    saveState();
    res.json({ success: true, message: 'Session stopped' });
  } catch (error) {
    console.error('Error stopping session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/stop-all-sessions', (req, res) => {
  try {
    botManager.stopAllSessions();
    saveState();
    res.json({ success: true, message: 'All sessions stopped' });
  } catch (error) {
    console.error('Error stopping all sessions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/clear-sessions', (req, res) => {
  try {
    botManager.clearAllSessions();
    saveState();
    res.json({ success: true, message: 'All sessions cleared' });
  } catch (error) {
    console.error('Error clearing sessions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/auto-loop/start', (req, res) => {
  try {
    const { interval, maxSessions, targetUrl } = req.body;
    
    AUTO_LOOP_CONFIG.enabled = true;
    AUTO_LOOP_CONFIG.interval = interval || AUTO_LOOP_CONFIG.interval;
    AUTO_LOOP_CONFIG.maxSessions = maxSessions || AUTO_LOOP_CONFIG.maxSessions;
    AUTO_LOOP_CONFIG.targetUrl = targetUrl || AUTO_LOOP_CONFIG.targetUrl;
    
    startAutoLooping();
    saveState();
    
    res.json({
      success: true,
      message: `Auto-looping started with ${AUTO_LOOP_CONFIG.interval/60000} minute intervals`,
      config: AUTO_LOOP_CONFIG
    });
  } catch (error) {
    console.error('Error starting auto-loop:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/auto-loop/stop', (req, res) => {
  try {
    AUTO_LOOP_CONFIG.enabled = false;
    if (autoLoopInterval) {
      clearInterval(autoLoopInterval);
      autoLoopInterval = null;
    }
    
    saveState();
    
    res.json({
      success: true,
      message: 'Auto-looping stopped'
    });
  } catch (error) {
    console.error('Error stopping auto-loop:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/auto-loop/status', (req, res) => {
  try {
    const activeSessions = botManager.getAllSessions().filter(s => s.status === 'running');
    
    res.json({
      success: true,
      config: AUTO_LOOP_CONFIG,
      activeSessions: activeSessions.length,
      totalSessions: botManager.getAllSessions().length
    });
  } catch (error) {
    console.error('Error getting auto-loop status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/proxy-info', (req, res) => {
  try {
    const proxyInfo = botManager.getProxyInfo();
    res.json({ 
      success: true, 
      proxyInfo,
      activeProxies: botManager.proxyHandler.getActiveProxies(),
      failedProxies: botManager.proxyHandler.getFailedProxies()
    });
  } catch (error) {
    console.error('Error getting proxy info:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/clear-proxies', (req, res) => {
  try {
    botManager.proxyHandler.clearProxies();
    saveState();
    res.json({ success: true, message: 'All proxies cleared' });
  } catch (error) {
    console.error('Error clearing proxies:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/save-state', (req, res) => {
  try {
    saveState();
    res.json({ success: true, message: 'State saved manually' });
  } catch (error) {
    console.error('Error saving state:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/load-state', (req, res) => {
  try {
    loadState();
    res.json({ success: true, message: 'State loaded manually' });
  } catch (error) {
    console.error('Error loading state:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/test-puppeteer', async (req, res) => {
  try {
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ 
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=site-per-process',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--window-size=1920,1080'
      ],
      ignoreDefaultArgs: ['--disable-extensions'],
      timeout: 60000
    });
    
    const page = await browser.newPage();
    
    await page.setDefaultNavigationTimeout(60000);
    await page.setDefaultTimeout(30000);
    
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    await page.goto('https://example.com', { 
      waitUntil: 'domcontentloaded',
      timeout: 45000 
    });
    
    const title = await page.title();
    await browser.close();
    
    res.json({ 
      success: true, 
      message: 'Puppeteer test successful',
      title: title
    });
  } catch (error) {
    console.error('Puppeteer test failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      chromePath: process.env.PUPPETEER_EXECUTABLE_PATH 
    });
  }
});

app.get('/health', (req, res) => {
  const activeSessions = botManager.getAllSessions().filter(s => s.status === 'running');
  
  const redisStatus = process.env.REDIS_URL ? 'CONFIGURED' : 'NOT_CONFIGURED';
  
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    redis: redisStatus,
    autoLoop: {
      enabled: AUTO_LOOP_CONFIG.enabled,
      activeSessions: activeSessions.length,
      maxSessions: AUTO_LOOP_CONFIG.maxSessions,
      interval: AUTO_LOOP_CONFIG.interval
    },
    proxyInfo: botManager.getProxyInfo(),
    selfPing: 'ACTIVE',
    stateManagement: 'ENABLED'
  });
});

app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    error: `API endpoint not found: ${req.method} ${req.originalUrl}` 
  });
});

app.use((req, res) => {
  if (req.url.startsWith('/api/')) {
    res.status(404).json({ 
      success: false, 
      error: 'API endpoint not found' 
    });
  } else {
    res.status(404).send(`
      <html>
        <head><title>404 - Page Not Found</title></head>
        <body>
          <h1>404 - Page Not Found</h1>
          <p>The page you are looking for does not exist.</p>
          <a href="/">Go to Home Page</a>
        </body>
      </html>
    `);
  }
});

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔧 Puppeteer path: ${process.env.PUPPETEER_EXECUTABLE_PATH || 'default'}`);
  console.log(`🔄 Auto-loop: ${AUTO_LOOP_CONFIG.enabled ? 'ENABLED' : 'DISABLED'}`);
  console.log(`⏰ Auto-loop interval: ${AUTO_LOOP_CONFIG.interval/60000} minutes`);
  console.log(`📈 Max sessions: ${AUTO_LOOP_CONFIG.maxSessions}`);
  console.log(`🎯 Target URL: ${AUTO_LOOP_CONFIG.targetUrl}`);
  console.log(`👤 Random Profile System: ENABLED`);
  console.log(`🔌 Smart Proxy Management: ENABLED`);
  console.log(`🏓 Self-Ping System: ENABLED`);
  console.log(`💾 State Persistence: ENABLED`);
  console.log(`🛡️  Anti-Shutdown Protection: ACTIVE`);
  console.log(`🔐 Session Store: ${process.env.REDIS_URL ? 'REDIS' : 'MemoryStore (Development)'}`);
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down gracefully...');
  saveState();
  if (autoLoopInterval) {
    clearInterval(autoLoopInterval);
  }
  if (pingInterval) {
    clearInterval(pingInterval);
  }
  if (stateSaveInterval) {
    clearInterval(stateSaveInterval);
  }
  botManager.stopAllSessions();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  saveState();
  if (autoLoopInterval) {
    clearInterval(autoLoopInterval);
  }
  if (pingInterval) {
    clearInterval(pingInterval);
  }
  if (stateSaveInterval) {
    clearInterval(stateSaveInterval);
  }
  botManager.stopAllSessions();
  process.exit(0);
});