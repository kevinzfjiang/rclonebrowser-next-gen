import { ensureDirectoriesAndDefaults } from './config.js';
import { authService } from './authService.js';

ensureDirectoriesAndDefaults();
authService.resetPasswordCli();
