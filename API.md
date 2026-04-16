# OIO Backend 接口文档

## 接口总览

| # | 接口名称 | 方法 | URL |
|---|---------|------|-----|
| 1 | 健康检查 | GET | `/health` |
| 2 | 微信登录 | POST | `/api/auth/login` |
| 3 | 发送对话（非流式） | POST | `/api/chat/send` |
| 4 | 发送对话（流式 SSE） | POST | `/api/chat/stream` |
| 5 | 异步留言 | POST | `/api/message/leave` |
| 6 | 获取消息列表 | GET | `/api/message/list` |
| 7 | 获取对话列表 | GET | `/api/message/conversations` |

---

## 1. 健康检查

| 项目 | 说明 |
|------|------|
| **URL** | `GET /health` |
| **接口作用** | 服务健康检查，用于判断服务是否正常运行 |

### 参数

无

### 返回值

```json
{
  "code": 0,
  "message": "ok",
  "timestamp": "2026-04-13T11:20:00.000Z"
}
```

---

## 2. 微信登录

| 项目 | 说明 |
|------|------|
| **URL** | `POST /api/auth/login` |
| **接口作用** | 通过微信小程序 `code2session` 获取用户 `openid`，完成登录注册流程，并将 session 缓存至 Redis |

### 参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `code` | string | ✅ | 微信小程序调用 `wx.login()` 获取的临时登录凭证 |

### 返回值

**成功 (code=0)：**

