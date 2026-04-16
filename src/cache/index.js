import Redis from 'ioredis';

/**
 * 登录信息缓存模块
 * - 本地开发: Redis
 * - 线上环境: 微信小程序原生登录态（预留接口，线上不依赖 Redis）
 *
 * 通过 RUNTIME_ENV 环境变量区分:
 *   RUNTIME_ENV=cloud  -> 微信云托管（线上无需 Redis，session 由微信管理）
 *   其他 (默认)        -> 本地 Redis
 */

const isCloud = process.env.RUNTIME_ENV === 'cloud';

let redis = null;

/**
 * 获取 Redis 实例（仅本地环境使用）
 */
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
  });

  redis.on('error', (err) => {
    console.error('[Redis] 连接错误:', err.message);
  });

  redis.on('connect', () => {
    console.log('[Redis] 连接成功');
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
   * 初始化缓存连接
   */
  async init() {
    if (isCloud) {
      console.log('[Cache] 云托管模式，跳过 Redis 初始化（登录态由微信管理）');
      return;
    }
    getRedis();
  }

  /**
   * 保存用户登录 session
   * @param {string} openid - 用户 openid
   * @param {Object} sessionData - session 数据 { sessionKey, ... }
   * @param {number} [ttl] - 过期时间(秒)，默认7天
   */
  async setSession(openid, sessionData, ttl = SESSION_TTL) {
    if (isCloud) {
      // 云托管模式: 不需要自行管理 session，微信负责
      return;
    }
    const key = `session:${openid}`;
    await getRedis().set(key, JSON.stringify(sessionData), 'EX', ttl);
  }

  /**
   * 获取用户登录 session
   * @param {string} openid - 用户 openid
   * @returns {Promise<Object|null>} session 数据或 null
   */
  async getSession(openid) {
    if (isCloud) {
      // 云托管模式: 返回 null，由微信管理登录态
      return null;
    }
    const key = `session:${openid}`;
    const data = await getRedis().get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * 删除用户登录 session
   * @param {string} openid - 用户 openid
   */
  async deleteSession(openid) {
    if (isCloud) return;
    const key = `session:${openid}`;
    await getRedis().del(key);
  }

  /**
   * 通用 set 操作
   * @param {string} key
   * @param {*} value
   * @param {number} [ttl] - 过期时间(秒)
   */
  async set(key, value, ttl) {
    if (isCloud) return;
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
    if (isCloud) return null;
    return await getRedis().get(key);
  }

  /**
   * 通用 del 操作
   * @param {string} key
   */
  async del(key) {
    if (isCloud) return;
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
