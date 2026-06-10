import OpenAI from 'openai';
import { getEncoding } from 'js-tiktoken';

/**
 * 大模型API调用服务（基于 OpenAI SDK，兼容火山引擎）
 * 支持流式响应，支持基于 tiktoken 的滑动窗口上下文管理
 */

const SYSTEM_PROMPT = '你是一个青少年情感陪伴类的AI';
const SYSTEM_BASE_PROMPT = `回答的语义要自然减少人机感。
                        另外这是一个和青少年群体沟通对话的大模型，
                        需要你能够充分理解青少年当下的热梗，能够
                        在和用户聊天的过程当中聊的起来，不要用户
                        问了什么你就回答什么。要主动挖掘用户感兴趣
                        的话题，挖掘他们的情绪。良好的陪伴他们
`;
const MAX_HISTORY_TOKENS = 3000; // 历史消息最大 token 数
const HISTORY_FETCH_LIMIT = 20;  // 数据库粗筛条数
const MODEL = process.env.LLM_MODEL || 'doubao-seed-character-251128';

// 初始化 OpenAI 客户端（兼容火山引擎）
const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_API_URL,
});

// 使用 cl100k_base 编码器（兼容大多数模型）
const enc = getEncoding('cl100k_base');

/**
 * 精确计算文本的 token 数
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  return enc.encode(text).length;
}

/**
 * 根据 Token 上限截断历史消息（滑动窗口）
 * 从最新消息往前推，保留尽量多的近期上下文
 * @param {Array<{role: string, content: string}>} dbMessages - 正序排列的历史消息
 * @param {number} maxTokens - 最大 token 数
 * @returns {Array<{role: string, content: string}>}
 */
function trimHistoryByTokens(dbMessages, maxTokens = MAX_HISTORY_TOKENS) {
  let currentTokens = 0;
  const validHistory = [];

  for (let i = dbMessages.length - 1; i >= 0; i--) {
    const msg = dbMessages[i];
    const tokenCount = estimateTokens(msg.content);

    if (currentTokens + tokenCount > maxTokens) break;

    currentTokens += tokenCount;
    validHistory.unshift(msg);
  }

  console.log(`[LLM] 上下文截断: ${dbMessages.length} 条 -> ${validHistory.length} 条, 约 ${currentTokens} tokens`);
  return validHistory;
}

/**
 * 构建发给 LLM 的消息数组
 * @param {Array<{role: string, content: string}>} dbMessages - 数据库查出的历史消息（正序，已含当前用户消息）
 * @param {string} [systemPrompt] - 可选系统提示词（例如角色任务设定）
 * @returns {Array<{role: string, content: string}>}
 */
function composeSystemPrompt(systemPrompt) {
  const customPrompt = (systemPrompt || SYSTEM_PROMPT).trim();
  const basePrompt = SYSTEM_BASE_PROMPT.trim();
  console.log(`[LLM] 系统提示词:\n${customPrompt}\n---\n${basePrompt}`);
  return `${customPrompt}\n\n${basePrompt}`;
}

export function buildContext(dbMessages, systemPrompt) {
  const trimmed = trimHistoryByTokens(dbMessages);

  const normalized = trimmed
    .map((m) => {
      if (m.role === 'user') return { role: 'user', content: m.content };
      // 数据库中非 user 角色（如 characterId）统一映射为 assistant 供 LLM 使用
      return { role: 'assistant', content: m.content };
    })
    .filter((m) => m.content);
  const mergedSystemPrompt = composeSystemPrompt(systemPrompt);

  return [
    { role: 'system', content: mergedSystemPrompt },
    ...normalized,
  ];
}

/**
 * 调用大模型API（非流式）
 * @param {Array} messages - 消息数组
 * @returns {Promise<string>} AI回复内容
 */
export async function chatCompletion(messages) {
  const completion = await client.chat.completions.create({
    model: MODEL,
    messages,
  });

  return completion.choices[0]?.message?.content || '';
}

/**
 * 调用大模型API（流式响应）
 * 返回 OpenAI SDK 的异步可迭代流对象
 * @param {Array} messages - 消息数组
 * @returns {Promise<AsyncIterable>} 流式响应（异步可迭代）
 */
export async function chatCompletionStream(messages) {
  const stream = await client.chat.completions.create({
    model: MODEL,
    messages,
    stream: true,
  });

  return stream;
}