```json
{
  "code": 0,
  "message": "登录成功",
  "data": {
    "openid": "用户的openid",
    "isNew": true
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `data.openid` | string | 用户唯一标识 |
| `data.isNew` | boolean | 是否为新用户（首次登录） |

**失败：**

| code | 说明 |
|------|------|
| 400 | 缺少参数 `code` |
| 500 | 登录失败（微信接口错误或服务器异常） |

---

## 3. 发送对话（非流式）

| 项目 | 说明 |
|------|------|
| **URL** | `POST /api/chat/send` |
| **接口作用** | 用户发送消息并同步获取 AI 回复（非流式），支持内容审核，自动管理对话上下文（最近3轮） |

### 参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `userId` | string | ✅ | 用户标识 |
| `conversationId` | string | ❌ | 对话 ID，不传则自动创建新对话 |
| `content` | string | ✅ | 用户发送的消息内容 |

### 返回值

**成功 (code=0)：**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "conversationId": "uuid-v4-对话ID",
    "reply": "AI的回复内容"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `data.conversationId` | string | 对话 ID（新建或已有） |
| `data.reply` | string | AI 回复内容（经过内容审核） |

**失败：**

| code | 说明 |
|------|------|
| 400 | 缺少参数 `userId` 或 `content` |
| 403 | 用户输入未通过内容审核 |
| 500 | 对话失败（模型调用或服务器异常） |

---

## 4. 发送对话（流式 SSE）

| 项目 | 说明 |
|------|------|
| **URL** | `POST /api/chat/stream` |
| **接口作用** | 用户发送消息并以 SSE（Server-Sent Events）流式获取 AI 回复，适用于实时打字效果展示 |

### 参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `userId` | string | ✅ | 用户标识 |
| `conversationId` | string | ❌ | 对话 ID，不传则自动创建新对话 |
| `content` | string | ✅ | 用户发送的消息内容 |

### 返回值

**响应头：**

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**SSE 数据流格式：**

正常数据块：
```
data: {"content": "AI回复的增量文本片段"}
```

内容审核替换（当 AI 输出未通过审核时）：
```
data: {"replace": true, "content": "替换后的安全内容"}
```

流式错误：
```
data: {"error": "错误信息"}
```

结束标记：
```
data: [DONE]
```

**非流式错误（请求阶段）：**

| code | 说明 |
|------|------|
| 400 | 缺少参数 `userId` 或 `content` |
| 403 | 用户输入未通过内容审核 |
| 500 | 对话失败（服务器异常） |

---

## 5. 异步留言

| 项目 | 说明 |
|------|------|
| **URL** | `POST /api/message/leave` |
| **接口作用** | 用户提交留言，立即返回成功响应，后台异步触发 AI 回复（不阻塞请求），适用于留言板场景 |

### 参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `userId` | string | ✅ | 用户标识 |
| `conversationId` | string | ❌ | 对话 ID，不传则自动创建新对话 |
| `content` | string | ✅ | 留言内容 |

### 返回值

**成功 (code=0)：**

```json
{
  "code": 0,
  "message": "留言成功，AI正在回复中",
  "data": {
    "messageId": 1,
    "conversationId": "uuid-v4-对话ID"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `data.messageId` | number | 留言消息 ID |
| `data.conversationId` | string | 对话 ID（新建或已有） |

**失败：**

| code | 说明 |
|------|------|
| 400 | 缺少参数 `userId` 或 `content` |
| 403 | 用户输入未通过内容审核 |
| 500 | 留言失败（服务器异常） |

---

## 6. 获取消息列表

| 项目 | 说明 |
|------|------|
| **URL** | `GET /api/message/list` |
| **接口作用** | 分页获取指定对话下的消息列表，按时间正序排列 |

### 参数（Query）

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
|--------|------|------|--------|------|
| `conversationId` | string | ✅ | - | 对话 ID |
| `page` | number | ❌ | 1 | 页码 |
| `pageSize` | number | ❌ | 20 | 每页条数 |

### 返回值

**成功 (code=0)：**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "messages": [
      {
        "id": 1,
        "role": "user",
        "content": "消息内容",
        "status": "normal",
        "created_at": "2026-04-13T11:20:00.000Z"
      },
      {
        "id": 2,
        "role": "assistant",
        "content": "AI回复内容",
        "status": "normal",
        "created_at": "2026-04-13T11:20:01.000Z"
      }
    ],
    "total": 50,
    "page": 1,
    "pageSize": 20
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `data.messages` | array | 消息列表 |
| `data.messages[].id` | number | 消息 ID |
| `data.messages[].role` | string | 角色：`user` / `assistant` |
| `data.messages[].content` | string | 消息内容 |
| `data.messages[].status` | string | 状态：`normal` / `blocked` |
| `data.messages[].created_at` | string | 创建时间 |
| `data.total` | number | 消息总数 |
| `data.page` | number | 当前页码 |
| `data.pageSize` | number | 每页条数 |

**失败：**

| code | 说明 |
|------|------|
| 400 | 缺少参数 `conversationId` |
| 500 | 获取消息列表失败 |

---

## 7. 获取对话列表

| 项目 | 说明 |
|------|------|
| **URL** | `GET /api/message/conversations` |
| **接口作用** | 获取指定用户的所有对话列表，包含最新消息预览和消息数量，按更新时间倒序排列 |

### 参数（Query）

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `userId` | string | ✅ | 用户标识 |

### 返回值

**成功 (code=0)：**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "conversations": [
      {
        "id": "uuid-v4-对话ID",
        "created_at": "2026-04-13T10:00:00.000Z",
        "updated_at": "2026-04-13T11:20:00.000Z",
        "last_message": "最后一条消息内容",
        "message_count": 10
      }
    ]
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `data.conversations` | array | 对话列表 |
| `data.conversations[].id` | string | 对话 ID |
| `data.conversations[].created_at` | string | 创建时间 |
| `data.conversations[].updated_at` | string | 最后更新时间 |
| `data.conversations[].last_message` | string | 最新一条消息内容 |
| `data.conversations[].message_count` | number | 对话中消息总数 |

**失败：**

| code | 说明 |
|------|------|
| 400 | 缺少参数 `userId` |
| 500 | 获取对话列表失败 |

---

## 通用说明

### 响应格式

所有接口（除 SSE 流式接口外）统一返回以下 JSON 格式：

```json
{
  "code": 0,
  "message": "描述信息",
  "data": {}
}
```

| code 值 | 含义 |
|---------|------|
| 0 | 成功 |
| 400 | 请求参数错误 |
| 403 | 内容审核未通过 |
| 500 | 服务器内部错误 |

### 请求头

- `Content-Type: application/json`（POST 请求）

### 内容审核

- 用户输入和 AI 输出均经过内容安全审核
- 审核未通过时用户输入返回 403，AI 输出会被替换为安全提示文本
