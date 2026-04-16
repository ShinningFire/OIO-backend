import Router from 'koa-router';
import { code2session } from '../services/wechat.js';
import db from '../db/init.js';
import cache from '../cache/index.js';
import EventLogger from '../logger/index.js';

const router = new Router({ prefix: '/api/auth' });

/**
 * POST /api/auth/login
 * 微信登录接口 - 通过 code2session 获取 openid
 * 
 * Body: { code: string }
 * Response: { code: number, message: string, data: { openid: string, isNew: boolean } }
 */
router.post('/login', async (ctx) => {
  const { code } = ctx.request.body;

  if (!code) {
    ctx.body = { code: 400, message: '缺少参数 code', data: null };
    return;
  }

  try {
    // 调用微信 code2session
    const { openid, sessionKey } = await code2session(code);

    // 查询或创建用户
    let user = await db.get('SELECT * FROM users WHERE openid = ?', [openid]);
    let isNew = false;

    if (!user) {
      await db.run('INSERT INTO users (openid, session_key) VALUES (?, ?)', [openid, sessionKey]);
      isNew = true;
    } else {
      await db.run('UPDATE users SET session_key = ?, updated_at = NOW() WHERE openid = ?', [sessionKey, openid]);
    }

    // 将 session 信息缓存到 Redis（本地环境）
    await cache.setSession(openid, { sessionKey, loginAt: Date.now() });

    // 记录登录日志
    await EventLogger.logLogin(openid);

    ctx.body = {
      code: 0,
      message: '登录成功',
      data: {
        openid,
        isNew,
      },
    };
  } catch (err) {
    console.error('[Auth] 登录失败:', err.message);
    ctx.body = {
      code: 500,
      message: `登录失败: ${err.message}`,
      data: null,
    };
  }
});

export default router;
