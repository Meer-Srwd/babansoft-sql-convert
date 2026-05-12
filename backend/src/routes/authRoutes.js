import { Router } from 'express';
import {
  accountController,
  deleteAccountController,
  forgotPasswordController,
  loginController,
  logoutController,
  refreshController,
  registerController,
  resendConfirmationController,
  resetPasswordController,
  updateAccountProfileController,
  updateAccountSettingsController
} from '../controllers/authController.js';

export const authRouter = Router();

authRouter.post('/auth/register', registerController);
authRouter.post('/auth/login', loginController);
authRouter.post('/auth/refresh', refreshController);
authRouter.post('/auth/forgot-password', forgotPasswordController);
authRouter.post('/auth/resend-confirmation', resendConfirmationController);
authRouter.post('/auth/reset-password', resetPasswordController);
authRouter.post('/auth/logout', logoutController);
authRouter.get('/account/me', accountController);
authRouter.patch('/account/profile', updateAccountProfileController);
authRouter.patch('/account/settings', updateAccountSettingsController);
authRouter.delete('/account', deleteAccountController);