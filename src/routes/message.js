import Router from 'koa-router';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/init.js';
import EventLogger from '../logger/index.js';
import { buildContext, chatCompletion } from '../services/llm.js';
import { checkUserInput, checkAIOutput } from '../middleware/contentCheck.js';

const router = new Router({ prefix: '/api/message' });

// 已按需求临时注释下线：POST /api/message/leave
// router.post('/leave', async (ctx) => {
//   ...
// });

/**
 * GET /api/message/list
 * 获取留言/消息列表
 * 
 * Query: { conversationId: string, page?: number, pageSize?: number }
 */
router.get('/list', async (ctx) => {
  const { conversationId, page = 1, pageSize = 20 } = ctx.query;

  if (!conversationId) {
    ctx.body = { code: 400, message: '缺少参数 conversationId', data: null };
    return;
  }

  try {
    const offset = (Number(page) - 1) * Number(pageSize);
    const messages = await db.all(
      'SELECT id, role, content, status, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ? OFFSET ?',
      [conversationId, Number(pageSize), offset]
    );

    const total = await db.get(
      'SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?',
      [conversationId]
    );

    ctx.body = {
      code: 0,
      message: 'success',
      data: {
        messages,
        total: total.count,
        page: Number(page),
        pageSize: Number(pageSize),
      },
    };
  } catch (err) {
    console.error('[Message] 获取消息列表失败:', err.message);
    ctx.body = { code: 500, message: `获取消息列表失败: ${err.message}`, data: null };
  }
});

// 已按需求临时注释下线：GET /api/message/conversations
// router.get('/conversations', async (ctx) => {
//   ...
// });

/**
 * 异步触发AI回复
 */
async function triggerAIReply(conversationId, userId) {
  // 获取历史消息
  const history = await db.all(
    'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
    [conversationId]
  );

  const messages = buildContext(history);

  // 调用大模型
  const reply = await chatCompletion(messages);

  // AI输出审核
  const outputCheck = await checkAIOutput(reply);
  const finalReply = outputCheck.safe ? reply : outputCheck.message;

  if (!outputCheck.safe) {
    await EventLogger.logModeration(userId, conversationId, 'ai_output', reply);
  }

  // 保存AI回复
  await db.run(
    'INSERT INTO messages (conversation_id, user_id, role, content, status) VALUES (?, ?, ?, ?, ?)',
    [conversationId, userId, 'assistant', finalReply, outputCheck.safe ? 'normal' : 'blocked']
  );

  // 更新对话时间
  await db.run('UPDATE conversations SET updated_at = NOW() WHERE id = ?', [conversationId]);

  await EventLogger.logAIReply(userId, conversationId, finalReply);
}

export default router;
