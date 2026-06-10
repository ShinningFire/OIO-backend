import Router from 'koa-router';
import crypto from 'node:crypto';
import { code2session } from '../services/wechat.js';
import db from '../db/init.js';
import cache from '../cache/index.js';
import EventLogger from '../logger/index.js';

const router = new Router({ prefix: '/api/auth' });

/**
 * POST /api/auth/login
 * 微信登录接口 - 通过 code2session 获取 openid，并返回随机 token
 * 
 * Body: { code: string }
 * Response: { code: number, message: string, data: { token: string, isNew: boolean } }
 */
router.post('/login', async (ctx) => {
  const { code } = ctx.request.body || {};

  if (!code) {
    ctx.body = { code: 400, message: '缺少参数 code', data: null };
    return;
  }

  try {
    // 1) 调用微信 code2session，换取 openid / sessionKey
    const { openid, sessionKey } = await code2session(code);

    if (!openid || !sessionKey) {
      const missing = [];
      if (!openid) missing.push('openid');
      if (!sessionKey) missing.push('sessionKey');
      ctx.body = { code: 500, message: `微信登录缺少字段: ${missing.join(', ')}`, data: null };
      return;
    }

    // 2) 用户表 upsert
    const existed = await db.get(
      'SELECT openid FROM users WHERE openid = ? LIMIT 1',
      [openid],
    );

    await db.run(
      `INSERT INTO users (openid, session_key)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE session_key = VALUES(session_key), updated_at = CURRENT_TIMESTAMP`,
      [openid, sessionKey],
    );

    // 3) 生成随机 token，并把 token -> 用户登录态写入 Redis
    const token = crypto.randomUUID();
    await cache.setSession(token, {
      openid,
      sessionKey,
      loginAt: Date.now(),
    });

    // 4) 记录登录事件
    await EventLogger.logLogin(openid);

    // 5) 返回 token 给前端
    ctx.body = {
      code: 0,
      message: '登录成功',
      data: {
        token,
        isNew: !existed,
      },
    };
  } catch (err) {
    console.error('[Auth] 登录失败:', err.message);
    ctx.body = { code: 500, message: `登录失败: ${err.message}`, data: null };
  }
});

export default router;
