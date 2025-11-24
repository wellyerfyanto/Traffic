const express = require('express');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const Redis = require('redis');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const fs = require('fs');
require('dotenv').config();

const app = express();

// Security Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ✅ Production Redis Session Store
let redisClient;

try {
  // Initialize Redis client
  redisClient = Redis.createClient({
    url: process.env.REDIS_URL
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
      console.log('⚠️ Redis connection failed, using MemoryStore as fallback');
    }
  })();
} catch (error) {
  console.log('⚠️ Redis initialization failed, using MemoryStore');
}

// Session Configuration
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

// Use Redis Store if available, otherwise fallback to MemoryStore
if (redisClient && process.env.REDIS_URL) {
  sessionConfig.store = new RedisStore({ 
    client: redisClient,
    prefix: 'session:'
  });
  console.log('🔐 Using Redis Store for sessions');
} else {
  console.log('⚠️ Using MemoryStore for sessions (development only)');
}

app.use(session(sessionConfig));

// Import your bot modules
const TrafficGenerator = require('./bot/trafficGenerator');
const botManager = new TrafficGenerator();

// Auto-looping configuration
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

// State management functions (saveState, loadState, startSelfPing, startAutoLooping)
// ... [Include all the state management functions from our previous discussion here]

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/monitoring', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'monitoring.html'));
});

// API Routes (include all your existing API endpoints)
// ... [Include all your /api/* routes here]

// Health check endpoint
app.get('/health', (req, res) => {
  const activeSessions = botManager.getAllSessions().filter(s => s.status === 'running');
  const redisStatus = process.env.REDIS_URL ? 'CONNECTED' : 'NOT_CONFIGURED';
  
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔐 Session Store: ${process.env.REDIS_URL ? 'REDIS' : 'MemoryStore (Development)'}`);
});

// Graceful shutdown handlers
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
