import Router from 'koa-router';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/init.js';
import EventLogger from '../logger/index.js';
import { buildContext, chatCompletion, chatCompletionStream } from '../services/llm.js';
import { checkUserInput, checkAIOutput } from '../middleware/contentCheck.js';

const router = new Router({ prefix: '/api/chat' });

function formatTimeAgo(dateLike) {
  if (!dateLike) return null;

  const target = new Date(dateLike);
  if (Number.isNaN(target.getTime())) return null;

  const diffMs = Date.now() - target.getTime();
  const safeDiffMs = diffMs < 0 ? 0 : diffMs;
  const diffMinutes = Math.floor(safeDiffMs / (1000 * 60));

  if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}小时前`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}天前`;
}

async function getAvatarIconMapByCharacterIds(characterIds = []) {
  const uniqueIds = [...new Set(characterIds.filter(Boolean))];
  if (uniqueIds.length === 0) return {};

  const placeholders = uniqueIds.map(() => '?').join(', ');
  const rows = await db.all(
    `SELECT character_id, avatar_icon
     FROM user_character_profiles
     WHERE character_id IN (${placeholders})`,
    uniqueIds,
  );

  return rows.reduce((acc, row) => {
    acc[row.character_id] = row.avatar_icon || null;
    return acc;
  }, {});
}

async function getAvatarIconByCharacterId(characterId) {
  if (!characterId) return null;
  const iconMap = await getAvatarIconMapByCharacterIds([characterId]);
  return iconMap[characterId] || null;
}

/**
 * GET /api/chat/getConversationList
 * 获取用户全部会话（含每个会话最后一条消息与时间差）
 *
 * Header: Authorization: <openid>
 */
router.get('/getConversationList', async (ctx) => {
  const openid = ctx.state.openid || ctx.headers['authorization'];

  if (!openid) {
    ctx.body = { code: 400, message: '缺少参数 openid', data: null };
    return;
  }

  try {
    const conversations = await db.all(
      `SELECT c.id AS conversation_id,
              c.character_id,
              c.created_at,
              c.updated_at,
              m.id AS last_message_id,
              m.role AS last_message_role,
              m.content AS last_message_content,
              m.created_at AS last_message_time
       FROM conversations c
       LEFT JOIN messages m ON m.id = (
         SELECT m2.id
         FROM messages m2
         WHERE m2.conversation_id = c.id
         ORDER BY m2.created_at DESC, m2.id DESC
         LIMIT 1
       )
       WHERE c.user_id = ?
       ORDER BY COALESCE(m.created_at, c.updated_at) DESC, c.updated_at DESC`,
      [openid],
    );

    const avatarIconMap = await getAvatarIconMapByCharacterIds(
      conversations.map((item) => item.character_id),
    );

    const list = conversations.map((item) => ({
      conversationId: item.conversation_id,
      characterId: item.character_id,
      avatarIcon: avatarIconMap[item.character_id] || null,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      lastMessage: item.last_message_content
        ? {
            id: item.last_message_id,
            role: item.last_message_role,
            content: item.last_message_content,
            createdAt: item.last_message_time,
            timeAgo: formatTimeAgo(item.last_message_time),
          }
        : null,
    }));

    ctx.body = {
      code: 0,
      message: 'success',
      data: {
        conversations: list,
      },
    };
  } catch (err) {
    console.error('[Chat/getConversationList] 获取会话列表失败:', err.message);
    ctx.body = { code: 500, message: `获取会话列表失败: ${err.message}`, data: null };
  }
});

/**
 * GET /api/chat/getConversationListDetail
 * 获取指定会话详情（消息倒序分页）
 *
 * Header: Authorization: <openid>
 * Query: { conversationId: string, from?: number, limit?: number }
 * 说明:
 * - from 默认 0（偏移量）
 * - limit 默认 10
 * - 按 created_at/id 倒序（最新在前）
 */
