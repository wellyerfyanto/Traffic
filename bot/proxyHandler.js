class ProxyHandler {
    constructor() {
        this.proxyList = [];
        this.activeProxies = []; // Proxy yang terbukti aktif
        this.failedProxies = new Set(); // Proxy yang gagal
    }

    // Method untuk proxy manual
    addManualProxy(proxyString) {
        if (proxyString && proxyString.includes(':')) {
            const trimmedProxy = proxyString.trim();
            if (!this.proxyList.includes(trimmedProxy) && !this.failedProxies.has(trimmedProxy)) {
                this.proxyList.push(trimmedProxy);
                console.log(`✅ Proxy manual ditambahkan: ${trimmedProxy}`);
                return true;
            }
        }
        console.error('❌ Format proxy salah. Gunakan format: ip:port atau protocol://user:pass@host:port');
        return false;
    }

    // Method untuk menambah multiple proxies
    addMultipleProxies(proxyArray) {
        if (Array.isArray(proxyArray)) {
            const validProxies = proxyArray.filter(proxy => 
                proxy && proxy.includes(':') && !this.failedProxies.has(proxy) && !this.proxyList.includes(proxy)
            );
            this.proxyList.push(...validProxies);
            console.log(`✅ ${validProxies.length} proxy ditambahkan`);
        }
    }

    // Method untuk mendapatkan proxy random yang aktif
    getRandomActiveProxy() {
        if (this.activeProxies.length === 0) {
            return null;
        }
        const randomProxy = this.activeProxies[Math.floor(Math.random() * this.activeProxies.length)];
        return this.formatProxyObject(randomProxy);
    }

    // Method untuk mendapatkan proxy berikutnya dengan rotasi
    getNextProxy() {
        if (this.proxyList.length === 0) {
            return null;
        }
        
        // Cari proxy yang belum dicoba (belum ada di activeProxies dan failedProxies)
        for (const proxy of this.proxyList) {
            if (!this.activeProxies.includes(proxy) && !this.failedProxies.has(proxy)) {
                return this.formatProxyObject(proxy);
            }
        }
        
        return null;
    }

    // Format proxy string menjadi object
    formatProxyObject(proxyString) {
        if (proxyString.includes('://')) {
            return {
                url: proxyString
            };
        } else {
            const parts = proxyString.split(':');
            if (parts.length === 2) {
                return {
                    ip: parts[0],
                    port: parts[1],
                    url: `http://${proxyString}`
                };
            } else if (parts.length === 4) {
                // Format: host:port:username:password
                return {
                    ip: parts[0],
                    port: parts[1],
                    username: parts[2],
                    password: parts[3],
                    url: `http://${parts[2]}:${parts[3]}@${parts[0]}:${parts[1]}`
                };
            }
        }
        return null;
    }

    // Method untuk menandai proxy sebagai aktif
    markProxyAsActive(proxyString) {
        if (!this.activeProxies.includes(proxyString)) {
            this.activeProxies.push(proxyString);
            console.log(`✅ Proxy aktif ditambahkan: ${proxyString}`);
        }
    }

    // Method untuk menandai proxy sebagai gagal
    markProxyAsFailed(proxyString) {
        this.failedProxies.add(proxyString);
        // Hapus dari activeProxies jika ada
        const activeIndex = this.activeProxies.indexOf(proxyString);
        if (activeIndex !== -1) {
            this.activeProxies.splice(activeIndex, 1);
        }
        // Hapus dari proxyList jika ada
        const listIndex = this.proxyList.indexOf(proxyString);
        if (listIndex !== -1) {
            this.proxyList.splice(listIndex, 1);
        }
        console.log(`❌ Proxy gagal dihapus: ${proxyString}`);
    }

    // Method untuk clear semua proxy
    clearProxies() {
        this.proxyList = [];
        this.activeProxies = [];
        this.failedProxies.clear();
        console.log('🧹 Semua proxy telah dihapus');
    }

    // Method untuk test proxy (basic check)
    validateProxyFormat(proxyString) {
        if (!proxyString || !proxyString.includes(':')) {
            return false;
        }
        
        // Support untuk berbagai format proxy
        const proxyRegex = /^(?:https?|socks[45]):\/\/(?:(.+):(.+)@)?([^:]+)(?::(\d+))?$/;
        if (proxyRegex.test(proxyString)) {
            return true;
        }
        
        // Format sederhana ip:port
        const simpleRegex = /^(\d{1,3}\.){3}\d{1,3}:\d+$/;
        if (simpleRegex.test(proxyString)) {
            return true;
        }
        
        // Format dengan autentikasi: host:port:username:password
        const authRegex = /^(\d{1,3}\.){3}\d{1,3}:\d+:\S+:\S+$/;
        return authRegex.test(proxyString);
    }

    // Method untuk mendapatkan semua proxy
    getAllProxies() {
        return this.proxyList;
    }

    // Method untuk mendapatkan proxy aktif
    getActiveProxies() {
        return this.activeProxies;
    }

    // Method untuk mendapatkan proxy yang gagal
    getFailedProxies() {
        return Array.from(this.failedProxies);
    }
}

module.exports = ProxyHandler;