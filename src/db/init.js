import mysql from 'mysql2/promise';
import { TABLE_SCHEMAS } from './schema/index.js';

/**
 * 数据库模块
 * 统一使用 DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME 环境变量连接 MySQL
 */

let pool = null;

/**
 * 获取 MySQL 连接池
 */
function getPool() {
  if (pool) return pool;

  pool = mysql.createPool({
    host: process.env.DB_HOST || '10.47.106.115',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'oio',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4',
  });

  return pool;
}

/** 需要的表名列表 */
const REQUIRED_TABLES = TABLE_SCHEMAS.map((s) => s.tableName);

/** 各表的建表 DDL */
const TABLE_DEFINITIONS = Object.fromEntries(
  TABLE_SCHEMAS.map((s) => [s.tableName, s.ddl]),
);

/**
 * 初始化数据库表结构
 * 仅在表不存在时才执行建表，避免每次启动都发 DDL
 */
async function initTables() {
  const p = getPool();
  const dbName = process.env.DB_NAME || 'oio';

  // 一次查询拿到当前库中已有的所有表名
  const [rows] = await p.execute(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?',
    [dbName],
  );
  const existingTables = new Set(rows.map((r) => r.TABLE_NAME));

  const missing = REQUIRED_TABLES.filter((t) => !existingTables.has(t));

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
