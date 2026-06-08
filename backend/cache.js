/**
 * Cache Layer — in-memory with TTL
 * 
 * Drop-in replaceable with Redis when you scale.
 * Every entry stores { data, expiresAt }.
 * Stale entries are lazily purged on read + swept every 5 min.
 */

class Cache {
  constructor(defaultTTL = 3600) {
    this.store = new Map();
    this.defaultTTL = defaultTTL; // seconds

    // Background sweep every 5 min
    this.sweepInterval = setInterval(() => this.sweep(), 5 * 60 * 1000);
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key, data, ttl) {
    const seconds = ttl || this.defaultTTL;
    this.store.set(key, {
      data,
      expiresAt: Date.now() + seconds * 1000,
    });
  }

  delete(key) {
    this.store.delete(key);
  }

  sweep() {
    const now = Date.now();
    let swept = 0;
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        swept++;
      }
    }
    if (swept > 0) {
      console.log(`[cache] swept ${swept} stale entries, ${this.store.size} remaining`);
    }
  }

  stats() {
    return {
      entries: this.store.size,
      keys: [...this.store.keys()],
    };
  }

  destroy() {
    clearInterval(this.sweepInterval);
    this.store.clear();
  }
}

module.exports = Cache;
