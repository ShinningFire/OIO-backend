import Router from 'koa-router';
import db from '../db/init.js';
import { v4 as uuidv4 } from 'uuid';

const router = new Router({ prefix: '/api/user' });

/**
 * POST /api/user/avatar
 * 保存头像 cloudID（前端直传 COS 后调用此接口）
 *
 * 前端流程:
 *   1. wx.cloud.uploadFile 直接上传到 COS，获得 cloudID
 *   2. 调用此接口把 cloudID 传给后端保存
 *
 * Header: Authorization: <openid>
 * Body: { cloudId: string }
 * Response: { code: 0, message: '头像更新成功', data: { cloudId } }
 */
router.post('/avatar', async (ctx) => {
  const openid = ctx.state.openid;
  const { cloudId } = ctx.request.body;
  if (!cloudId || !cloudId.startsWith('cloud://')) {
    ctx.body = { code: 400, message: '无效的 cloudId', data: null };
    return;
  }

  try {
    await db.run(
      'UPDATE users SET avatar = ?, updated_at = NOW() WHERE openid = ?',
      [cloudId, openid]
    );

    console.log(`[User] 头像更新成功, openid: ${openid}, cloudId: ${cloudId}`);
    ctx.body = { code: 0, message: '头像更新成功', data: { cloudId } };
  } catch (err) {
    console.error('[User] 头像更新失败:', err.message);
    ctx.body = { code: 500, message: '头像更新失败', data: null };
  }
});

/**
 * GET /api/user/onboarding/info
 * 查询当前用户的头像 URL 与昵称（来自 user_onboarding_profiles）
 *
 * Header: Authorization: <token>
 * Response: { code: 0, message: 'ok', data: { userId, nickname, avatarUrl } }
 */
router.get('/onboarding/info', async (ctx) => {
  const openid = ctx.state.openid;

  try {
    const row = await db.get(
      `SELECT user_id AS userId, nickname, avatar_url AS avatarUrl
       FROM user_onboarding_profiles
       WHERE user_id = ?`,
      [openid],
    );

    if (!row) {
      ctx.body = { code: 404, message: '用户资料不存在', data: null };
      return;
    }

    ctx.body = { code: 0, message: 'ok', data: row };
  } catch (err) {
    console.error('[User/onboarding/info] 查询失败:', err.message);
    ctx.body = { code: 500, message: `查询失败: ${err.message}`, data: null };
  }
});

/**
 * GET /api/user/profile
 * 获取用户信息
 *
 * Header: Authorization: <openid>
 * Response: { code: 0, message: 'ok', data: { openid, avatar, created_at, updated_at } }
 */
router.get('/profile', async (ctx) => {
  const openid = ctx.state.openid;

  const user = await db.get(
    'SELECT openid, avatar, created_at, updated_at FROM users WHERE openid = ?',
    [openid]
  );

  ctx.body = { code: 0, message: 'ok', data: user };
});

/**
 * POST /api/user/onboarding/profile
 * 登录后补充用户基础资料（昵称、生日、性别、头像URL、性格、日常、爱好、自画像）
 *
 * Header: Authorization: <openid>
 * Body: {
 *   nickname: string,
 *   birthday: string, // YYYY-MM-DD
 *   gender: string,
 *   avatarUrl: string,
 *   personality: string,
 *   daily: string,
 *   hobbies: string,
 *   selfPortrait: string
 * }
 */
