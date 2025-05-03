const NodeCache = require('node-cache');

// Create multi-tiered cache with different TTLs
const caches = {
  // Short-lived cache (1 hour default)
  short: new NodeCache({ 
    stdTTL: 3600,   // 1 hour in seconds
    checkperiod: 600 // Check for expired keys every 10 minutes
  }),
  
  // Medium-lived cache (6 hours default)
  medium: new NodeCache({
    stdTTL: 21600,   // 6 hours in seconds
    checkperiod: 1800 // Check for expired keys every 30 minutes
  }),
  
  // Long-lived cache (24 hours default)
  long: new NodeCache({
    stdTTL: 86400,   // 24 hours in seconds
    checkperiod: 3600 // Check for expired keys every hour
  })
};

// Cache expiration times from environment variables (or defaults)
const TTL = {
  brands: parseInt(process.env.BRANDS_CACHE_TTL) || 86400,    // 24 hours
  phones: parseInt(process.env.PHONES_CACHE_TTL) || 43200,    // 12 hours
  specs: parseInt(process.env.SPECS_CACHE_TTL) || 21600       // 6 hours
};

/**
 * Determines which cache to use based on the key prefix
 */
function getCacheForKey(key) {
  if (key.startsWith('brands') || key === 'brands') {
    return { cache: caches.long, ttl: TTL.brands };
  } else if (key.startsWith('brand_all_') || key.startsWith('phones_')) {
    return { cache: caches.medium, ttl: TTL.phones };
  } else if (key.startsWith('phone_')) {
    return { cache: caches.medium, ttl: TTL.specs };
  }
  // Default to short-lived cache
  return { cache: caches.short, ttl: 3600 };
}

/**
 * Get cached data by key
 */
function get(key) {
  const { cache } = getCacheForKey(key);
  return cache.get(key);
}

/**
 * Store data in cache
 */
function set(key, value, customTtl = null) {
  const { cache, ttl } = getCacheForKey(key);
  return cache.set(key, value, customTtl || ttl);
}

/**
 * Remove item(s) from all caches
 */
function deleteCa(key) {
  let deleted = 0;
  Object.values(caches).forEach(cache => {
    deleted += cache.del(key);
  });
  return deleted > 0;
}

/**
 * Get or set cache value with a factory function
 */
async function getOrSet(key, factory, customTtl = null) {
  const cachedData = get(key);
  if (cachedData !== undefined) {
    return cachedData; 
  }
  
  const data = await factory();
  set(key, data, customTtl);
  return data;
}

/**
 * Flush all caches
 */
function flush() {
  Object.values(caches).forEach(cache => cache.flushAll());
}

/**
 * Get all cache keys
 */
function keys() {
  const allKeys = [];
  Object.values(caches).forEach(cache => {
    allKeys.push(...cache.keys());
  });
  return [...new Set(allKeys)]; // Remove duplicates
}

/**
 * Get cache stats
 */
function stats() {
  const stats = {};
  Object.entries(caches).forEach(([name, cache]) => {
    stats[name] = cache.getStats();
  });
  return stats;
}

module.exports = {
  get,
  set,
  deleteCa,
  getOrSet,
  flush,
  keys,
  stats
};