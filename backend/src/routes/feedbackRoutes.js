import { Router } from 'express';
import { submitFeedbackController } from '../controllers/feedbackController.js';

export const feedbackRouter = Router();

feedbackRouter.post('/feedback', submitFeedbackController);