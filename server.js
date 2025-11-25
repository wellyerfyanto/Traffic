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

// ✅ FIXED REDIS CONFIGURATION - No more ECONNREFUSED errors
let redisClient = null;
let RedisStore = null;

// Simple Redis configuration - remove Redis if not needed
if (process.env.USE_REDIS === 'true' && process.env.REDIS_URL) {
  try {
    RedisStore = require('connect-redis').default;
    const Redis = require('redis');
    
    console.log('🔗 Attempting Redis connection...');
    
    redisClient = Redis.createClient({
      url: process.env.REDIS_URL,
      socket: {
        connectTimeout: 10000,
        lazyConnect: true,
        reconnectStrategy: (retries) => {
          if (retries > 2) {
            console.log('❌ Max Redis retries reached, using MemoryStore');
            return false;
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    redisClient.on('error', (err) => {
      console.log('❌ Redis Client Error:', err.message);
      if (err.code === 'ECONNREFUSED') {
        console.log('⚠️  Redis server not available, falling back to MemoryStore');
        redisClient = null;
      }
    });

    redisClient.on('connect', () => {
      console.log('✅ Connected to Redis successfully');
    });

    // Connect to Redis with timeout
    (async () => {
      try {
        const connectionPromise = redisClient.connect();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis connection timeout')), 10000)
        );
        
        await Promise.race([connectionPromise, timeoutPromise]);
        console.log('🔗 Redis connection established');
      } catch (error) {
        console.log('❌ Redis connection failed:', error.message);
        console.log('🔄 Falling back to MemoryStore for sessions');
        redisClient = null;
      }
    })();
  } catch (error) {
    console.log('❌ Redis initialization failed:', error.message);
    redisClient = null;
  }
} else {
  console.log('ℹ️  Redis not configured, using MemoryStore');
}

// Session Configuration dengan proper fallback
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

// Enhanced Traffic Generator dengan connection timeout fixes
const EnhancedTrafficGenerator = require('./bot/enhancedTrafficGenerator');
const botManager = new EnhancedTrafficGenerator();

// ✅ Railway-Optimized Configuration
const RAILWAY_CONFIG = {
  maxConcurrentSessions: parseInt(process.env.MAX_CONCURRENT_SESSIONS) || 2, // Reduced for stability
  maxTotalSessions: parseInt(process.env.MAX_TOTAL_SESSIONS) || 5,
  sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 180000, // Increased to 3 minutes
  memoryLimit: parseInt(process.env.MEMORY_LIMIT) || 512,
  cpuLimit: parseInt(process.env.CPU_LIMIT) || 1
};

const AUTO_LOOP_CONFIG = {
  enabled: process.env.AUTO_LOOP === 'true' || false,
  interval: parseInt(process.env.LOOP_INTERVAL) || 30 * 60 * 1000,
  maxSessions: Math.min(parseInt(process.env.MAX_SESSIONS) || 3, RAILWAY_CONFIG.maxConcurrentSessions),
  targetUrl: process.env.DEFAULT_TARGET_URL || 'https://github.com',
  concurrentDelay: parseInt(process.env.CONCURRENT_DELAY) || 15000 // Increased delay
};

let autoLoopInterval = null;
let pingInterval = null;
let stateSaveInterval = null;
let sessionQueue = [];

const STATE_FILE = './state.json';

// Enhanced Resource Monitoring
function getMemoryUsage() {
  const used = process.memoryUsage();
  return {
    rss: Math.round(used.rss / 1024 / 1024 * 100) / 100,
    heapTotal: Math.round(used.heapTotal / 1024 / 1024 * 100) / 100,
    heapUsed: Math.round(used.heapUsed / 1024 / 1024 * 100) / 100,
    external: Math.round(used.external / 1024 / 1024 * 100) / 100
  };
}

function canStartNewSession() {
  const activeSessions = botManager.getAllSessions().filter(s => s.status === 'running').length;
  const memoryUsage = getMemoryUsage();
  
  // Check resource limits
  const memoryOverLimit = memoryUsage.rss > RAILWAY_CONFIG.memoryLimit * 0.8;
  const sessionOverLimit = activeSessions >= RAILWAY_CONFIG.maxConcurrentSessions;
  
  return {
    canStart: !memoryOverLimit && !sessionOverLimit,
    reason: memoryOverLimit ? 'Memory limit reached' : 
            sessionOverLimit ? 'Session limit reached' : 'OK',
    activeSessions,
    memoryUsage
  };
}

// Save State function
function saveState() {
  try {
    const state = {
      railwayConfig: RAILWAY_CONFIG,
      autoLoopConfig: AUTO_LOOP_CONFIG,
      sessions: botManager.getAllSessions(),
      proxyInfo: botManager.getProxyInfo(),
      activeProxies: botManager.proxyHandler.getActiveProxies(),
      failedProxies: botManager.proxyHandler.getFailedProxies(),
      proxyList: botManager.proxyHandler.getAllProxies(),
      timestamp: new Date().toISOString(),
      memoryUsage: getMemoryUsage()
    };
    
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    console.log('💾 State saved successfully');
  } catch (error) {
    console.error('❌ Error saving state:', error.message);
  }
}

// Load State function  
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const stateData = fs.readFileSync(STATE_FILE, 'utf8');
      const state = JSON.parse(stateData);
      
      if (state.railwayConfig) {
        Object.assign(RAILWAY_CONFIG, state.railwayConfig);
      }
      
      if (state.autoLoopConfig) {
        Object.assign(AUTO_LOOP_CONFIG, state.autoLoopConfig);
      }
      
      if (state.proxyList && Array.isArray(state.proxyList)) {
        botManager.proxyHandler.clearProxies();
        botManager.proxyHandler.addMultipleProxies(state.proxyList);
      }
      
      console.log('💾 State loaded successfully');
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
      const resourceCheck = canStartNewSession();
      
      if (resourceCheck.canStart && activeSessions.length < AUTO_LOOP_CONFIG.maxSessions) {
        console.log(`🔄 AUTO-LOOP: Starting new session (${activeSessions.length + 1}/${AUTO_LOOP_CONFIG.maxSessions})`);
        
        const sessionConfig = {
          profileCount: 1,
          proxyList: process.env.DEFAULT_PROXIES ? 
            process.env.DEFAULT_PROXIES.split(',').map(p => p.trim()).filter(p => p) : [],
          targetUrl: AUTO_LOOP_CONFIG.targetUrl,
          deviceType: Math.random() > 0.5 ? 'desktop' : 'mobile',
          isAutoLoop: true,
          maxRestarts: 2,
          useFreeProxy: true
        };

        await botManager.startNewSession(sessionConfig);
        
        console.log(`✅ AUTO-LOOP: Session started`);
        saveState();
        
        // Delay between auto-loop sessions
        await new Promise(resolve => setTimeout(resolve, AUTO_LOOP_CONFIG.concurrentDelay));
      } else {
        console.log(`⏸️ AUTO-LOOP: ${resourceCheck.reason} (${activeSessions.length}/${AUTO_LOOP_CONFIG.maxSessions})`);
      }
    } catch (error) {
      console.error('❌ AUTO-LOOP: Error starting session:', error.message);
    }
  }, AUTO_LOOP_CONFIG.interval);
}

