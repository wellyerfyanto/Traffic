const express = require('express');
const session = require('express-session');
const path = require('path');
const botManager = require('./bot/trafficGenerator');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'github-traffic-bot',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// API Routes
app.post('/api/start-session', async (req, res) => {
    const { profileCount, proxyList, targetUrl } = req.body;
    
    try {
        const sessionId = await botManager.startNewSession({
            profileCount,
            proxyList,
            targetUrl
        });
        res.json({ success: true, sessionId });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/session-logs/:sessionId', (req, res) => {
    const logs = botManager.getSessionLogs(req.params.sessionId);
    res.json(logs);
});

app.post('/api/stop-all-sessions', (req, res) => {
    botManager.stopAllSessions();
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
