// Resource monitoring utility untuk Railway optimization
class ResourceMonitor {
    constructor() {
        this.memoryLimit = 512; // MB - Railway free tier limit
        this.cpuLimit = 1; // vCPU cores
        this.monitoringInterval = null;
        this.history = [];
        this.maxHistorySize = 100;
        this.alerts = [];
    }

    startMonitoring(interval = 30000) {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }

        this.monitoringInterval = setInterval(() => {
            this.recordMetrics();
            this.checkAlerts();
        }, interval);

        console.log(`📊 Resource monitoring started (${interval}ms interval)`);
    }

    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            console.log('📊 Resource monitoring stopped');
        }
    }

    getCurrentUsage() {
        const usage = process.memoryUsage();
        
        return {
            memory: {
                rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100,
                heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100,
                heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100,
                external: Math.round(usage.external / 1024 / 1024 * 100) / 100
            },
            cpu: {
                usage: process.cpuUsage ? process.cpuUsage().user / 1000000 : 0, // Convert to seconds
                uptime: process.uptime()
            },
            timestamp: new Date().toISOString()
        };
    }

    recordMetrics() {
        const metrics = this.getCurrentUsage();
        this.history.push(metrics);

        // Keep history size manageable
        if (this.history.length > this.maxHistorySize) {
            this.history = this.history.slice(-this.maxHistorySize);
        }

        return metrics;
    }

    checkAlerts() {
        const current = this.getCurrentUsage();
        const memoryUsage = current.memory.rss;
        const memoryPercentage = (memoryUsage / this.memoryLimit) * 100;

        // Memory alerts
        if (memoryPercentage > 90) {
            this.triggerAlert('CRITICAL', `Memory usage critical: ${memoryUsage}MB/${this.memoryLimit}MB (${Math.round(memoryPercentage)}%)`);
        } else if (memoryPercentage > 80) {
            this.triggerAlert('WARNING', `Memory usage high: ${memoryUsage}MB/${this.memoryLimit}MB (${Math.round(memoryPercentage)}%)`);
        } else if (memoryPercentage > 70) {
            this.triggerAlert('INFO', `Memory usage elevated: ${memoryUsage}MB/${this.memoryLimit}MB (${Math.round(memoryPercentage)}%)`);
        }
    }

    triggerAlert(level, message) {
        const alert = {
            level,
            message,
            timestamp: new Date().toISOString(),
            metrics: this.getCurrentUsage()
        };

        this.alerts.push(alert);
        
        // Keep last 50 alerts
        if (this.alerts.length > 50) {
            this.alerts = this.alerts.slice(-50);
        }

        // Log based on level
        const logMethod = level === 'CRITICAL' ? console.error : 
                         level === 'WARNING' ? console.warn : console.log;
        
        logMethod(`🚨 ${level}: ${message}`);

        return alert;
    }

    getAlerts(level = null, limit = 10) {
        let filtered = this.alerts;
        
        if (level) {
            filtered = filtered.filter(alert => alert.level === level);
        }
        
        return filtered.slice(-limit).reverse();
    }

    getMetricsHistory(limit = 20) {
        return this.history.slice(-limit);
    }

    getPerformanceSummary() {
        const recentMetrics = this.history.slice(-10);
        
        if (recentMetrics.length === 0) {
            return {
                averageMemory: 0,
                maxMemory: 0,
                stability: 'UNKNOWN'
            };
        }

        const memoryValues = recentMetrics.map(m => m.memory.rss);
        const averageMemory = memoryValues.reduce((a, b) => a + b, 0) / memoryValues.length;
        const maxMemory = Math.max(...memoryValues);
        const memoryStability = (Math.max(...memoryValues) - Math.min(...memoryValues)) < 50 ? 'STABLE' : 'VOLATILE';

        return {
            averageMemory: Math.round(averageMemory * 100) / 100,
            maxMemory: Math.round(maxMemory * 100) / 100,
            memoryLimit: this.memoryLimit,
            memoryUsagePercent: Math.round((averageMemory / this.memoryLimit) * 100),
            stability: memoryStability,
            recommendation: this.getRecommendation(averageMemory)
        };
    }

    getRecommendation(currentMemory) {
        const percentage = (currentMemory / this.memoryLimit) * 100;
        
        if (percentage > 90) {
            return 'CRITICAL: Reduce concurrent sessions immediately';
        } else if (percentage > 80) {
            return 'WARNING: Consider reducing session count or duration';
        } else if (percentage > 70) {
            return 'INFO: System stable but monitor closely';
        } else if (percentage > 50) {
            return 'OK: System has room for more sessions';
        } else {
            return 'EXCELLENT: System can handle more load';
        }
    }

    canStartNewSession(currentSessionCount) {
        const metrics = this.getCurrentUsage();
        const memoryUsage = metrics.memory.rss;
        const memoryPercentage = (memoryUsage / this.memoryLimit) * 100;

        const memoryOk = memoryPercentage < 80; // Leave 20% buffer
        const sessionOk = currentSessionCount < 5; // Max sessions based on testing

        return {
            canStart: memoryOk && sessionOk,
            reason: !memoryOk ? `Memory limit: ${memoryUsage}MB/${this.memoryLimit}MB` :
                     !sessionOk ? `Session limit: ${currentSessionCount}/5` :
                     'OK',
            metrics: metrics
        };
    }

    generateReport() {
        const summary = this.getPerformanceSummary();
        const recentAlerts = this.getAlerts(null, 5);
        const metricsHistory = this.getMetricsHistory(10);

        return {
            timestamp: new Date().toISOString(),
            summary,
            currentMetrics: this.getCurrentUsage(),
            recentAlerts,
            metricsHistory,
            settings: {
                memoryLimit: this.memoryLimit,
                cpuLimit: this.cpuLimit
            }
        };
    }
}

module.exports = ResourceMonitor;