// Initialize system
loadState();

if (AUTO_LOOP_CONFIG.enabled) {
  console.log('🔄 AUTO-LOOP: Starting with auto-looping enabled');
  startAutoLooping();
}

console.log('🏓 Starting self-ping mechanism...');
startSelfPing();

stateSaveInterval = setInterval(() => {
  saveState();
  console.log('💾 Auto-save: State saved');
}, 5 * 60 * 1000);

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/monitoring', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'monitoring.html'));
});

app.post('/api/start-session', async (req, res) => {
  try {
    const { profiles, proxies, targetUrl, deviceType, autoLoop, useFreeProxy = true } = req.body;
    
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
      maxRestarts: autoLoop ? 2 : 0,
      useFreeProxy: useFreeProxy !== false
    };

    const resourceCheck = canStartNewSession();
    
    if (!resourceCheck.canStart) {
      return res.json({ 
        success: true, 
        queued: true,
        message: `Session queued. ${resourceCheck.reason}`,
        resourceCheck
      });
    }

    const sessionId = await botManager.startNewSession(sessionConfig);
    
    saveState();
    
    res.json({ 
      success: true, 
      sessionId,
      queued: false,
      message: 'Session started successfully',
      resourceCheck
    });
  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Include other API endpoints (they remain the same as your original)
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

app.get('/health', (req, res) => {
  const activeSessions = botManager.getAllSessions().filter(s => s.status === 'running');
  const memoryUsage = getMemoryUsage();
  
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    redis: redisClient ? 'CONNECTED' : 'DISABLED',
    resources: {
      memory: memoryUsage.rss,
      memoryLimit: RAILWAY_CONFIG.memoryLimit,
      activeSessions: activeSessions.length,
      maxSessions: RAILWAY_CONFIG.maxConcurrentSessions
    },
    autoLoop: {
      enabled: AUTO_LOOP_CONFIG.enabled,
      activeSessions: activeSessions.length,
      maxSessions: AUTO_LOOP_CONFIG.maxSessions
    },
    proxyInfo: botManager.getProxyInfo()
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔧 Puppeteer path: ${process.env.PUPPETEER_EXECUTABLE_PATH || 'default'}`);
  console.log(`🔄 Auto-loop: ${AUTO_LOOP_CONFIG.enabled ? 'ENABLED' : 'DISABLED'}`);
  console.log(`💽 Memory Limit: ${RAILWAY_CONFIG.memoryLimit}MB`);
  console.log(`🎪 Max Concurrent Sessions: ${RAILWAY_CONFIG.maxConcurrentSessions}`);
  console.log(`🔐 Session Store: ${redisClient ? 'REDIS' : 'MemoryStore'}`);
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down gracefully...');
  saveState();
  if (autoLoopInterval) clearInterval(autoLoopInterval);
  if (pingInterval) clearInterval(pingInterval);
  if (stateSaveInterval) clearInterval(stateSaveInterval);
  botManager.stopAllSessions();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  saveState();
  if (autoLoopInterval) clearInterval(autoLoopInterval);
  if (pingInterval) clearInterval(pingInterval);
  if (stateSaveInterval) clearInterval(stateSaveInterval);
  botManager.stopAllSessions();
  process.exit(0);
});