// Configuration page JavaScript
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
            proxies: document.getElementById('proxies').value
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
