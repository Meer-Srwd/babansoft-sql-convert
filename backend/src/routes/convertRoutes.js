import { Router } from 'express';
import { convertController } from '../controllers/convertController.js';

export const convertRouter = Router();

convertRouter.post('/convert', convertController);
