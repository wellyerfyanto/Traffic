class ProxyHandler {
    constructor() {
        this.proxyList = [];
        this.activeProxies = [];
        this.failedProxies = new Set();
    }

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

    addMultipleProxies(proxyArray) {
        if (Array.isArray(proxyArray)) {
            const validProxies = proxyArray.filter(proxy => 
                proxy && proxy.includes(':') && !this.failedProxies.has(proxy) && !this.proxyList.includes(proxy)
            );
            this.proxyList.push(...validProxies);
            console.log(`✅ ${validProxies.length} proxy ditambahkan`);
        }
    }

    getRandomActiveProxy() {
        if (this.activeProxies.length === 0) {
            return null;
        }
        const randomProxy = this.activeProxies[Math.floor(Math.random() * this.activeProxies.length)];
        return this.formatProxyObject(randomProxy);
    }

    getNextProxy() {
        if (this.proxyList.length === 0) {
            return null;
        }
        
        for (const proxy of this.proxyList) {
            if (!this.activeProxies.includes(proxy) && !this.failedProxies.has(proxy)) {
                return this.formatProxyObject(proxy);
            }
        }
        
        return null;
    }

    formatProxyObject(proxyString) {
        if (proxyString.includes('://')) {
            return {
                url: proxyString,
                original: proxyString
            };
        } else {
            const parts = proxyString.split(':');
            if (parts.length === 2) {
                return {
                    ip: parts[0],
                    port: parts[1],
                    url: `http://${proxyString}`,
                    original: proxyString
                };
            } else if (parts.length === 4) {
                return {
                    ip: parts[0],
                    port: parts[1],
                    username: parts[2],
                    password: parts[3],
                    url: `http://${parts[2]}:${parts[3]}@${parts[0]}:${parts[1]}`,
                    original: proxyString
                };
            }
        }
        return null;
    }

    markProxyAsActive(proxyString) {
        if (!this.activeProxies.includes(proxyString)) {
            this.activeProxies.push(proxyString);
            console.log(`✅ Proxy aktif: ${proxyString}`);
        }
    }

    markProxyAsFailed(proxyString) {
        this.failedProxies.add(proxyString);
        
        const activeIndex = this.activeProxies.indexOf(proxyString);
        if (activeIndex !== -1) {
            this.activeProxies.splice(activeIndex, 1);
        }
        
        const listIndex = this.proxyList.indexOf(proxyString);
        if (listIndex !== -1) {
            this.proxyList.splice(listIndex, 1);
        }
        
        console.log(`❌ Proxy gagal: ${proxyString}`);
    }

    clearProxies() {
        this.proxyList = [];
        this.activeProxies = [];
        this.failedProxies.clear();
        console.log('🧹 Semua proxy telah dihapus');
    }

    validateProxyFormat(proxyString) {
        if (!proxyString || !proxyString.includes(':')) {
            return false;
        }
        
        const proxyRegex = /^(?:https?|socks[45]):\/\/(?:(.+):(.+)@)?([^:]+)(?::(\d+))?$/;
        if (proxyRegex.test(proxyString)) {
            return true;
        }
        
        const simpleRegex = /^(\d{1,3}\.){3}\d{1,3}:\d+$/;
        if (simpleRegex.test(proxyString)) {
            return true;
        }
        
        const authRegex = /^(\d{1,3}\.){3}\d{1,3}:\d+:\S+:\S+$/;
        return authRegex.test(proxyString);
    }

    getAllProxies() {
        return this.proxyList;
    }

    getActiveProxies() {
        return this.activeProxies;
    }

    getFailedProxies() {
        return Array.from(this.failedProxies);
    }
}

module.exports = ProxyHandler;