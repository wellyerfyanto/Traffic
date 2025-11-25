const express = require('express');
const router = express.Router();

// Enhanced log streaming dengan memory management
class LogManager {
    constructor() {
        this.logStreams = new Map();
        this.maxLogEntries = 1000; // Prevent memory leaks
    }

    // Enhanced log streaming endpoint
    setupLogStream(req, res) {
        const sessionId = req.params.sessionId;
        
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });

        // Send initial connection message
        res.write(`data: ${JSON.stringify({
            type: 'CONNECTED',
            message: 'Log stream connected',
            timestamp: new Date().toISOString()
        })}\n\n`);

        // Store the response object for this session
        this.logStreams.set(sessionId, res);

        // Cleanup on client disconnect
        req.on('close', () => {
            this.logStreams.delete(sessionId);
            console.log(`📝 Log stream closed for session: ${sessionId}`);
        });

        // Heartbeat to keep connection alive
        const heartbeat = setInterval(() => {
            if (this.logStreams.has(sessionId)) {
                res.write(`data: ${JSON.stringify({
                    type: 'HEARTBEAT',
                    timestamp: new Date().toISOString()
                })}\n\n`);
            } else {
                clearInterval(heartbeat);
            }
        }, 30000);
    }

    // Broadcast log to specific session
    broadcastLog(sessionId, logData) {
        const res = this.logStreams.get(sessionId);
        if (res && !res.finished) {
            try {
                res.write(`data: ${JSON.stringify({
                    ...logData,
                    type: 'LOG_ENTRY',
                    timestamp: new Date().toISOString()
                })}\n\n`);
            } catch (error) {
                console.error('❌ Error broadcasting log:', error.message);
                this.logStreams.delete(sessionId);
            }
        }
    }

    // Broadcast to all sessions (for system-wide notifications)
    broadcastToAll(logData) {
        for (const [sessionId, res] of this.logStreams) {
            if (res && !res.finished) {
                try {
                    res.write(`data: ${JSON.stringify({
                        ...logData,
                        type: 'SYSTEM_LOG',
                        timestamp: new Date().toISOString()
                    })}\n\n`);
                } catch (error) {
                    console.error('❌ Error broadcasting to all:', error.message);
                    this.logStreams.delete(sessionId);
                }
            }
        }
    }

    // Get active log streams count
    getActiveStreams() {
        return this.logStreams.size;
    }

    // Cleanup all streams
    cleanup() {
        for (const [sessionId, res] of this.logStreams) {
            if (res && !res.finished) {
                try {
                    res.end();
                } catch (error) {
                    // Ignore errors during cleanup
                }
            }
        }
        this.logStreams.clear();
    }
}

// Create global log manager instance
const logManager = new LogManager();

// Log streaming endpoint
router.get('/stream/:sessionId', (req, res) => {
    logManager.setupLogStream(req, res);
});

// API endpoint untuk manual log injection (debug purposes)
router.post('/inject/:sessionId', (req, res) => {
    try {
        const { message, level = 'INFO' } = req.body;
        const sessionId = req.params.sessionId;
        
        logManager.broadcastLog(sessionId, {
            level,
            message,
            source: 'MANUAL_INJECTION'
        });
        
        res.json({ 
            success: true, 
            message: 'Log injected successfully' 
        });
    } catch (error) {
        console.error('Error injecting log:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Get log streams status
router.get('/status', (req, res) => {
    res.json({
        success: true,
        activeStreams: logManager.getActiveStreams(),
        streams: Array.from(logManager.logStreams.keys())
    });
});

// Cleanup endpoint (for maintenance)
router.post('/cleanup', (req, res) => {
    try {
        const beforeCount = logManager.getActiveStreams();
        logManager.cleanup();
        const afterCount = logManager.getActiveStreams();
        
        res.json({
            success: true,
            message: `Log streams cleaned up: ${beforeCount} -> ${afterCount}`,
            before: beforeCount,
            after: afterCount
        });
    } catch (error) {
        console.error('Error during log cleanup:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

module.exports = {
    router,
    logManager,
    LogManager
};