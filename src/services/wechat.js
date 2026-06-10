import axios from 'axios';

/**
 * 微信登录服务
 * 通过 code2session 接口获取 openid 和 session_key
 */

/**
 * code2session - 用小程序 code 换取 openid 和 session_key
 * @param {string} code - 小程序前端获取的 code
 * @returns {Promise<{openid: string, session_key: string, unionid?: string}>}
 */
export async function code2session(code) {
  const appid = process.env.WX_APPID;
  const secret = process.env.WX_SECRET;

  if (!appid || !secret) {
    throw new Error('微信小程序 APPID 或 SECRET 未配置');
  }

  const url = 'https://api.weixin.qq.com/sns/jscode2session';
  const res = await axios.get(url, {
    params: {
      appid,
      secret,
      js_code: code,
      grant_type: 'authorization_code',
    },
  });

  if (res.data.errcode) {
    throw new Error(`微信登录失败: ${res.data.errmsg} (${res.data.errcode})`);
  }

  return {
    openid: res.data.openid,
    sessionKey: res.data.session_key,
    unionid: res.data.unionid || null,
  };
}

/**
 * 获取微信 access_token (用于内容审核等API调用)
 * 注意: 生产环境建议缓存 access_token
 */
let tokenCache = { token: null, expiresAt: 0 };

export async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expiresAt > now) {
    return tokenCache.token;
  }

  const appid = process.env.WX_APPID;
  const secret = process.env.WX_APPSECRET;

  const res = await axios.get('https://api.weixin.qq.com/cgi-bin/token', {
    params: {
      grant_type: 'client_credential',
      appid,
      secret,
    },
  });

  if (res.data.errcode) {
    throw new Error(`获取access_token失败: ${res.data.errmsg}`);
  }

  tokenCache = {
    token: res.data.access_token,
    expiresAt: now + (res.data.expires_in - 300) * 1000, // 提前5分钟过期
  };

  return tokenCache.token;
}
