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

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// ✅ Simple Session Configuration - No Redis issues
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

app.use(session(sessionConfig));

// Enhanced Traffic Generator dengan connection timeout fixes
const EnhancedTrafficGenerator = require('./bot/enhancedTrafficGenerator');
const botManager = new EnhancedTrafficGenerator();

// ✅ Railway-Optimized Configuration
const RAILWAY_CONFIG = {
  maxConcurrentSessions: parseInt(process.env.MAX_CONCURRENT_SESSIONS) || 2,
  maxTotalSessions: parseInt(process.env.MAX_TOTAL_SESSIONS) || 5,
  sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 180000,
  memoryLimit: parseInt(process.env.MEMORY_LIMIT) || 512,
  cpuLimit: parseInt(process.env.CPU_LIMIT) || 1
};

const AUTO_LOOP_CONFIG = {
  enabled: process.env.AUTO_LOOP === 'true' || false,
  interval: parseInt(process.env.LOOP_INTERVAL) || 30 * 60 * 1000,
  maxSessions: Math.min(parseInt(process.env.MAX_SESSIONS) || 2, RAILWAY_CONFIG.maxConcurrentSessions),
  targetUrl: process.env.DEFAULT_TARGET_URL || 'https://github.com',
  concurrentDelay: parseInt(process.env.CONCURRENT_DELAY) || 15000
};

let autoLoopInterval = null;
let pingInterval = null;
let stateSaveInterval = null;

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