router.get('/getConversationListDetail', async (ctx) => {
  const openid = ctx.state.openid || ctx.headers['authorization'];
  const { conversationId } = ctx.query;

  const from = Number.parseInt(ctx.query.from ?? '0', 10);
  const limitRaw = Number.parseInt(ctx.query.limit ?? '10', 10);
  const limit = Number.isNaN(limitRaw) ? 10 : Math.min(Math.max(limitRaw, 1), 100);

  if (!openid) {
    ctx.body = { code: 400, message: '缺少参数 openid', data: null };
    return;
  }

  if (!conversationId) {
    ctx.body = { code: 400, message: '缺少参数 conversationId', data: null };
    return;
  }

  if (Number.isNaN(from) || from < 0) {
    ctx.body = { code: 400, message: '参数错误: from 必须为大于等于 0 的整数', data: null };
    return;
  }

  try {
    const conversation = await db.get(
      'SELECT id, character_id FROM conversations WHERE id = ? AND user_id = ?',
      [conversationId, openid],
    );

    if (!conversation) {
      ctx.body = { code: 404, message: '会话不存在或不属于当前用户', data: null };
      return;
    }

    const avatarIcon = await getAvatarIconByCharacterId(conversation.character_id);

    const messages = await db.all(
      `SELECT id, conversation_id AS conversationId, user_id AS userId, role, content, status, created_at AS createdAt
       FROM messages
       WHERE conversation_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ${limit} OFFSET ${from}`,
      [conversationId],
    );
    const orderedMessages = [...messages].reverse();

    const totalRow = await db.get(
      'SELECT COUNT(*) AS total FROM messages WHERE conversation_id = ?',
      [conversationId],
    );
    const total = totalRow?.total || 0;

    ctx.body = {
      code: 0,
      message: 'success',
      data: {
        conversationId,
        avatarIcon,
        from,
        limit,
        total,
        hasMore: from + messages.length < total,
        messages: orderedMessages,
      },
    };
  } catch (err) {
    console.error('[Chat/getConversationListDetail] 获取会话详情失败:', err.message);
    ctx.body = { code: 500, message: `获取会话详情失败: ${err.message}`, data: null };
  }
});

/**
 * POST /api/chat/send
 * 对话接口 - 非流式模式
 * 
 * Header: Authorization: <openid>
 * Body: { characterId: string, conversationId?: string, content: string }
 * Response: { code: number, message: string, data: { conversationId, reply, timestamp } }
 */
