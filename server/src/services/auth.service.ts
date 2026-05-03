import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { signToken } from '../lib/jwt';

export async function registerUser(username: string, password: string, email?: string) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ username }, { email: email || undefined }] },
  });
  if (existing) {
    throw new Error(existing.username === username ? 'Username taken' : 'Email taken');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, email, passwordHash },
  });

  await prisma.stats.create({ data: { userId: user.id } });

  const token = signToken({ userId: user.id, username: user.username });
  return { token, user: { id: user.id, username: user.username, email: user.email, rolePreference: (user as any).rolePreference, avatarUrl: user.avatarUrl, createdAt: user.createdAt.toISOString() } };
}

export async function loginUser(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw new Error('Invalid credentials');

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new Error('Invalid credentials');

  const token = signToken({ userId: user.id, username: user.username });
  return { token, user: { id: user.id, username: user.username, email: user.email, rolePreference: (user as any).rolePreference, avatarUrl: user.avatarUrl, createdAt: user.createdAt.toISOString() } };
}

export async function getUserProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { stats: true },
  });
  if (!user) throw new Error('User not found');
  return { id: user.id, username: user.username, email: user.email, rolePreference: (user as any).rolePreference, avatarUrl: user.avatarUrl, createdAt: user.createdAt.toISOString(), stats: user.stats };
}
