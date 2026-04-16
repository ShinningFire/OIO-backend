import axios from 'axios';
import EventLogger from '../logger/index.js';

/**
 * 内容审核模块
 * 用户输入和AI输出分别审核，违规返回默认回复
 */

// 默认违规回复
const DEFAULT_VIOLATION_REPLY = '您的消息包含不当内容，请修改后重试。';
const AI_VIOLATION_REPLY = '抱歉，生成的回复内容不合适，请换个话题聊聊吧。';

/**
 * 调用微信内容安全API检查文本
 * @param {string} content - 待检查的文本
 * @param {string} accessToken - 微信access_token
 * @returns {Promise<{safe: boolean, label: string}>}
 */
async function wxMsgSecCheck(content, accessToken) {
  try {
    const res = await axios.post(
      `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${accessToken}`,
      {
        version: 2,
        scene: 2,
        openid: 'default',
        content,
      }
    );
    // result.label === '100' 表示正常
    if (res.data && res.data.result) {
      return {
        safe: res.data.result.label === '100' || res.data.result.suggest === 'pass',
        label: res.data.result.label,
      };
    }
    return { safe: true, label: '100' };
  } catch (err) {
    console.error('[ContentCheck] 微信审核API调用失败:', err.message);
    // 审核API调用失败时，默认放行
    return { safe: true, label: 'error' };
  }
}

/**
 * 简单的本地敏感词过滤（作为兜底方案）
 */
const SENSITIVE_WORDS = [
  // 可根据实际需要添加敏感词
];

function localContentCheck(content) {
  const lowerContent = content.toLowerCase();
  for (const word of SENSITIVE_WORDS) {
    if (lowerContent.includes(word.toLowerCase())) {
      return { safe: false, word };
    }
  }
  return { safe: true, word: null };
}

/**
 * 检查用户输入内容
 * @param {string} content - 用户输入
 * @param {string} [accessToken] - 微信access_token
 * @returns {Promise<{safe: boolean, message: string}>}
 */
export async function checkUserInput(content, accessToken) {
  // 本地检查
  const localResult = localContentCheck(content);
  if (!localResult.safe) {
    return { safe: false, message: DEFAULT_VIOLATION_REPLY };
  }

  // 微信API检查（如果有access_token）
  if (accessToken && process.env.WX_CONTENT_CHECK === 'true') {
    const wxResult = await wxMsgSecCheck(content, accessToken);
    if (!wxResult.safe) {
      return { safe: false, message: DEFAULT_VIOLATION_REPLY };
    }
  }

  return { safe: true, message: null };
}

/**
 * 检查AI输出内容
 * @param {string} content - AI输出
 * @param {string} [accessToken] - 微信access_token
 * @returns {Promise<{safe: boolean, message: string}>}
 */
export async function checkAIOutput(content, accessToken) {
  // 本地检查
  const localResult = localContentCheck(content);
  if (!localResult.safe) {
    return { safe: false, message: AI_VIOLATION_REPLY };
  }

  // 微信API检查
  if (accessToken && process.env.WX_CONTENT_CHECK === 'true') {
    const wxResult = await wxMsgSecCheck(content, accessToken);
    if (!wxResult.safe) {
      return { safe: false, message: AI_VIOLATION_REPLY };
    }
  }

  return { safe: true, message: null };
}

/**
 * Koa 审核中间件 - 对POST请求中的 content 字段进行审核
 */
export function contentCheckMiddleware() {
  return async (ctx, next) => {
    if (ctx.method === 'POST' && ctx.request.body && ctx.request.body.content) {
      const { content } = ctx.request.body;
      const userId = ctx.state.userId || 'unknown';
      const conversationId = ctx.request.body.conversationId || 'unknown';

      const result = await checkUserInput(content);
      if (!result.safe) {
        EventLogger.logModeration(userId, conversationId, 'user_input', content);
        ctx.body = {
          code: 403,
          message: result.message,
          data: null,
        };
        return;
      }
    }
    await next();
  };
}
