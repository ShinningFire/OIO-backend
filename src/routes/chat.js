import Router from 'koa-router';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/init.js';
import EventLogger from '../logger/index.js';
import { buildContext, chatCompletion, chatCompletionStream } from '../services/llm.js';
import { checkUserInput, checkAIOutput } from '../middleware/contentCheck.js';

const router = new Router({ prefix: '/api/chat' });

/**
 * POST /api/chat/send
 * 对话接口 - 非流式模式
 * 
 * Body: { userId: string, conversationId?: string, content: string }
 * Response: { code: number, message: string, data: { conversationId, reply } }
 */
router.post('/send', async (ctx) => {
  const { userId, conversationId: convId, content } = ctx.request.body;

  if (!userId || !content) {
    ctx.body = { code: 400, message: '缺少参数 userId 或 content', data: null };
    return;
  }

  // 内容审核 - 用户输入
  const inputCheck = await checkUserInput(content);
  if (!inputCheck.safe) {
    await EventLogger.logModeration(userId, convId || 'unknown', 'user_input', content);
    ctx.body = { code: 403, message: inputCheck.message, data: null };
    return;
  }

  try {
    // 获取或创建对话
    let conversationId = convId;
    if (!conversationId) {
      conversationId = uuidv4();
      await db.run('INSERT INTO conversations (id, user_id) VALUES (?, ?)', [conversationId, userId]);
    }

    // 保存用户消息
    await db.run(
      'INSERT INTO messages (conversation_id, user_id, role, content) VALUES (?, ?, ?, ?)',
      [conversationId, userId, 'user', content]
    );

    // 记录用户消息日志
    await EventLogger.logUserMessage(userId, conversationId, content);

    // 获取历史消息 (最近的对话记录)
    const history = await db.all(
      'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [conversationId]
    );

    // 构建上下文 (最近3轮)
    const messages = buildContext(history);

    // 调用大模型
    const reply = await chatCompletion(messages);

    // 内容审核 - AI输出
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

    // 记录AI回复日志
    await EventLogger.logAIReply(userId, conversationId, finalReply);

    ctx.body = {
      code: 0,
      message: 'success',
      data: {
        conversationId,
        reply: finalReply,
      },
    };
  } catch (err) {
    console.error('[Chat] 对话失败:', err.message);
    ctx.body = { code: 500, message: `对话失败: ${err.message}`, data: null };
  }
});

/**
 * POST /api/chat/stream
 * 对话接口 - 流式模式 (SSE)
 * 
 * Body: { userId: string, conversationId?: string, content: string }
 * Response: SSE 流式响应
 */
router.post('/stream', async (ctx) => {
  const { userId, conversationId: convId, content } = ctx.request.body;

  if (!userId || !content) {
    ctx.body = { code: 400, message: '缺少参数 userId 或 content', data: null };
    return;
  }

  // 内容审核 - 用户输入
  const inputCheck = await checkUserInput(content);
  if (!inputCheck.safe) {
    await EventLogger.logModeration(userId, convId || 'unknown', 'user_input', content);
    ctx.body = { code: 403, message: inputCheck.message, data: null };
    return;
  }

  try {
    // 获取或创建对话
    let conversationId = convId;
    if (!conversationId) {
      conversationId = uuidv4();
      await db.run('INSERT INTO conversations (id, user_id) VALUES (?, ?)', [conversationId, userId]);
    }

    // 保存用户消息
    await db.run(
      'INSERT INTO messages (conversation_id, user_id, role, content) VALUES (?, ?, ?, ?)',
      [conversationId, userId, 'user', content]
    );

    await EventLogger.logUserMessage(userId, conversationId, content);

    // 获取历史消息
    const history = await db.all(
      'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [conversationId]
    );

    const messages = buildContext(history);

    // 设置SSE响应头
    ctx.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    ctx.status = 200;
    ctx.flushHeaders?.();

    // 获取流式响应（OpenAI SDK 异步可迭代）
    const stream = await chatCompletionStream(messages);

    let fullReply = '';

    // 使用 passthrough 写入 SSE
    const { PassThrough } = await import('stream');
    const passthrough = new PassThrough();
    ctx.body = passthrough;

    try {
      for await (const part of stream) {
        const delta = part.choices?.[0]?.delta?.content || '';
        if (delta) {
          fullReply += delta;
          passthrough.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
        }
      }

      // AI输出审核
      const outputCheck = await checkAIOutput(fullReply);
      if (!outputCheck.safe) {
        await EventLogger.logModeration(userId, conversationId, 'ai_output', fullReply);
        fullReply = outputCheck.message;
        // 向客户端发送审核替换消息
        passthrough.write(`data: ${JSON.stringify({ replace: true, content: outputCheck.message })}\n\n`);
      }

      // 保存AI回复到数据库
      await db.run(
        'INSERT INTO messages (conversation_id, user_id, role, content, status) VALUES (?, ?, ?, ?, ?)',
        [conversationId, userId, 'assistant', fullReply, outputCheck.safe ? 'normal' : 'blocked']
      );

      await EventLogger.logAIReply(userId, conversationId, fullReply);

      passthrough.write('data: [DONE]\n\n');
      passthrough.end();
    } catch (streamErr) {
      console.error('[Chat Stream] 流式响应错误:', streamErr.message);
      passthrough.write(`data: ${JSON.stringify({ error: streamErr.message })}\n\n`);
      passthrough.end();
    }
  } catch (err) {
    console.error('[Chat Stream] 对话失败:', err.message);
    ctx.body = { code: 500, message: `对话失败: ${err.message}`, data: null };
  }
});

export default router;
