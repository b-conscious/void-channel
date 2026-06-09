/**
 * Cache Layer — L1 (in-memory) + L2 (Upstash Redis)
 *
 * L1: instant Map reads, same as before. Evicts on TTL + background sweep.
 * L2: Upstash Redis via REST API. Survives Render restarts, shared across instances.
 *     Falls back gracefully to L1-only if no Redis credentials.
 *
 * get() is async — checks L1 first, then L2. Populates L1 on L2 hit.
 * set() writes L1 immediately (sync for callers), L2 in background.
 */

const { Redis } = require("@upstash/redis");

class Cache {
  constructor(defaultTTL = 3600) {
    this.mem = new Map();
    this.defaultTTL = defaultTTL; // seconds

    // ── L2: Upstash Redis (if credentials present) ──
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      this.redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      console.log("[cache] Upstash Redis connected — L1 (memory) + L2 (Redis)");
    } else {
      this.redis = null;
      console.log("[cache] No Redis credentials — L1 in-memory only");
    }

    // Background sweep stale L1 entries every 5 min
    this.sweepInterval = setInterval(() => this.sweep(), 5 * 60 * 1000);
  }

  /**
   * Get — async. Checks L1 (instant) then L2 (Redis). Warms L1 on L2 hit.
   */
  async get(key) {
    // L1 — instant, no network
    const l1 = this.mem.get(key);
    if (l1) {
      if (Date.now() <= l1.expiresAt) return l1.data;
      this.mem.delete(key); // expired
    }

    // L2 — Redis fallback (survives restarts)
    if (this.redis) {
      try {
        const data = await this.redis.get(key);
        if (data !== null && data !== undefined) {
          // Warm L1 from Redis hit so next read is instant
          this.mem.set(key, {
            data,
            expiresAt: Date.now() + this.defaultTTL * 1000,
          });
          return data;
        }
      } catch (err) {
        console.warn("[cache] Redis GET error:", err.message);
      }
    }

    return null;
  }

  /**
   * Set — writes L1 immediately, L2 in background (fire-and-forget).
   */
  set(key, data, ttl) {
    const seconds = ttl || this.defaultTTL;
    // L1 — instant
    this.mem.set(key, {
      data,
      expiresAt: Date.now() + seconds * 1000,
    });

    // L2 — background write (non-blocking)
    if (this.redis) {
      this.redis.set(key, data, { ex: seconds }).catch((err) => {
        console.warn("[cache] Redis SET error:", err.message);
      });
    }
  }

  /**
   * Delete — removes from both layers.
   */
  delete(key) {
    this.mem.delete(key);
    if (this.redis) {
      this.redis.del(key).catch(() => {});
    }
  }

  /**
   * Flush — clear all entries from L1 and L2.
   */
  async flush() {
    this.mem.clear();
    if (this.redis) {
      try {
        await this.redis.flushdb();
        console.log("[cache] Redis flushed");
      } catch (err) {
        console.warn("[cache] Redis FLUSH error:", err.message);
      }
    }
  }

  sweep() {
    const now = Date.now();
    let swept = 0;
    for (const [key, entry] of this.mem) {
      if (now > entry.expiresAt) {
        this.mem.delete(key);
        swept++;
      }
    }
    if (swept > 0) {
      console.log(`[cache] swept ${swept} stale L1 entries, ${this.mem.size} remaining`);
    }
  }

  stats() {
    return {
      entries: this.mem.size,
      keys: [...this.mem.keys()],
      redis: this.redis ? "connected" : "disabled",
    };
  }

  destroy() {
    clearInterval(this.sweepInterval);
    this.mem.clear();
  }
}

module.exports = Cache;
