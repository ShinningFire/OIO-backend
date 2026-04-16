import mysql from 'mysql2/promise';

/**
 * 数据库模块
 * - 本地开发: MySQL
 * - 线上环境: 微信云托管 MySQL (通过环境变量切换)
 *
 * 通过 RUNTIME_ENV 环境变量区分:
 *   RUNTIME_ENV=cloud  -> 微信云托管
 *   其他 (默认)        -> 本地 MySQL
 */

let pool = null;

/**
 * 获取 MySQL 连接池
 */
function getPool() {
  if (pool) return pool;

  const isCloud = process.env.RUNTIME_ENV === 'cloud';

  if (isCloud) {
    // 微信云托管环境 - 使用云托管内置 MySQL
    // 云托管会自动注入以下环境变量: MYSQL_ADDRESS, MYSQL_USERNAME, MYSQL_PASSWORD
    const [host, portStr] = (process.env.MYSQL_ADDRESS || '').split(':');
    pool = mysql.createPool({
      host: host || '127.0.0.1',
      port: Number(portStr) || 3306,
      user: process.env.MYSQL_USERNAME || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'oio',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4',
    });
  } else {
    // 本地开发环境 - 使用本地 MySQL
    pool = mysql.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'oio',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4',
    });
  }

  return pool;
}

/** 需要的表名列表 */
const REQUIRED_TABLES = ['users', 'conversations', 'messages', 'event_logs'];

/** 各表的建表 DDL */
const TABLE_DEFINITIONS = {
  users: `
    CREATE TABLE users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      openid VARCHAR(64) UNIQUE NOT NULL,
      session_key VARCHAR(128),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `,
  conversations: `
    CREATE TABLE conversations (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user_id (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `,
  messages: `
    CREATE TABLE messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      conversation_id VARCHAR(64) NOT NULL,
      user_id VARCHAR(64) NOT NULL,
      role VARCHAR(16) NOT NULL,
      content TEXT NOT NULL,
      status VARCHAR(16) DEFAULT 'normal',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_conversation_id (conversation_id),
      INDEX idx_user_id (user_id),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `,
  event_logs: `
    CREATE TABLE event_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(64),
      conversation_id VARCHAR(64),
      event_type VARCHAR(64) NOT NULL,
      detail TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_user_id (user_id),
      INDEX idx_event_type (event_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `,
};

/**
 * 初始化数据库表结构
 * 仅在表不存在时才执行建表，避免每次启动都发 DDL
 */
async function initTables() {
  const p = getPool();
  const dbName = process.env.RUNTIME_ENV === 'cloud'
    ? (process.env.MYSQL_DATABASE || 'oio')
    : (process.env.DB_NAME || 'oio');

  // 一次查询拿到当前库中已有的所有表名
  const [rows] = await p.execute(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
    [dbName],
  );
  const existingTables = new Set(rows.map((r) => r.TABLE_NAME));

  const missing = REQUIRED_TABLES.filter((t) => !existingTables.has(t));
  if (missing.length === 0) return; // 表已齐全，跳过

  for (const table of missing) {
    await p.execute(TABLE_DEFINITIONS[table]);
    console.log(`[DB] 创建表: ${table}`);
  }
}

/**
 * 数据库操作封装类
 * 提供统一的异步 API
 */
class DbWrapper {
  constructor() {
    this._pool = null;
    this._initialized = false;
  }

  /**
   * 确保数据库已初始化
   */
  async ensureReady() {
    if (this._initialized) return;
    this._pool = getPool();
    await initTables();
    this._initialized = true;
  }

  /**
   * 内部：确认已初始化，否则抛出明确错误
   */
  _assertReady() {
    if (!this._initialized || !this._pool) {
      throw new Error('[DB] 数据库尚未初始化，请先调用 db.ensureReady()');
    }
  }

  /**
   * 执行 SQL 并返回所有结果行
   * @param {string} sql - SQL 语句 (使用 ? 占位符)
   * @param {Array} params - 参数数组
   * @returns {Promise<Array>} 结果行数组
   */
  async all(sql, params = []) {
    this._assertReady();
    const [rows] = await this._pool.execute(sql, params);
    return rows;
  }

  /**
   * 执行 SQL 并返回第一行
   * @param {string} sql - SQL 语句
   * @param {Array} params - 参数数组
   * @returns {Promise<Object|null>} 第一行结果或 null
   */
  async get(sql, params = []) {
    this._assertReady();
    const [rows] = await this._pool.execute(sql, params);
    return rows[0] || null;
  }

  /**
   * 执行 SQL（INSERT/UPDATE/DELETE）
   * @param {string} sql - SQL 语句
   * @param {Array} params - 参数数组
   * @returns {Promise<{insertId: number, affectedRows: number}>}
   */
  async run(sql, params = []) {
    this._assertReady();
    const [result] = await this._pool.execute(sql, params);
    return {
      insertId: result.insertId,
      affectedRows: result.affectedRows,
    };
  }

  /**
   * 执行原始 SQL（不返回结果）
   * @param {string} sql - SQL 语句
   */
  async exec(sql) {
    this._assertReady();
    await this._pool.query(sql);
  }

  /**
   * 获取底层连接池（高级用法）
   */
  getPool() {
    return this._pool;
  }

  /**
   * 关闭连接池
   */
  async close() {
    if (this._pool) {
      await this._pool.end();
      this._pool = null;
      this._initialized = false;
      pool = null;
    }
  }
}

const db = new DbWrapper();
export default db;