// ✅ FIXED: Enhanced self-ping dengan error handling
function startSelfPing() {
  const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`;
  
  pingInterval = setInterval(async () => {
    try {
      const response = await fetch(`${baseUrl}/health`);
      const data = await response.json(); // ✅ FIX: Parse JSON response
      if (data.status === 'OK') {
        console.log('🏓 Self-ping successful - Keeping server alive');
      }
    } catch (error) {
      console.log('⚠️ Self-ping failed:', error.message);
    }
  }, 4 * 60 * 1000);
}

// ✅ FIXED: Enhanced auto-loop dengan better error handling
function startAutoLooping() {
  if (autoLoopInterval) {
    clearInterval(autoLoopInterval);
    autoLoopInterval = null;
  }

  if (!AUTO_LOOP_CONFIG.enabled) {
    console.log('⏸️ Auto-looping disabled');
    return;
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

        // ✅ FIX: Gunakan method langsung daripada API call internal
        const sessionId = await botManager.startNewSession(sessionConfig);
        
        if (sessionId) {
          console.log(`✅ AUTO-LOOP: Session ${sessionId} started successfully`);
          saveState();
        } else {
          throw new Error('Failed to create session');
        }
        
        // Delay between auto-loop sessions
        await new Promise(resolve => setTimeout(resolve, AUTO_LOOP_CONFIG.concurrentDelay));
      } else {
        console.log(`⏸️ AUTO-LOOP: ${resourceCheck.reason} (${activeSessions.length}/${AUTO_LOOP_CONFIG.maxSessions})`);
      }
    } catch (error) {
      console.error('❌ AUTO-LOOP: Error starting session:', error.message);
      // Jangan stop auto-loop karena error sesaat
    }
  }, AUTO_LOOP_CONFIG.interval);

  console.log('🔄 Auto-looping started');
}

// Initialize system
loadState();

if (AUTO_LOOP_CONFIG.enabled) {
  console.log('🔄 AUTO-LOOP: Starting with auto-looping enabled');
  startAutoLooping();
} else {
  console.log('⏸️ AUTO-LOOP: Disabled');
}

console.log('🏓 Starting self-ping mechanism...');
startSelfPing();

stateSaveInterval = setInterval(() => {
  saveState();
  console.log('💾 Auto-save: State saved');
}, 5 * 60 * 1000);

// ✅ FIXED: Enhanced API Routes dengan JSON response consistency

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/monitoring', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'monitoring.html'));
});

// ✅ FIXED: API Routes dengan consistent JSON response
app.post('/api/start-session', async (req, res) => {
  try {
    const { profiles, proxies, targetUrl, deviceType, autoLoop, useFreeProxy = true } = req.body;
    
    if (!targetUrl) {
      return res.status(400).json({
        success: false,
        error: 'Target URL is required'
      });
    }

    // Validasi URL format
    try {
      new URL(targetUrl);
    } catch (urlError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format'
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
    const resourceCheck = canStartNewSession();
    
    res.json({ 
      success: true, 
      sessions,
      resourceCheck
    });
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

// ✅ FIXED: Auto-loop API endpoints
app.post('/api/auto-loop/start', (req, res) => {
  try {
    const { interval, maxSessions, targetUrl } = req.body;
    
    AUTO_LOOP_CONFIG.enabled = true;
    AUTO_LOOP_CONFIG.interval = interval || AUTO_LOOP_CONFIG.interval;
    AUTO_LOOP_CONFIG.maxSessions = Math.min(maxSessions || AUTO_LOOP_CONFIG.maxSessions, RAILWAY_CONFIG.maxConcurrentSessions);
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
    const resourceCheck = canStartNewSession();
    
    res.json({
      success: true,
      config: AUTO_LOOP_CONFIG,
      activeSessions: activeSessions.length,
      totalSessions: botManager.getAllSessions().length,
      resourceCheck
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

// ✅ FIXED: Test connection endpoint dengan better error handling
app.post('/api/test-connection', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    // Validasi URL
    try {
      new URL(url);
    } catch (urlError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format'
      });
    }

    const pingResult = await botManager.pingTest(url);
    
    res.json({
      success: true,
      pingResult,
      recommendations: {
        suggestedTimeout: pingResult.success ? 
          (pingResult.responseTime < 1000 ? 45000 :
           pingResult.responseTime < 3000 ? 60000 :
           pingResult.responseTime < 8000 ? 90000 : 120000) : 120000,
        connectionQuality: pingResult.success ?
          (pingResult.responseTime < 1000 ? 'Excellent' :
           pingResult.responseTime < 3000 ? 'Good' :
           pingResult.responseTime < 8000 ? 'Fair' : 'Poor') : 'Failed'
      }
    });
  } catch (error) {
    console.error('Connection test error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.get('/api/system-resources', (req, res) => {
  try {
    const memoryUsage = getMemoryUsage();
    const activeSessions = botManager.getAllSessions().filter(s => s.status === 'running').length;
    const resourceCheck = canStartNewSession();
    
    res.json({
      success: true,
      resources: {
        memory: memoryUsage,
        activeSessions,
        maxConcurrentSessions: RAILWAY_CONFIG.maxConcurrentSessions,
        memoryLimit: RAILWAY_CONFIG.memoryLimit
      },
      resourceCheck,
      railwayConfig: RAILWAY_CONFIG
    });
  } catch (error) {
    console.error('Error getting system resources:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ FIXED: Health endpoint dengan consistent JSON
app.get('/health', (req, res) => {
  try {
    const activeSessions = botManager.getAllSessions().filter(s => s.status === 'running');
    const memoryUsage = getMemoryUsage();
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
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
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      error: error.message
    });
  }
});

// ✅ FIXED: Error handlers untuk consistent JSON response
app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    success: false, 
    error: `API endpoint not found: ${req.method} ${req.originalUrl}` 
  });
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
  console.log(`🔄 Auto-loop: ${AUTO_LOOP_CONFIG.enabled ? 'ENABLED' : 'DISABLED'}`);
  console.log(`💽 Memory Limit: ${RAILWAY_CONFIG.memoryLimit}MB`);
  console.log(`🎪 Max Concurrent Sessions: ${RAILWAY_CONFIG.maxConcurrentSessions}`);
  console.log(`🔐 Session Store: MemoryStore`);
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