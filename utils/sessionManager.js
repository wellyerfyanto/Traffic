// Enhanced Session Manager dengan concurrent session support
class EnhancedSessionManager {
    constructor() {
        this.sessions = new Map();
        this.sessionQueue = [];
        this.maxConcurrentSessions = 5;
        this.sessionTimeouts = new Map();
        this.resourceMonitor = null;
    }

    setResourceMonitor(monitor) {
        this.resourceMonitor = monitor;
    }

    createSession(config) {
        const sessionId = this.generateSessionId();
        
        const session = {
            id: sessionId,
            config: config,
            status: 'running',
            logs: [],
            startTime: new Date(),
            endTime: null,
            currentStep: 0,
            progress: 0,
            stats: {
                pagesVisited: 0,
                clicks: 0,
                scrolls: 0,
                errors: 0,
                proxiesUsed: 0
            },
            resourceUsage: {
                memory: 0,
                cpu: 0,
                duration: 0
            },
            browserInfo: {
                userAgent: '',
                viewport: '',
                proxy: null
            }
        };
        
        this.sessions.set(sessionId, session);
        
        // Setup session timeout jika ada duration limit
        if (config.maxDuration) {
            this.setupSessionTimeout(sessionId, config.maxDuration);
        }
        
        return session;
    }

    generateSessionId() {
        return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    setupSessionTimeout(sessionId, duration) {
        const timeout = setTimeout(() => {
            this.stopSession(sessionId, 'TIMEOUT');
        }, duration);
        
        this.sessionTimeouts.set(sessionId, timeout);
    }

    stopSession(sessionId, reason = 'MANUAL') {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.status = 'stopped';
            session.endTime = new Date();
            session.stopReason = reason;
            
            // Calculate duration
            session.resourceUsage.duration = session.endTime - session.startTime;
            
            // Clear timeout jika ada
            const timeout = this.sessionTimeouts.get(sessionId);
            if (timeout) {
                clearTimeout(timeout);
                this.sessionTimeouts.delete(sessionId);
            }
            
            console.log(`🛑 Session ${sessionId} stopped: ${reason}`);
        }
    }

    pauseSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session && session.status === 'running') {
            session.status = 'paused';
            session.pauseTime = new Date();
            
            // Clear timeout saat pause
            const timeout = this.sessionTimeouts.get(sessionId);
            if (timeout) {
                clearTimeout(timeout);
                this.sessionTimeouts.delete(sessionId);
            }
        }
    }

    resumeSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session && session.status === 'paused') {
            session.status = 'running';
            session.resumeTime = new Date();
            
            // Adjust start time untuk duration calculation
            const pauseDuration = session.resumeTime - session.pauseTime;
            session.startTime = new Date(session.startTime.getTime() + pauseDuration);
            
            // Setup timeout kembali jika ada maxDuration
            if (session.config.maxDuration) {
                const remainingTime = session.config.maxDuration - (session.resumeTime - session.startTime);
                if (remainingTime > 0) {
                    this.setupSessionTimeout(sessionId, remainingTime);
                }
            }
        }
    }

    updateSessionProgress(sessionId, step, progress) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.currentStep = step;
            session.progress = progress;
            
            // Update resource usage jika monitor tersedia
            if (this.resourceMonitor) {
                const usage = this.resourceMonitor.getCurrentUsage();
                session.resourceUsage = {
                    ...session.resourceUsage,
                    ...usage
                };
            }
        }
    }

    addSessionLog(sessionId, logEntry) {
        const session = this.sessions.get(sessionId);
        if (session) {
            const enhancedLog = {
                ...logEntry,
                timestamp: new Date(),
                sessionId: sessionId
            };
            
            session.logs.push(enhancedLog);
            
            // Keep logs manageable (prevent memory leaks)
            if (session.logs.length > 1000) {
                session.logs = session.logs.slice(-500); // Keep last 500 entries
            }
            
            return enhancedLog;
        }
        return null;
    }

    updateSessionStats(sessionId, statsUpdate) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.stats = {
                ...session.stats,
                ...statsUpdate
            };
        }
    }

    updateBrowserInfo(sessionId, browserInfo) {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.browserInfo = {
                ...session.browserInfo,
                ...browserInfo
            };
        }
    }

    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }

    getAllSessions() {
        return Array.from(this.sessions.values());
    }

    getActiveSessions() {
        return this.getAllSessions().filter(s => s.status === 'running');
    }

    getStoppedSessions() {
        return this.getAllSessions().filter(s => s.status === 'stopped');
    }

    getPausedSessions() {
        return this.getAllSessions().filter(s => s.status === 'paused');
    }

    getSessionCounts() {
        const allSessions = this.getAllSessions();
        return {
            total: allSessions.length,
            running: allSessions.filter(s => s.status === 'running').length,
            stopped: allSessions.filter(s => s.status === 'stopped').length,
            paused: allSessions.filter(s => s.status === 'paused').length
        };
    }

    getSessionLogs(sessionId, limit = 100) {
        const session = this.sessions.get(sessionId);
        if (session) {
            return session.logs.slice(-limit);
        }
        return [];
    }

    clearCompletedSessions() {
        let clearedCount = 0;
        
        for (const [sessionId, session] of this.sessions) {
            if (session.status === 'stopped') {
                // Clear timeout jika ada
                const timeout = this.sessionTimeouts.get(sessionId);
                if (timeout) {
                    clearTimeout(timeout);
                    this.sessionTimeouts.delete(sessionId);
                }
                
                this.sessions.delete(sessionId);
                clearedCount++;
            }
        }
        
        console.log(`🧹 Cleared ${clearedCount} completed sessions`);
        return clearedCount;
    }

    clearAllSessions() {
        // Clear all timeouts
        for (const timeout of this.sessionTimeouts.values()) {
            clearTimeout(timeout);
        }
        this.sessionTimeouts.clear();
        
        const sessionCount = this.sessions.size;
        this.sessions.clear();
        this.sessionQueue = [];
        
        console.log(`🗑️ Cleared all ${sessionCount} sessions`);
        return sessionCount;
    }

    // Queue management untuk concurrent session control
    queueSession(config) {
        const queueEntry = {
            id: this.generateSessionId(),
            config: config,
            queuedAt: new Date(),
            status: 'queued'
        };
        
        this.sessionQueue.push(queueEntry);
        return queueEntry;
    }

    getNextQueuedSession() {
        return this.sessionQueue.length > 0 ? this.sessionQueue[0] : null;
    }

    dequeueSession() {
        return this.sessionQueue.shift();
    }

    getQueueLength() {
        return this.sessionQueue.length;
    }

    getQueuePosition(sessionId) {
        return this.sessionQueue.findIndex(entry => entry.id === sessionId);
    }

    // Session analytics and reporting
    getSessionAnalytics() {
        const sessions = this.getAllSessions();
        
        const analytics = {
            totalSessions: sessions.length,
            totalDuration: 0,
            totalPages: 0,
            totalClicks: 0,
            totalErrors: 0,
            averageDuration: 0,
            successRate: 0,
            sessionsByStatus: this.getSessionCounts(),
            recentSessions: sessions
                .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
                .slice(0, 10)
        };
        
        // Calculate aggregates
        const completedSessions = sessions.filter(s => s.status === 'stopped');
        if (completedSessions.length > 0) {
            analytics.totalDuration = completedSessions.reduce((sum, s) => sum + (s.resourceUsage.duration || 0), 0);
            analytics.totalPages = completedSessions.reduce((sum, s) => sum + (s.stats.pagesVisited || 0), 0);
            analytics.totalClicks = completedSessions.reduce((sum, s) => sum + (s.stats.clicks || 0), 0);
            analytics.totalErrors = completedSessions.reduce((sum, s) => sum + (s.stats.errors || 0), 0);
            analytics.averageDuration = analytics.totalDuration / completedSessions.length;
            analytics.successRate = ((completedSessions.length - analytics.totalErrors) / completedSessions.length) * 100;
        }
        
        return analytics;
    }

    // Cleanup expired sessions (older than 24 hours)
    cleanupExpiredSessions() {
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        
        let expiredCount = 0;
        
        for (const [sessionId, session] of this.sessions) {
            if (session.endTime && new Date(session.endTime) < twentyFourHoursAgo) {
                // Clear timeout jika ada
                const timeout = this.sessionTimeouts.get(sessionId);
                if (timeout) {
                    clearTimeout(timeout);
                    this.sessionTimeouts.delete(sessionId);
                }
                
                this.sessions.delete(sessionId);
                expiredCount++;
            }
        }
        
        console.log(`🧹 Cleaned up ${expiredCount} expired sessions`);
        return expiredCount;
    }

    // Auto-cleanup every hour
    startAutoCleanup() {
        setInterval(() => {
            this.cleanupExpiredSessions();
        }, 60 * 60 * 1000); // Every hour
    }
}

module.exports = EnhancedSessionManager;