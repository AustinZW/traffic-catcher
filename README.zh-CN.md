# 🚦 交通鬼抓人

[English version](./README.md)

基于 GPS 定位的实时多人手机网页游戏。鬼追人，人做任务。适合户外线下组队游玩，由裁判主持。

## 玩法

- **鬼** 👻 — 利用 GPS 追踪并抓捕 100 米内的人类。每次抓捕成功 +50 分（个人与阵营）。
- **人** 🏃 — 躲避鬼的同时完成定位任务（到达站点、拍照等）赚取积分。存活到游戏结束额外 +100 分。
- **裁判** ⚖️ — 发布任务、切换跨阵营可见性、发送广播、管理游戏进程。

### 道具商城

用阵营积分购买道具：**隐身**、**无敌**、**暂停**（冻结对方阵营）、**陷阱**（在地图埋陷阱）、**追踪**（显示全部人类位置）、**复活**（救回被捕队友）。

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端 | React 19, Vite, Tailwind CSS, Zustand, 高德地图 API |
| 后端 | Express.js, Socket.IO, Prisma ORM, SQLite |
| 共享 | TypeScript (npm workspaces 单体仓库) |
| 生产 | Nginx 反向代理 + pm2 进程管理 |

## 项目结构

```
traffic-catcher/
├── client/              # 前端 SPA
│   ├── src/
│   │   ├── components/  # HUD、GameMap、ShopPanel、ErrorBoundary
│   │   ├── pages/       # 登录、大厅、创建房间、等待、游戏中、结算
│   │   ├── stores/      # Zustand 状态：auth、game、chat、room
│   │   └── hooks/       # useSocket、useLocation
│   └── vite.config.ts
├── server/              # 后端服务
│   ├── src/
│   │   ├── routes/      # REST 接口：auth、rooms、games、shop、users
│   │   ├── socket/      # Socket.IO 事件处理
│   │   ├── services/    # 业务逻辑
│   │   ├── lib/         # prisma、jwt、加密工具
│   │   └── config/      # 环境变量、CORS
│   └── prisma/          # 数据库 schema 和迁移
├── packages/shared/     # 共享类型、常量、事件定义
└── scripts/             # 构建和部署脚本
```

## 本地开发

```bash
git clone <仓库地址> traffic-catcher
cd traffic-catcher
npm install

# 配置环境变量
cp server/.env.example server/.env
# 按需修改 server/.env

# 初始化数据库
cd server
npx prisma generate
npx prisma migrate dev

# 启动开发服务器
cd ..
npm run dev            # 后端 :3001，前端 :5173 (HTTPS)
```

前端使用 `@vitejs/plugin-basic-ssl` 启用 HTTPS（手机端定位权限需要安全上下文）。API 和 WebSocket 通过 Vite 代理转发到后端。

## 生产构建

```bash
npm run deploy
```

编译产出：

- `server/dist/` — 后端，`node dist/index.js` 直接运行
- `client/dist/` — 前端静态文件
- `packages/shared/dist/` — 编译后的共享包

## 部署

1. `npm run deploy` 构建
2. 将 `server/dist/`、`server/node_modules/`、`server/.env`、`packages/shared/`、`client/dist/` 复制到服务器
3. 在服务器运行 `npx prisma generate && npx prisma migrate deploy`
4. 启动后端：`pm2 start server/dist/index.js --name traffic-ghost`
5. 配置 Nginx 反向代理——将 `/api` 和 `/socket.io` 转发到后端，托管 `client/dist/` 静态文件，配置 SSL 证书以启用 HTTPS（定位 API 要求安全上下文）
6. 启动 Nginx

## 通信事件

事件定义在 `packages/shared/src/constants/events.ts`。关键游戏事件：

| 客户端 → 服务端 | 服务端 → 客户端 |
|---|---|
| `catch:attempt` | `catch:candidates`、`catch:result` |
| `location:update` | `location:player_moved` |
| `task:complete`、`task:create` | `task:completed`、`task:created` |
| `item:buy`、`item:use` | `item:bought`、`item:used` |
| `room:join`、`game:start` | `room:state`、`game:phase_change` |
| `chat:send`、`broadcast:send` | `chat:message`、`broadcast:announcement` |