router.post('/send', async (ctx) => {
  const openid = ctx.state.openid || ctx.headers['authorization'];
  const { characterId, conversationId: convId, content } = ctx.request.body;
  console.log('[Chat/send] 收到请求, openid:', openid, 'characterId:', characterId, 'content:', content);

  const missingParams = [];
  if (!openid) missingParams.push('openid');
  if (!characterId) missingParams.push('characterId');
  if (!content) missingParams.push('content');

  if (missingParams.length > 0) {
    ctx.body = {
      code: 400,
      message: `缺少参数: ${missingParams.join(', ')}`,
      data: null,
    };
    return;
  }

  // 内容审核 - 用户输入 (测试时暂时跳过)
  // const inputCheck = await checkUserInput(content);
  // if (!inputCheck.safe) {
  //   await EventLogger.logModeration(userId, convId || 'unknown', 'user_input', content);
  //   ctx.body = { code: 403, message: inputCheck.message, data: null };
  //   return;
  // }

  try {
    // 建立/更新时间用户-角色关系
    await db.run(
      `INSERT INTO user_character_relations (user_id, character_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
      [openid, characterId],
    );

    // 读取角色人物设定（公共设定，按 character_id）
    await db.run(
      `INSERT INTO user_character_profiles (character_id)
       VALUES (?)
       ON DUPLICATE KEY UPDATE updated_at = CURRENT_TIMESTAMP`,
      [characterId],
    );
    const characterProfile = await db.get(
      'SELECT person_setting FROM user_character_profiles WHERE character_id = ?',
      [characterId],
    );
    const personSetting = characterProfile?.person_setting?.trim() || undefined;

    // 获取或创建对话
    let conversationId = convId;
    if (!conversationId) {
      conversationId = uuidv4();
      console.log('[Chat/send] 创建新会话:', conversationId);
      try {
        await db.run('INSERT INTO conversations (id, user_id, character_id) VALUES (?, ?, ?)', [conversationId, openid, characterId]);
      } catch (err) {
        console.log('[DB] 创建会话插入报错:', err.message);
        throw err;
      }
    } else {
      const existingConversation = await db.get(
        'SELECT id FROM conversations WHERE id = ? AND user_id = ? AND character_id = ?',
        [conversationId, openid, characterId],
      );
      if (!existingConversation) {
        ctx.body = { code: 404, message: '会话不存在或不属于当前用户/角色', data: null };
        return;
      }
    }
    console.log('[Chat/send] 使用会话:', conversationId);

    // 保存用户消息
    console.log('[Chat/send] 保存用户消息...');
    try {
      await db.run(
        'INSERT INTO messages (conversation_id, user_id, role, content) VALUES (?, ?, ?, ?)',
        [conversationId, openid, 'user', content]
      );
      console.log('[Chat/send] 用户消息保存成功');
    } catch (err) {
      console.log('[DB] 用户消息插入报错:', err.message);
      throw err;
    }

    // 记录用户消息日志
    await EventLogger.logUserMessage(openid, conversationId, content);

    // 粗筛最近20条（倒序），反转为正序后交给 buildContext 用 tiktoken 精确截断
    console.log('[Chat/send] 查询历史消息...');
    const rawHistory = await db.all(
      'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 20',
      [conversationId]
    );
    rawHistory.reverse();
    console.log('[Chat/send] 历史消息数量:', rawHistory.length);

    // 构建上下文（tiktoken 滑动窗口截断）
    const messages = personSetting
      ? buildContext(rawHistory, personSetting)
      : buildContext(rawHistory);
    console.log('[Chat/send] 上下文构建完成, 消息数:', messages.length);

    // 调用大模型
    console.log('[Chat/send] 开始调用大模型...');
    const reply = await chatCompletion(messages);
    console.log('[Chat/send] 大模型响应成功, 长度:', reply.length);

    // 内容审核 - AI输出 (测试时暂时跳过)
    const finalReply = reply;

    // 保存AI回复
    console.log('[Chat/send] 保存AI回复...');
    try {
      await db.run(
        'INSERT INTO messages (conversation_id, user_id, role, content, status) VALUES (?, ?, ?, ?, ?)',
        [conversationId, openid, characterId, finalReply, 'normal']
      );
    } catch (err) {
      console.log('[DB] AI回复插入报错:', err.message);
      throw err;
    }

    // 记录AI回复日志
    await EventLogger.logAIReply(openid, conversationId, finalReply);

    console.log('[Chat/send] 请求完成 ✅');
    ctx.body = {
      code: 0,
      message: 'success',
      data: {
        conversationId,
        reply: finalReply,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    console.error('[Chat/send] 对话失败:', err.message);
    ctx.body = { code: 500, message: `对话失败: ${err.message}`, data: null };
  }
});

/**
 * POST /api/chat/stream
 * 对话接口 - 流式模式 (SSE)
 * 
 * Header: Authorization: <openid>
 * Body: { conversationId?: string, content: string }
 * Response: SSE 流式响应
 */
router.post('/stream', async (ctx) => {
  const openid = ctx.state.openid || ctx.headers['authorization'];
  const { conversationId: convId, content } = ctx.request.body;

  if (!openid || !content) {
    ctx.body = { code: 400, message: '缺少参数 openid 或 content', data: null };
    return;
  }

  // 内容审核 - 用户输入
  const inputCheck = await checkUserInput(content);
  if (!inputCheck.safe) {
    await EventLogger.logModeration(openid, convId || 'unknown', 'user_input', content);
    ctx.body = { code: 403, message: inputCheck.message, data: null };
    return;
  }

  try {
    let assistantRole = 'assistant';

    // 获取或创建对话
    let conversationId = convId;
    if (!conversationId) {
      conversationId = uuidv4();
      await db.run('INSERT INTO conversations (id, user_id) VALUES (?, ?)', [conversationId, openid]);
    } else {
      const existingConversation = await db.get(
        'SELECT character_id FROM conversations WHERE id = ? AND user_id = ?',
        [conversationId, openid],
      );
      if (existingConversation?.character_id) {
        assistantRole = existingConversation.character_id;
      }
    }

    // 保存用户消息
    await db.run(
      'INSERT INTO messages (conversation_id, user_id, role, content) VALUES (?, ?, ?, ?)',
      [conversationId, openid, 'user', content]
    );

    await EventLogger.logUserMessage(openid, conversationId, content);

    // 粗筛最近20条（倒序），反转为正序后交给 buildContext 用 tiktoken 精确截断
    const rawHistory = await db.all(
      'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 20',
      [conversationId]
    );
    rawHistory.reverse();

    const messages = buildContext(rawHistory);

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
        await EventLogger.logModeration(openid, conversationId, 'ai_output', fullReply);
        fullReply = outputCheck.message;
        // 向客户端发送审核替换消息
        passthrough.write(`data: ${JSON.stringify({ replace: true, content: outputCheck.message })}\n\n`);
      }

      // 保存AI回复到数据库
      await db.run(
        'INSERT INTO messages (conversation_id, user_id, role, content, status) VALUES (?, ?, ?, ?, ?)',
        [conversationId, openid, assistantRole, fullReply, outputCheck.safe ? 'normal' : 'blocked']
      );

      await EventLogger.logAIReply(openid, conversationId, fullReply);

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
