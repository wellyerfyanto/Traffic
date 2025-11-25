// public/enhancedScript.js - Enhanced Frontend dengan Multiple Sessions
document.addEventListener('DOMContentLoaded', function() {
    loadSystemStatus();
    checkAutoLoopStatus();
    loadProxyInfo();
    loadSystemResources();
    
    document.getElementById('botConfig').addEventListener('submit', async function(e) {
        e.preventDefault();
        await startSessions();
    });

    // Auto-test connection ketika URL berubah
    let connectionTestTimeout;
    document.getElementById('targetUrl').addEventListener('input', function() {
        clearTimeout(connectionTestTimeout);
        const url = this.value;
        
        if (url && url.includes('http')) {
            connectionTestTimeout = setTimeout(() => {
                testConnectionSpeed();
            }, 2000);
        }
    });
});

async function startSessions() {
    const startBtn = document.getElementById('startBtn');
    const originalText = startBtn.textContent;
    
    try {
        startBtn.disabled = true;
        startBtn.textContent = 'Starting Multiple Sessions...';
        
        const formData = {
            targetUrl: document.getElementById('targetUrl').value,
            profiles: document.getElementById('profiles').value,
            deviceType: document.getElementById('deviceType').value,
            proxies: document.getElementById('proxies').value,
            autoLoop: document.getElementById('autoLoop').checked,
            useFreeProxy: document.getElementById('useFreeProxy').checked
        };

        const response = await fetch('/api/start-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();
        
        if (result.success) {
            if (result.queued) {
                alert(`✅ Session queued! Position: ${result.position}\nReason: ${result.resourceCheck.reason}`);
            } else {
                alert('✅ Sessions started successfully! Multiple sessions running concurrently.');
            }
            
            // Refresh monitoring data
            loadSystemResources();
            checkAutoLoopStatus();
            
            // Optional: Auto-redirect to monitoring after 3 seconds
            setTimeout(() => {
                if (!result.queued) {
                    window.location.href = '/monitoring';
                }
            }, 3000);
        } else {
            alert('❌ Error: ' + result.error);
        }
    } catch (error) {
        alert('❌ Network error: ' + error.message);
    } finally {
        startBtn.disabled = false;
        startBtn.textContent = originalText;
    }
}

// Enhanced Auto-loop functions
async function startAutoLoop() {
    try {
        const config = {
            interval: parseInt(document.getElementById('loopInterval').value) * 60 * 1000,
            maxSessions: parseInt(document.getElementById('maxSessions').value),
            targetUrl: document.getElementById('targetUrl').value || 'https://github.com'
        };

        if (!config.targetUrl) {
            alert('❌ Please enter target URL');
            return;
        }

        if (config.interval < 300000) {
            alert('❌ Interval minimum 5 menit');
            return;
        }

        const response = await fetch('/api/auto-loop/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        const result = await response.json();
        
        if (result.success) {
            document.getElementById('autoLoopStatus').innerHTML = 
                `<div style="color: #27ae60; background: #d5f4e6; padding: 15px; border-radius: 8px; border-left: 4px solid #27ae60;">
                    <strong>✅ ${result.message}</strong><br>
                    ⏰ Interval: ${config.interval/60000} menit<br>
                    📊 Max Sessions: ${config.maxSessions}<br>
                    🌐 Target: ${config.targetUrl}<br>
                    <small>Multiple sessions will run concurrently with optimized resources</small>
                </div>`;
                
            setTimeout(checkAutoLoopStatus, 5000);
        } else {
            alert('❌ ' + result.error);
        }
    } catch (error) {
        alert('❌ Network error: ' + error.message);
    }
}

async function stopAutoLoop() {
    if (!confirm('Are you sure you want to stop AUTO-LOOP? Semua session akan berhenti.')) {
        return;
    }
    
    try {
        const response = await fetch('/api/auto-loop/stop', {
            method: 'POST'
        });

        const result = await response.json();
        
        if (result.success) {
            document.getElementById('autoLoopStatus').innerHTML = 
                `<div style="color: #e74c3c; background: #fadbd8; padding: 15px; border-radius: 8px; border-left: 4px solid #e74c3c;">
                    ⏹️ <strong>${result.message}</strong><br>
                    <small>Auto-loop telah dihentikan. Session manual masih bisa dijalankan.</small>
                </div>`;
        } else {
            alert('❌ ' + result.error);
        }
    } catch (error) {
        alert('❌ Network error: ' + error.message);
    }
}

async function checkAutoLoopStatus() {
    try {
        const response = await fetch('/api/auto-loop/status');
        const result = await response.json();

        const statusDiv = document.getElementById('autoLoopStatus');
        if (result.success) {
            const statusColor = result.config.enabled ? '#27ae60' : '#e74c3c';
            const statusText = result.config.enabled ? '🟢 RUNNING' : '🔴 STOPPED';
            const statusBg = result.config.enabled ? '#d5f4e6' : '#fadbd8';
            
            statusDiv.innerHTML = `
                <div style="background: ${statusBg}; padding: 15px; border-radius: 8px; border-left: 4px solid ${statusColor};">
                    <strong>Auto-Loop Status: ${statusText}</strong><br>
                    ⏰ Interval: ${result.config.interval/60000} menit<br>
                    📊 Max Sessions: ${result.config.maxSessions}<br>
                    🎯 Active Sessions: <strong>${result.activeSessions}/${result.config.maxSessions}</strong><br>
                    📋 Queued Sessions: ${result.queueLength}<br>
                    🌐 Target: ${result.config.targetUrl}<br>
                    <small>Last checked: ${new Date().toLocaleTimeString()}</small>
                </div>
            `;
            
            if (result.config.enabled) {
                setTimeout(checkAutoLoopStatus, 10000);
            }
        }
    } catch (error) {
        document.getElementById('autoLoopStatus').innerHTML = 
            `<div style="color: #e74c3c;">
                ❌ Cannot connect to server
            </div>`;
    }
}

// Connection Testing Function
async function testConnectionSpeed() {
    const targetUrl = document.getElementById('targetUrl').value;
    
    if (!targetUrl) {
        return;
    }

    try {
        const response = await fetch('/api/test-connection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: targetUrl })
        });

        const result = await response.json();
        
        if (result.success) {
            const qualityColors = {
                'Excellent': '#27ae60',
                'Good': '#2ecc71', 
                'Fair': '#f39c12',
                'Poor': '#e74c3c',
                'Failed': '#c0392b'
            };
            
            const color = qualityColors[result.recommendations.connectionQuality] || '#95a5a6';
            
            const resultHTML = `
                <div style="background: ${color}20; padding: 15px; border-radius: 8px; border-left: 4px solid ${color}; margin-top: 10px;">
                    <strong>🌐 Connection Test Results:</strong><br>
                    ✅ Status: ${result.pingResult.success ? 'SUCCESS' : 'FAILED'}<br>
                    ⏱️ Response Time: ${result.pingResult.responseTime}ms<br>
                    📊 Quality: <span style="color: ${color}; font-weight: bold;">${result.recommendations.connectionQuality}</span><br>
                    ⚡ Suggested Timeout: ${result.recommendations.suggestedTimeout/1000} seconds<br>
                    ${result.pingResult.success ? 
                        '💡 System will automatically adjust timeout based on connection speed' :
                        '⚠️ Connection failed, using maximum timeout (120s)'
                    }
                </div>
            `;
            
            const statusDiv = document.getElementById('systemStatus');
            if (statusDiv) {
                // Remove existing connection test results
                const existingTest = statusDiv.querySelector('.connection-test-result');
                if (existingTest) {
                    existingTest.remove();
                }
                
                const testDiv = document.createElement('div');
                testDiv.className = 'connection-test-result';
                testDiv.innerHTML = resultHTML;
                statusDiv.appendChild(testDiv);
            }
            
        }
    } catch (error) {
        console.error('Connection test error:', error);
    }
}

async function loadSystemStatus() {
    try {
        const response = await fetch('/api/test-puppeteer');
        const result = await response.json();
        
        const statusDiv = document.getElementById('systemStatus');
        
        if (result.success) {
            statusDiv.innerHTML = `
                <div style="color: #27ae60; background: #d5f4e6; padding: 15px; border-radius: 8px; border-left: 4px solid #27ae60;">
                    ✅ <strong>System Ready</strong><br>
                    📍 Chrome Path: ${result.chromePath || 'Default'}<br>
                    💡 Message: ${result.message}<br>
                    <small>Multiple sessions system activated and ready</small>
                </div>
            `;
        } else {
            statusDiv.innerHTML = `
                <div style="color: #e74c3c; background: #fadbd8; padding: 15px; border-radius: 8px; border-left: 4px solid #e74c3c;">
                    ❌ <strong>System Error</strong><br>
                    📍 Error: ${result.error}<br>
                    <small>Periksa konfigurasi Puppeteer</small>
                </div>
            `;
        }
    } catch (error) {
        document.getElementById('systemStatus').innerHTML = `
            <div style="color: #e74c3c; background: #fadbd8; padding: 15px; border-radius: 8px; border-left: 4px solid #e74c3c;">
                ❌ <strong>Connection Error</strong><br>
                📍 Cannot connect to server<br>
                <small>Pastikan server sedang berjalan</small>
            </div>
        `;
    }
}

// Enhanced System Resources Monitoring
async function loadSystemResources() {
    try {
        const response = await fetch('/api/system-resources');
        const result = await response.json();
        
        if (result.success) {
            const resources = result.resources;
            const resourceCheck = result.resourceCheck;
            
            // Update resources display jika ada
            const resourcesDiv = document.getElementById('systemResources') || document.getElementById('systemStatus');
            if (resourcesDiv) {
                const resourcesHTML = `
                    <div style="background: #e8f4fd; padding: 15px; border-radius: 8px; border-left: 4px solid #3498db; margin-top: 10px;">
                        <strong>📊 System Resources:</strong><br>
                        💽 Memory: ${resources.memory.rss}MB / ${resources.memoryLimit}MB<br>
                        🎪 Sessions: ${resources.activeSessions} / ${resources.maxConcurrentSessions} active<br>
                        📋 Queue: ${resources.queueLength} waiting<br>
                        ✅ Status: <span style="color: ${resourceCheck.canStart ? '#27ae60' : '#e74c3c'};">
                            ${resourceCheck.canStart ? 'READY for new sessions' : resourceCheck.reason}
                        </span>
                    </div>
                `;
                
                // Remove existing resources display
                const existingResources = resourcesDiv.querySelector('.system-resources');
                if (existingResources) {
                    existingResources.remove();
                }
                
                const resourcesElement = document.createElement('div');
                resourcesElement.className = 'system-resources';
                resourcesElement.innerHTML = resourcesHTML;
                resourcesDiv.appendChild(resourcesElement);
            }
        }
    } catch (error) {
        console.error('Error loading system resources:', error);
    }
}

// Proxy info functions
async function loadProxyInfo() {
    try {
        const response = await fetch('/api/proxy-info');
        const result = await response.json();
        
        if (result.success) {
            const proxyStatus = document.getElementById('proxyStatus');
            if (proxyStatus) {
                proxyStatus.innerHTML = `
                    <div style="color: #2980b9; background: #d6eaf8; padding: 10px; border-radius: 5px; margin-top: 10px;">
                        <strong>🔌 Proxy Status:</strong><br>
                        Total: ${result.proxyInfo.total} | 
                        Active: <span style="color: #27ae60;">${result.proxyInfo.active}</span> | 
                        Failed: <span style="color: #e74c3c;">${result.proxyInfo.failed}</span>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Error loading proxy info:', error);
    }
}

async function clearProxies() {
    if (!confirm('Are you sure you want to clear ALL proxies?')) return;
    
    try {
        const response = await fetch('/api/clear-proxies', {
            method: 'POST'
        });
        
        const result = await response.json();
        if (result.success) {
            alert('All proxies cleared');
            loadProxyInfo();
        }
    } catch (error) {
        alert('Error clearing proxies: ' + error.message);
    }
}

function goToMonitoring() {
    window.location.href = '/monitoring';
}

function testPuppeteer() {
    // Existing testPuppeteer function
    alert('Fitur test Puppeteer akan diimplementasikan di sini');
}

// Auto-refresh resources setiap 30 detik
setInterval(() => {
    checkAutoLoopStatus();
    loadProxyInfo();
    loadSystemResources();
}, 30000);
