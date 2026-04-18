import 'dotenv/config';
import Koa from 'koa';
import bodyParser from 'koa-bodyparser';
import cors from '@koa/cors';

import db from './src/db/init.js';
import cache from './src/cache/index.js';
import { httpLogger } from './src/logger/index.js';
import authRouter from './src/routes/auth.js';
import chatRouter from './src/routes/chat.js';
import messageRouter from './src/routes/message.js';

const app = new Koa();
const PORT = process.env.PORT || 80;

// 全局错误处理
app.on('error', (err, ctx) => {
  console.error('[Server Error]', err.message);
});

// 中间件: CORS
app.use(cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// 中间件: Body解析
app.use(bodyParser({
  enableTypes: ['json'],
  jsonLimit: '5mb',
}));

// 中间件: HTTP 请求日志 (本地: morgan, 线上: 预留)
app.use(httpLogger('dev'));

// 中间件: 全局异常捕获
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error('[Unhandled Error]', err);
    ctx.status = err.status || 500;
    ctx.body = {
      code: ctx.status,
      message: err.message || '服务器内部错误',
      data: null,
    };
  }
});

// 注册路由
app.use(authRouter.routes()).use(authRouter.allowedMethods());
app.use(chatRouter.routes()).use(chatRouter.allowedMethods());
app.use(messageRouter.routes()).use(messageRouter.allowedMethods());

// 健康检查
app.use(async (ctx) => {
  if (ctx.path === '/health') {
    ctx.body = { code: 0, message: 'ok', timestamp: new Date().toISOString() };
  }
});

// 等待数据库和缓存初始化完成后启动服务器
async function start() {
  const isCloud = process.env.RUNTIME_ENV === 'cloud';

  // 初始化数据库
  await db.ensureReady();
  console.log('[DB] MySQL 数据库初始化完成');

  // 初始化缓存
  await cache.init();
  if (!isCloud) {
    console.log('[Cache] Redis 缓存初始化完成');
  }

  app.listen(PORT, '0.0.0.0',() => {
    console.log(`🚀 OIO Backend 服务启动成功 (${isCloud ? '云托管模式' : '本地开发模式'})`);
    console.log(`📡 监听端口: ${PORT}`);
    console.log(`🔗 访问地址: http://localhost:${PORT}`);
    console.log(`❤️  健康检查: http://localhost:${PORT}/health`);
  });
}

start().catch((err) => {
  console.error('服务启动失败:', err);
  process.exit(1);
});

export default app;
