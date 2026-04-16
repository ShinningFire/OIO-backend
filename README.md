# OIO Backend

基于 Koa 框架的微信小程序后端服务，支持微信登录、AI对话（流式）、内容审核、留言存储和埋点日志。

支持**本地开发**和**微信云托管**两种运行模式，通过环境变量 `RUNTIME_ENV` 切换。

## 项目结构

```
OIO-backend/
├── main.js                    # 入口文件
├── package.json
├── .env                       # 环境变量配置
├── .env.example               # 环境变量示例
└── src/
    ├── db/
    │   └── init.js            # 数据库初始化 (MySQL)
    ├── cache/
    │   └── index.js           # 登录缓存 (Redis / 微信原生)
    ├── logger/
    │   └── index.js           # 日志系统 (morgan / 线上预留)
    ├── middleware/
    │   └── contentCheck.js    # 内容审核中间件
    ├── routes/
    │   ├── auth.js            # 微信登录路由
    │   ├── chat.js            # AI对话路由（含流式）
    │   └── message.js         # 留言存储/获取路由
    └── services/
        ├── llm.js             # 大模型API调用服务
        └── wechat.js          # 微信服务（code2session）
```

## 环境模式说明

| 模块 | 本地开发 (`RUNTIME_ENV=local`) | 线上部署 (`RUNTIME_ENV=cloud`) |
|------|------|------|
| 数据库 | 本地 MySQL | 微信云托管 MySQL（自动注入连接信息） |
| 登录缓存 | Redis | 微信小程序原生登录态管理 |
| HTTP日志 | morgan (控制台输出) | 预留接口（待定） |
| 业务埋点 | event_logs 表 (MySQL) | event_logs 表 (MySQL) |

## 快速开始

### 1. 前置依赖

- **Node.js** >= 18
- **MySQL** >= 5.7
- **Redis** >= 6.0（仅本地开发需要）

### 2. 安装依赖

```bash
npm install
```

### 3. 创建 MySQL 数据库

```sql
CREATE DATABASE IF NOT EXISTS oio DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

> 表结构会在服务启动时自动创建，无需手动建表。

### 4. 配置环境变量

复制 `.env.example` 为 `.env`，并填入实际配置：

```bash
cp .env.example .env
```

关键配置项：

```env
RUNTIME_ENV=local          # 本地开发
DB_HOST=127.0.0.1          # MySQL 地址
DB_PORT=3306               # MySQL 端口
DB_USER=root               # MySQL 用户名
DB_PASSWORD=your_password  # MySQL 密码
DB_NAME=oio                # MySQL 数据库名
REDIS_HOST=127.0.0.1       # Redis 地址
REDIS_PORT=6379            # Redis 端口
```

### 5. 启动服务

```bash
# 开发模式（自动重启）
npm run dev

# 生产模式
npm start
```

## API 接口文档

### 1. 微信登录

**POST** `/api/auth/login`

```json
// Request
{ "code": "微信小程序登录code" }

// Response
{ "code": 0, "message": "登录成功", "data": { "openid": "xxx", "isNew": true } }
```

### 2. AI对话（非流式）

**POST** `/api/chat/send`

```json
// Request
{ "userId": "openid", "conversationId": "可选", "content": "你好" }

// Response
{ "code": 0, "message": "success", "data": { "conversationId": "uuid", "reply": "AI回复" } }
```

### 3. AI对话（流式 SSE）

**POST** `/api/chat/stream`

```json
// Request
{ "userId": "openid", "conversationId": "可选", "content": "你好" }

// Response: SSE 流式事件
data: {"content": "你"}
data: {"content": "好"}
data: [DONE]
```

### 4. 异步留言

**POST** `/api/message/leave`

```json
// Request
{ "userId": "openid", "conversationId": "可选", "content": "留言内容" }

// Response
{ "code": 0, "message": "留言成功，AI正在回复中", "data": { "messageId": 1, "conversationId": "uuid" } }
```

### 5. 获取消息列表

**GET** `/api/message/list?conversationId=xxx&page=1&pageSize=20`

### 6. 获取对话列表

**GET** `/api/message/conversations?userId=xxx`

### 7. 健康检查

**GET** `/health`

## 功能说明

| 功能 | 说明 |
|------|------|
| 微信登录 | 通过 code2session 获取 openid，自动创建用户，本地 Redis 缓存 session |
| AI对话 | 支持流式/非流式，保留最近3轮上下文 |
| 内容审核 | 用户输入和AI输出分别审核，违规返回默认回复 |
| 留言系统 | 异步存储留言，后台自动触发AI回复 |
| 业务埋点 | 记录用户消息、AI回复、登录、审核等事件到 MySQL |
| HTTP日志 | 本地使用 morgan，线上预留接口 |
| 数据存储 | MySQL 数据库，支持本地/云托管双模式 |

## 部署

### 本地 / 云服务器部署

```bash
# 1. 安装依赖
npm install --production

# 2. 确保 MySQL 和 Redis 服务正常运行

# 3. 使用 PM2 管理进程
npm install -g pm2
pm2 start main.js --name oio-backend
pm2 save
pm2 startup
```

### 微信云托管部署

1. 设置环境变量 `RUNTIME_ENV=cloud`
2. 云托管会自动注入 `MYSQL_ADDRESS`、`MYSQL_USERNAME`、`MYSQL_PASSWORD` 等环境变量
3. 云托管模式下不依赖 Redis，登录态由微信小程序原生管理
4. 支持通过 Dockerfile 部署到微信云托管平台