router.post('/onboarding/profile', async (ctx) => {
  const openid = ctx.state.openid;
  const {
    nickname,
    birthday,
    gender,
    avatarUrl,
    personality,
    daily,
    hobbies,
    selfPortrait,
  } = ctx.request.body || {};

  const required = {
    nickname,
    birthday,
    gender,
    avatarUrl,
    personality,
    daily,
    hobbies,
    selfPortrait,
  };

  const missing = Object.entries(required)
    .filter(([, value]) => value === undefined || value === null || String(value).trim() === '')
    .map(([key]) => key);

  if (missing.length > 0) {
    ctx.body = {
      code: 400,
      message: `缺少参数: ${missing.join(', ')}`,
      data: null,
    };
    return;
  }

  const birthdayText = String(birthday).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdayText)) {
    ctx.body = { code: 400, message: 'birthday 格式错误，请使用 YYYY-MM-DD', data: null };
    return;
  }

  try {
    await db.run(
      `INSERT INTO user_onboarding_profiles (
         user_id,
         nickname,
         birthday,
         gender,
         avatar_url,
         personality,
         daily,
         hobbies,
         self_portrait
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         nickname = VALUES(nickname),
         birthday = VALUES(birthday),
         gender = VALUES(gender),
         avatar_url = VALUES(avatar_url),
         personality = VALUES(personality),
         daily = VALUES(daily),
         hobbies = VALUES(hobbies),
         self_portrait = VALUES(self_portrait),
         updated_at = CURRENT_TIMESTAMP`,
      [
        openid,
        String(nickname).trim(),
        birthdayText,
        String(gender).trim(),
        String(avatarUrl).trim(),
        String(personality).trim(),
        String(daily).trim(),
        String(hobbies).trim(),
        String(selfPortrait).trim(),
      ],
    );

    const row = await db.get(
      `SELECT
         user_id AS userId,
         nickname,
         birthday,
         gender,
         avatar_url AS avatarUrl,
         personality,
         daily,
         hobbies,
         self_portrait AS selfPortrait,
         created_at AS createdAt,
         updated_at AS updatedAt
       FROM user_onboarding_profiles
       WHERE user_id = ?`,
      [openid],
    );

    ctx.body = {
      code: 0,
      message: '用户资料保存成功',
      data: row,
    };
  } catch (err) {
    console.error('[User] 保存 onboarding 资料失败:', err.message);
    ctx.body = { code: 500, message: `保存资料失败: ${err.message}`, data: null };
  }
});

/**
 * GET /api/user/friends/queryList
 * 查询全部角色列表，并合并当前用户与角色的好友关系
 *
 * Header: Authorization: <openid>
 * Response: { code: 0, message: 'ok', data: [{ openid, characterId, ..., isfriend }] }
 */
router.get('/friends/queryList', async (ctx) => {
  const openid = ctx.state.openid;

  const rows = await db.all(
    `SELECT
        ? AS openid,
        p.character_id AS characterId,
        p.name,
        p.zodiac,
        p.mbti,
        p.introduction,
        p.person_info AS personInfo,
        p.background_url AS backgroundUrl,
  p.avatar_icon AS avatarIcon,
        p.person_setting AS personSetting,
        COALESCE(r.isfriend, 0) AS isfriend,
        p.updated_at AS updatedAt
     FROM user_character_profiles p
     LEFT JOIN user_character_relations r
       ON r.character_id = p.character_id AND r.user_id = ?
     ORDER BY p.updated_at DESC`,
    [openid, openid],
  );

  ctx.body = { code: 0, message: 'ok', data: rows };
});

/**
 * POST /api/user/friends/addFriend
 * 添加角色好友（写入/更新 user_character_relations）
 *
 * Header: Authorization: <openid>
 * Body: { characterId: string }
 * Response: { code: 0, message: '添加好友成功', data: { openid, characterId, isfriend } }
 */
router.post('/friends/addFriend', async (ctx) => {
  const openid = ctx.state.openid;
  const { characterId } = ctx.request.body || {};

  if (!characterId) {
    ctx.body = { code: 400, message: '缺少参数: characterId', data: null };
    return;
  }

  try {
    await db.run(
      `INSERT INTO user_character_relations (user_id, character_id, isfriend)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE isfriend = 1, updated_at = CURRENT_TIMESTAMP`,
      [openid, characterId],
    );

    // 自动创建用户与该虚拟角色会话（幂等：已有会话则复用）
    let conversation = await db.get(
      `SELECT id
       FROM conversations
       WHERE user_id = ? AND character_id = ?
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`,
      [openid, characterId],
    );

    if (!conversation) {
      const conversationId = uuidv4();
      await db.run(
        'INSERT INTO conversations (id, user_id, character_id) VALUES (?, ?, ?)',
        [conversationId, openid, characterId],
      );

      // 写入角色首条欢迎消息，确保会话列表可立即展示“最后一条消息”
      await db.run(
        'INSERT INTO messages (conversation_id, user_id, role, content, status) VALUES (?, ?, ?, ?, ?)',
        [conversationId, openid, characterId, 'hi~很高兴认识你。', 'normal'],
      );

      conversation = { id: conversationId };
    }

    ctx.body = {
      code: 0,
      message: '添加好友成功',
      data: {
        openid,
        characterId,
        isfriend: 1,
        conversationId: conversation.id,
      },
    };
  } catch (err) {
    console.error('[User] 添加角色好友失败:', err.message);
    ctx.body = { code: 500, message: '添加好友失败', data: null };
  }
});

export default router;
