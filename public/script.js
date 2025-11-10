// public/script.js - Frontend Logic Lengkap dengan Auto-loop
document.addEventListener('DOMContentLoaded', function() {
    loadSystemStatus();
    
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
                `<div style="color: #27ae60;">
                    ✅ ${result.message}<br>
                    ⏰ Interval: ${config.interval/60000} menit<br>
                    📊 Max Sessions: ${config.maxSessions}
                </div>`;
        } else {
            alert('❌ ' + result.error);
        }
    } catch (error) {
        alert('❌ Network error: ' + error.message);
    }
}

async function stopAutoLoop() {
    try {
        const response = await fetch('/api/auto-loop/stop', {
            method: 'POST'
        });

        const result = await response.json();
        
        if (result.success) {
            document.getElementById('autoLoopStatus').innerHTML = 
                `<div style="color: #e74c3c;">⏹️ ${result.message}</div>`;
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
            statusDiv.innerHTML = `
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                    <strong>Auto-Loop Status:</strong><br>
                    🔄 Status: ${result.config.enabled ? '🟢 RUNNING' : '🔴 STOPPED'}<br>
                    ⏰ Interval: ${result.config.interval/60000} menit<br>
                    📊 Max Sessions: ${result.config.maxSessions}<br>
                    🎯 Active Sessions: ${result.activeSessions}/${result.config.maxSessions}<br>
                    🌐 Target: ${result.config.targetUrl}
                </div>
            `;
        }
    } catch (error) {
        alert('❌ Network error: ' + error.message);
    }
}

async function testPuppeteer() {
    try {
        const response = await fetch('/api/test-puppeteer');
        const result = await response.json();
        
        if (result.success) {
            alert('✅ Puppeteer test passed! System ready to use.');
        } else {
            alert('❌ Puppeteer test failed: ' + result.error);
        }
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
                <div style="color: #27ae60;">
                    ✅ <strong>System Ready</strong><br>
                    📍 Chrome Path: ${result.chromePath || 'Default'}<br>
                    💡 Message: ${result.message}
                </div>
            `;
        } else {
            statusDiv.innerHTML = `
                <div style="color: #e74c3c;">
                    ❌ <strong>System Error</strong><br>
                    📍 Error: ${result.error}
                </div>
            `;
        }
    } catch (error) {
        document.getElementById('systemStatus').innerHTML = `
            <div style="color: #e74c3c;">
                ❌ <strong>Connection Error</strong><br>
                📍 Cannot connect to server
            </div>
        `;
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
                alert('All sessions cleared!');
                loadSystemStatus();
            } else {
                alert('Error: ' + result.error);
            }
        })
        .catch(error => {
            alert('Network error: ' + error.message);
        });
    }
                        }
