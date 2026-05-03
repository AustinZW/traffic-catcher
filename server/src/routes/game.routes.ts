import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { createTask, updateTask, deleteTask, getTasks } from '../controllers/task.controller';

const router = Router();

router.use(authenticate);

router.get('/:gameId/tasks', getTasks);
router.post('/:gameId/tasks', createTask);
router.put('/:gameId/tasks/:taskId', updateTask);
router.delete('/:gameId/tasks/:taskId', deleteTask);

export default router;
