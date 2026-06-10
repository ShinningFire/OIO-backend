import Router from 'koa-router';
import db from '../db/init.js';
import { v4 as uuidv4 } from 'uuid';

const router = new Router({ prefix: '/api/accompany' });

/**
 * GET /api/accompany/characters/queryList
 * 角色展示列表（需登录）
 *
 * Header: Authorization: <openid>
 * Query: { keyword?: string }
 */
router.get('/characters/queryList', async (ctx) => {
  const keyword = (ctx.query.keyword || '').toString().trim().toLowerCase();
  const like = `%${keyword}%`;

  const rows = await db.all(
    `SELECT id, name, tag, description AS \`desc\`, avatar_url AS avatar
     FROM accompany_characters
     WHERE ? = ''
       OR LOWER(id) LIKE ?
       OR LOWER(name) LIKE ?
       OR LOWER(tag) LIKE ?
       OR LOWER(description) LIKE ?
     ORDER BY updated_at DESC, created_at DESC`,
    [keyword, like, like, like, like],
  );

  ctx.body = { code: 0, message: 'ok', data: rows };
});

/**
 * POST /api/accompany/activity
 * 新建陪伴活动
 *
 * Header: Authorization: <openid>
 * Body: {
 *   accompanyMode: string,
 *   accompanyCharacter: string,
 *   accompanyStartTime: string,
 *   accompanyEndTime?: string
 * }
 * Response: { code: 0, message: 'ok', data: { activityId } }
 */
router.post('/activity', async (ctx) => {
  const openid = ctx.state.openid || ctx.headers['authorization'];
  const {
    accompanyMode,
    accompanyCharacter,
    accompanyStartTime,
    accompanyEndTime,
  } = ctx.request.body || {};

  const missing = [];
  if (!openid) missing.push('openid');
  if (!accompanyMode) missing.push('accompanyMode');
  if (!accompanyCharacter) missing.push('accompanyCharacter');
  if (!accompanyStartTime) missing.push('accompanyStartTime');

  if (missing.length > 0) {
    ctx.body = {
      code: 400,
      message: `缺少参数: ${missing.join(', ')}`,
      data: null,
    };
    return;
  }

  const activityId = uuidv4();

  try {
    await db.run(
      `INSERT INTO accompany_activities (
         activity_id,
         user_id,
         accompany_mode,
         accompany_character,
         accompany_start_time,
         accompany_end_time
       ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        activityId,
        openid,
        accompanyMode,
        accompanyCharacter,
        accompanyStartTime,
        accompanyEndTime || null,
      ],
    );

    ctx.body = {
      code: 0,
      message: 'ok',
      data: { activityId },
    };
  } catch (err) {
    console.error('[Accompany/activity:POST] 新建陪伴活动失败:', err.message);
    ctx.body = { code: 500, message: `新建陪伴活动失败: ${err.message}`, data: null };
  }
});

/**
 * PUT /api/accompany/activity
 * 修改陪伴活动（至少传 activityId + accompanyEndTime）
 *
 * Header: Authorization: <openid>
 * Body: {
 *   activityId: string,
 *   accompanyEndTime: string,
 *   accompanyMode?: string,
 *   accompanyCharacter?: string,
 *   accompanyStartTime?: string
 * }
 * Response: { code: 0, message: 'ok', data: activity }
 */
router.put('/activity', async (ctx) => {
  const openid = ctx.state.openid || ctx.headers['authorization'];
  const {
    activityId,
    accompanyEndTime,
    accompanyMode,
    accompanyCharacter,
    accompanyStartTime,
  } = ctx.request.body || {};

  const missing = [];
  if (!openid) missing.push('openid');
  if (!activityId) missing.push('activityId');
  if (!accompanyEndTime) missing.push('accompanyEndTime');

  if (missing.length > 0) {
    ctx.body = {
      code: 400,
      message: `缺少参数: ${missing.join(', ')}`,
      data: null,
    };
    return;
  }

  try {
    const existing = await db.get(
      'SELECT activity_id FROM accompany_activities WHERE activity_id = ? AND user_id = ?',
      [activityId, openid],
    );

    if (!existing) {
      ctx.body = { code: 404, message: '陪伴活动不存在或不属于当前用户', data: null };
      return;
    }

    const fields = ['accompany_end_time = ?'];
    const params = [accompanyEndTime];

    if (accompanyMode) {
      fields.push('accompany_mode = ?');
      params.push(accompanyMode);
    }
    if (accompanyCharacter) {
      fields.push('accompany_character = ?');
      params.push(accompanyCharacter);
    }
    if (accompanyStartTime) {
      fields.push('accompany_start_time = ?');
      params.push(accompanyStartTime);
    }

    params.push(activityId, openid);

    await db.run(
      `UPDATE accompany_activities
       SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE activity_id = ? AND user_id = ?`,
      params,
    );

    const row = await db.get(
      `SELECT activity_id AS activityId,
              accompany_character AS accompanyCharacter,
              accompany_end_time AS accompanyEndTime,
              accompany_mode AS accompanyMode,
              accompany_start_time AS accompanyStartTime
       FROM accompany_activities
       WHERE activity_id = ? AND user_id = ?`,
      [activityId, openid],
    );

    ctx.body = {
      code: 0,
      message: 'ok',
      data: row,
    };
  } catch (err) {
    console.error('[Accompany/activity:PUT] 修改陪伴活动失败:', err.message);
    ctx.body = { code: 500, message: `修改陪伴活动失败: ${err.message}`, data: null };
  }
});

export default router;
