# 🚦 Traffic Ghost Catcher

[中文版 (Chinese)](./README.zh-CN.md)

**Traffic Ghost Catcher** (交通鬼抓人) is a real-time, location-based multiplayer mobile web game. Ghosts hunt humans using GPS; humans complete tasks to survive. Designed for outdoor group play with a referee managing the game.

## How to play

- **Ghosts** 👻 — Chase and catch human players within 100m using GPS. Each catch earns 50 points for the ghost and the ghost team.
- **Humans** 🏃 — Avoid ghosts and complete location-based tasks (arrive at a station, take a photo, answer trivia) for points. Survive to win a 100-point bonus.
- **Referee** ⚖️ — Create tasks, toggle cross-team visibility, broadcast announcements, and manage the game flow.

### Items & shop

Players spend team points in the shop: **Invisibility**, **Invincibility**, **Pause** (freeze the enemy team), **Trap** (place a trap on the map), **Tracking** (reveal all humans), and **Revive** (bring a caught teammate back).

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, Zustand, AMap (高德) |
| Backend | Express.js, Socket.IO, Prisma ORM, SQLite |
| Shared | TypeScript (npm workspaces monorepo) |
| Production | Nginx reverse proxy + pm2 process manager |

## Project structure

```
traffic-catcher/
├── client/              # React SPA (Vite + Tailwind)
│   ├── src/
│   │   ├── components/  # HUD, GameMap, ShopPanel, ErrorBoundary
│   │   ├── pages/       # Auth, Lobby, CreateRoom, Waiting, Playing, GameOver
│   │   ├── stores/      # Zustand: auth, game, chat, room
│   │   └── hooks/       # useSocket, useLocation
│   └── vite.config.ts
├── server/              # Express + Socket.IO backend
│   ├── src/
│   │   ├── routes/      # REST: auth, rooms, games, shop, users
│   │   ├── socket/      # Socket.IO handlers (room, game, location, item, task, chat)
│   │   ├── services/    # Business logic (auth, room, item)
│   │   ├── lib/         # prisma, jwt, crypto utilities
│   │   └── config/      # env, cors
│   └── prisma/          # Schema + migrations
├── packages/shared/     # Shared types, constants, socket events
└── scripts/             # Build & deploy scripts
```

## Getting started (dev)

```bash
git clone <repo-url> traffic-catcher
cd traffic-catcher
npm install

# Set up environment
cp server/.env.example server/.env
# Edit server/.env with your values

# Initialize database
cd server
npx prisma generate
npx prisma migrate dev

# Start dev servers
cd ..
npm run dev            # Server on :3001, Client on :5173 (HTTPS)
```

The client dev server uses `@vitejs/plugin-basic-ssl` for HTTPS (required for Geolocation API on mobile). API and WebSocket requests are proxied to the backend via Vite's dev proxy.

## Production build

```bash
npm run deploy
```

This compiles shared → server → client and outputs:

- `server/dist/` — Compiled Node.js backend
- `client/dist/` — Static frontend assets
- `packages/shared/dist/` — Compiled shared package

## Deployment

1. Build with `npm run deploy`
2. Copy `server/dist/`, `server/node_modules/`, `server/.env`, `packages/shared/`, and `client/dist/` to the server
3. Run `npx prisma generate && npx prisma migrate deploy` on the server
4. Start the backend: `pm2 start server/dist/index.js --name traffic-ghost`
5. Set up Nginx as reverse proxy — forward `/api` and `/socket.io` to the backend, serve `client/dist/` for static files, and configure SSL certs for HTTPS (required for Geolocation API)
6. Start Nginx

## Socket events

Events are defined in `packages/shared/src/constants/events.ts`. Key game events:

| Client → Server | Server → Client |
|---|---|
| `catch:attempt` | `catch:candidates`, `catch:result` |
| `location:update` | `location:player_moved` |
| `task:complete`, `task:create` | `task:completed`, `task:created` |
| `item:buy`, `item:use` | `item:bought`, `item:used` |
| `room:join`, `game:start` | `room:state`, `game:phase_change` |
| `chat:send`, `broadcast:send` | `chat:message`, `broadcast:announcement` |
