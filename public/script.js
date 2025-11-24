// public/script.js - Frontend Logic Lengkap dengan Auto-loop dan Proxy Management
document.addEventListener('DOMContentLoaded', function() {
    loadSystemStatus();
    checkAutoLoopStatus(); // Check status saat load
    loadProxyInfo(); // Load proxy info
    
    document.getElementById('botConfig').addEventListener('submit', async function(e) {
        e.preventDefault();
        await startSessions();
    });
});

async function startSessions() {
    const startBtn = document.getElementById('startBtn');
    const originalText = startBtn.textContent;
    
    try {
        startBtn.disabled = true;
        startBtn.textContent = 'Starting...';
        
        const formData = {
            targetUrl: document.getElementById('targetUrl').value,
            profiles: document.getElementById('profiles').value,
            deviceType: document.getElementById('deviceType').value,
            proxies: document.getElementById('proxies').value,
            autoLoop: document.getElementById('autoLoop').checked
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
            alert('✅ Sessions started successfully! Redirecting to monitoring...');
            setTimeout(() => {
                window.location.href = '/monitoring';
            }, 2000);
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

// Auto-loop functions
async function startAutoLoop() {
    try {
        const config = {
            interval: parseInt(document.getElementById('loopInterval').value) * 60 * 1000,
            maxSessions: parseInt(document.getElementById('maxSessions').value),
            targetUrl: document.getElementById('targetUrl').value || 'https://github.com'
        };

        // Validasi input
        if (!config.targetUrl) {
            alert('❌ Please enter target URL');
            return;
        }

        if (config.interval < 300000) { // 5 menit minimum
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
                    <small>Auto-loop akan berjalan terus hingga di-stop manual</small>
                </div>`;
                
            // Update status setiap 10 detik
            setTimeout(checkAutoLoopStatus, 10000);
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
                    🌐 Target: ${result.config.targetUrl}<br>
                    <small>Last checked: ${new Date().toLocaleTimeString()}</small>
                </div>
            `;
            
            // Auto-refresh status jika running
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

async function testPuppeteer() {
    try {
        const testBtn = document.querySelector('button[onclick="testPuppeteer()"]');
        const originalText = testBtn.textContent;
        testBtn.disabled = true;
        testBtn.textContent = 'Testing...';
        
        const response = await fetch('/api/test-puppeteer');
        const result = await response.json();
        
        if (result.success) {
            alert('✅ Puppeteer test passed! System ready to use.\n\nChrome Path: ' + (result.chromePath || 'Default'));
        } else {
            alert('❌ Puppeteer test failed: ' + result.error);
        }
        
        testBtn.disabled = false;
        testBtn.textContent = originalText;
    } catch (error) {
        alert('❌ Test error: ' + error.message);
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
                    <small>Semua sistem berfungsi dengan baik</small>
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

// Proxy info functions
async function loadProxyInfo() {
    try {
        const response = await fetch('/api/proxy-info');
        const result = await response.json();
        
        if (result.success) {
            console.log('Proxy Info:', result.proxyInfo);
            // Update proxy status display
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

function clearSessions() {
    if (confirm('Are you sure you want to stop ALL sessions and clear logs?')) {
        fetch('/api/clear-sessions', {
            method: 'POST'
        })
        .then(response => response.json())
        .then(result => {
            if (result.success) {
                alert('✅ All sessions cleared!');
                loadSystemStatus();
                checkAutoLoopStatus();
            } else {
                alert('❌ Error: ' + result.error);
            }
        })
        .catch(error => {
            alert('❌ Network error: ' + error.message);
        });
    }
}

// Utility function untuk format time
function formatTime(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return minutes + ":" + (seconds < 10 ? '0' : '') + seconds;
}

// Auto-check status setiap 30 detik
setInterval(() => {
    checkAutoLoopStatus();
    loadProxyInfo();
}, 30000);