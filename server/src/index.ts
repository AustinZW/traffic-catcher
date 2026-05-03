import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { Server } from 'socket.io';
import { env } from './config/env';
import { corsOptions } from './config/cors';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import roomRoutes from './routes/room.routes';
import gameRoutes from './routes/game.routes';
import shopRoutes from './routes/shop.routes';
import { setupSocketHandlers } from './socket/index';

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: corsOptions,
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors(corsOptions));
app.use(express.json());

// REST routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/shop', shopRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Socket.io auth middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }
  try {
    const { verifyToken } = require('./lib/jwt');
    const payload = verifyToken(token);
    (socket as any).userId = payload.userId;
    (socket as any).username = payload.username;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

setupSocketHandlers(io);

server.listen(env.PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${env.PORT}`);
});

export { io };
