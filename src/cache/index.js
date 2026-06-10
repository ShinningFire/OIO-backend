import Redis from 'ioredis';

/**
 * 登录信息缓存模块
 * 统一使用 REDIS_HOST / REDIS_PORT / REDIS_PASSWORD 环境变量连接 Redis
 */

let redis = null;

function getRedis() {
  if (redis) return redis;

  redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB) || 0,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 3000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    connectTimeout: 10000,
    enableReadyCheck: false,
  });

  redis.on('error', (err) => {
    console.error('[Redis] 连接错误:', err.message);
  });

  redis.on('connect', () => {
    console.log(`[Redis] TCP连接成功 -> ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
  });

  redis.on('ready', () => {
    console.log('[Redis] 已就绪，可接受命令 ✅');
  });

  return redis;
}

// session 默认过期时间: 7天
const SESSION_TTL = 7 * 24 * 60 * 60;

/**
 * 缓存操作类
 */
class CacheManager {
  /**
   * 初始化缓存连接，等待 Redis 真正就绪后才 resolve
   * 避免服务器启动后立即收到请求时 Redis 尚未连接导致超时
   */
  async init() {
    console.log(`[Cache] Redis 初始化 -> ${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`);
    const client = getRedis();

    // 如果已经就绪则直接返回
    if (client.status === 'ready') return;

    await new Promise((resolve, reject) => {
      const onReady = () => { cleanup(); resolve(); };
      const onError = (err) => { cleanup(); reject(err); };
      const cleanup = () => {
        client.removeListener('ready', onReady);
        client.removeListener('error', onError);
      };
      client.once('ready', onReady);
      client.once('error', onError);
    });
  }

  /**
   * 保存用户登录 session
   * @param {string} sessionId - 会话标识（可使用 token）
   * @param {Object} sessionData - session 数据 { sessionKey, ... }
   * @param {number} [ttl] - 过期时间(秒)，默认7天
   */
  async setSession(sessionId, sessionData, ttl = SESSION_TTL) {
    const key = `session:${sessionId}`;
    await getRedis().set(key, JSON.stringify(sessionData), 'EX', ttl);
  }

  /**
   * 获取用户登录 session
   * @param {string} sessionId - 会话标识（可使用 token）
   * @returns {Promise<Object|null>} session 数据或 null
   */
  async getSession(sessionId) {
    const key = `session:${sessionId}`;
    const data = await getRedis().get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * 删除用户登录 session
   * @param {string} sessionId - 会话标识（可使用 token）
   */
  async deleteSession(sessionId) {
    const key = `session:${sessionId}`;
    await getRedis().del(key);
  }

  /**
   * 通用 set 操作
   * @param {string} key
   * @param {*} value
   * @param {number} [ttl] - 过期时间(秒)
   */
  async set(key, value, ttl) {
    const strValue = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttl) {
      await getRedis().set(key, strValue, 'EX', ttl);
    } else {
      await getRedis().set(key, strValue);
    }
  }

  /**
   * 通用 get 操作
   * @param {string} key
   * @returns {Promise<string|null>}
   */
  async get(key) {
    return await getRedis().get(key);
  }

  /**
   * 通用 del 操作
   * @param {string} key
   */
  async del(key) {
    await getRedis().del(key);
  }

  /**
   * 关闭连接
   */
  async close() {
    if (redis) {
      await redis.quit();
      redis = null;
    }
  }
}

const cache = new CacheManager();
export default cache;
