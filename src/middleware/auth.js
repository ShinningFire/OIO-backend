import cache from '../cache/index.js';

// 不需要登录验证的白名单路径
const WHITE_LIST = [
  '/api/auth/login',
  '/health',
];

/**
 * 全局登录态验证中间件
 * - 白名单路径直接放行
 * - 其他路径校验 Authorization header 中的 token，并从 Redis 还原用户会话
 */
export async function authMiddleware(ctx, next) {
  // 白名单放行
  if (WHITE_LIST.includes(ctx.path)) {
    return next();
  }

  const token = ctx.headers['authorization'];


  if (!token) {
    ctx.body = { code: 401, message: '未登录', data: null };
    return;
  }
  let session = null;
  try {
    session = await Promise.race([
      cache.getSession(token),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis 超时')), 8000)),
    ]);
  } catch (err) {
    console.error('[Auth] Redis getSession 失败:', err.message);
    ctx.body = { code: 503, message: '认证服务暂不可用，请稍后重试', data: null };
    return;
  }

  if (!session) {
    ctx.body = { code: 401, message: 'session 已过期，请重新登录', data: null };
    return;
  }

  if (!session.openid) {
    ctx.body = { code: 401, message: '登录态无效，请重新登录', data: null };
    return;
  }

  // 将 token、openid 和 session 挂载到 ctx.state，方便后续路由直接使用
  ctx.state.token = token;
  ctx.state.openid = session.openid;
  ctx.state.session = session;

  return next();
}
