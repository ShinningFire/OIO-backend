import morgan from 'morgan';
import db from '../db/init.js';

/**
 * HTTP 请求日志模块 - 使用 morgan 输出控制台日志
 */

// ========== HTTP 请求日志 (morgan) ==========

/**
 * 获取 HTTP 请求日志中间件
 * Koa 适配的 morgan 中间件
 * @param {string} [format='dev'] - morgan 格式: 'dev' | 'combined' | 'common' | 'short' | 'tiny'
 * @returns {Function} Koa 中间件
 */
export function httpLogger(format = 'dev') {
  const morganMiddleware = morgan(format);

  return async (ctx, next) => {
    await new Promise((resolve, reject) => {
      morganMiddleware(ctx.req, ctx.res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    await next();
  };
}

// ========== 业务埋点日志 ==========

/**
 * 业务事件日志系统
 * 记录每条消息的时间、用户id、对话id 到数据库
 */
class EventLogger {
  /**
   * 记录事件日志
   * @param {Object} params
   * @param {string} params.userId - 用户ID (openid)
   * @param {string} params.conversationId - 对话ID
   * @param {string} params.eventType - 事件类型
   * @param {string|Object} params.detail - 事件详情
   */
  static async log({ userId, conversationId, eventType, detail }) {
    const detailStr = typeof detail === 'object' ? JSON.stringify(detail) : (detail || '');
    try {
      await db.run(
        'INSERT INTO event_logs (user_id, conversation_id, event_type, detail) VALUES (?, ?, ?, ?)',
        [userId || null, conversationId || null, eventType, detailStr]
      );
    } catch (err) {
      console.error('[EventLogger] 写入日志失败:', err.message);
    }
  }

  /**
   * 记录用户消息事件
   */
  static async logUserMessage(userId, conversationId, content) {
    await this.log({
      userId,
      conversationId,
      eventType: 'user_message',
      detail: { contentLength: content.length },
    });
  }

  /**
   * 记录AI回复事件
   */
  static async logAIReply(userId, conversationId, content) {
    await this.log({
      userId,
      conversationId,
      eventType: 'ai_reply',
      detail: { contentLength: content.length },
    });
  }

  /**
   * 记录登录事件
   */
  static async logLogin(userId) {
    await this.log({
      userId,
      conversationId: null,
      eventType: 'login',
      detail: null,
    });
  }

  /**
   * 记录内容审核违规事件
   */
  static async logModeration(userId, conversationId, type, content) {
    await this.log({
      userId,
      conversationId,
      eventType: `moderation_${type}`,
      detail: { blocked: true, contentPreview: content.substring(0, 50) },
    });
  }
}

export default EventLogger;
