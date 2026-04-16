import OpenAI from 'openai';

/**
 * 大模型API调用服务（基于 OpenAI SDK，兼容火山引擎）
 * 支持流式响应，支持上下文最近3轮
 */

const SYSTEM_PROMPT = '你是一个友好、有帮助的AI助手。请用简洁、清晰的中文回答用户的问题。';
const MAX_CONTEXT_ROUNDS = 3; // 最近3轮对话

// 初始化 OpenAI 客户端（兼容火山引擎）
const client = new OpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_API_URL,
});

/**
 * 构建消息上下文（最近3轮）
 * @param {Array} history - 历史消息数组 [{role, content}]
 * @returns {Array} 格式化的消息数组
 */
export function buildContext(history) {
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }];

  // 只取最近3轮 (每轮包含一个user和一个assistant)
  const recentMessages = [];
  let rounds = 0;

  for (let i = history.length - 1; i >= 0 && rounds < MAX_CONTEXT_ROUNDS; i--) {
    recentMessages.unshift(history[i]);
    if (history[i].role === 'user') {
      rounds++;
    }
  }

  messages.push(...recentMessages);
  return messages;
}

/**
 * 调用大模型API（非流式）
 * @param {Array} messages - 消息数组
 * @returns {Promise<string>} AI回复内容
 */
export async function chatCompletion(messages) {
  const model = process.env.LLM_MODEL || 'gpt-3.5-turbo';

  const completion = await client.chat.completions.create({
    model,
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
  const model = process.env.LLM_MODEL || 'gpt-3.5-turbo';

  const stream = await client.chat.completions.create({
    model,
    messages,
    stream: true,
  });

  return stream;
}
