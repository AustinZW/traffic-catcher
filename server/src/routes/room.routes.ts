import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { create, list, detail, join, leave, start } from '../controllers/room.controller';

const router = Router();

router.use(authenticate);

router.post('/', create);
router.get('/', list);
router.get('/:code', detail);
router.post('/:code/join', join);
router.post('/:code/leave', leave);
router.post('/:code/start', start);

export default router;
