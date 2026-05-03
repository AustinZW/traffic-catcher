import { Request, Response } from 'express';
import { registerUser, loginUser, getUserProfile } from '../services/auth.service';
import { AuthRequest } from '../middleware/authenticate';

export async function register(req: Request, res: Response) {
  try {
    const { username, password, email } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    const result = await registerUser(username, password, email);
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    const result = await loginUser(username, password);
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
}

export async function me(req: AuthRequest, res: Response) {
  try {
    const profile = await getUserProfile(req.userId!);
    res.json(profile);
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
}
