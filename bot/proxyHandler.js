// bot/proxyHandler.js
const FreeProxy = require('free-proxy');
const { HttpsProxyAgent } = require('https-proxy-agent');

class ProxyHandler {
    constructor() {
        this.proxyList = [];
        this.freeProxy = new FreeProxy();
    }

    // Method untuk mengambil proxy gratis otomatis
    async loadFreeProxies() {
        try {
            console.log('🔄 Mengambil daftar proxy gratis...');
            
            // Ambil beberapa proxy sekaligus
            const proxies = await this.freeProxy.getProxies({
                country: 'US',
                protocol: 'http',
                limit: 10
            });
            
            this.proxyList = proxies.map(proxy => `${proxy.ip}:${proxy.port}`);
            console.log(`✅ Berhasil mengambil ${this.proxyList.length} proxy gratis`);
            
            return this.proxyList;
        } catch (error) {
            console.error('❌ Gagal mengambil proxy gratis:', error.message);
            return [];
        }
    }

    // Method untuk proxy manual (format: ip:port)
    addManualProxy(proxyString) {
        if (proxyString && proxyString.includes(':')) {
            this.proxyList.push(proxyString.trim());
            console.log(`✅ Proxy manual ditambahkan: ${proxyString}`);
            return true;
        }
        console.error('❌ Format proxy salah. Gunakan format: ip:port');
        return false;
    }

    // Method untuk mendapatkan proxy random
    getRandomProxy() {
        if (this.proxyList.length === 0) {
            return null;
        }
        const randomProxy = this.proxyList[Math.floor(Math.random() * this.proxyList.length)];
        return {
            url: `http://${randomProxy}`,
            agent: new HttpsProxyAgent(`http://${randomProxy}`)
        };
    }

    // Method untuk test proxy
    async testProxy(proxyUrl) {
        try {
            const response = await fetch('https://httpbin.org/ip', {
                agent: new HttpsProxyAgent(proxyUrl),
                timeout: 10000
            });
            const data = await response.json();
            console.log(`✅ Proxy berfungsi! IP: ${data.origin}`);
            return true;
        } catch (error) {
            console.error(`❌ Proxy tidak berfungsi: ${error.message}`);
            return false;
        }
    }

    // Method untuk mendapatkan semua proxy
    getAllProxies() {
        return this.proxyList;
    }

    // Method untuk clear semua proxy
    clearProxies() {
        this.proxyList = [];
        console.log('🧹 Semua proxy telah dihapus');
    }
}

module.exports = ProxyHandler;
