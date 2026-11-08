import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { AUTH_DB_PATH } from './config.js';

export interface AuthConfig {
  username: string;
  passwordHash: string;
  passwordSalt: string;
  authEnabled: boolean;
  mustChangePassword: boolean;
  tokenSecret: string;
  updatedAt: string;
}

export interface AuthStatusResponse {
  authRequired: boolean;
  authenticated: boolean;
  username: string;
  mustChangePassword: boolean;
}

interface RateLimitEntry {
  failedAttempts: number;
  lockedUntil: number;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export class AuthError extends Error {
  public statusCode: number;
  public retryAfterSeconds?: number;

  constructor(message: string, statusCode = 401, retryAfterSeconds?: number) {
    super(message);
    this.statusCode = statusCode;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

class AuthService {
  private config!: AuthConfig;
  private rateLimits: Map<string, RateLimitEntry> = new Map();
  private lastGeneratedConsolePassword: string | null = null;

  constructor() {
    this.initOrLoad();
  }

  /**
   * Generate a random human-readable password without ambiguous characters (0/O/1/l/I).
   */
  public generateRandomPassword(length = 12): string {
    const bytes = crypto.randomBytes(length);
    let chars = '';
    for (let i = 0; i < length; i++) {
      chars += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
    }
    return `RbN-${chars}`;
  }

  /**
   * Compute a 64-byte scrypt hash using the provided hex salt.
   */
  public hashPassword(password: string, saltHex: string): string {
    const saltBuffer = Buffer.from(saltHex, 'hex');
    return crypto.scryptSync(password, saltBuffer, 64).toString('hex');
  }

  /**
   * Constant-time verification of a plaintext password against a stored scrypt hash.
   */
  public verifyPassword(password: string, saltHex: string, expectedHashHex: string): boolean {
    if (!password || !saltHex || !expectedHashHex) return false;
    try {
      const computedHex = this.hashPassword(password, saltHex);
      const a = Buffer.from(computedHex, 'hex');
      const b = Buffer.from(expectedHashHex, 'hex');
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  /**
   * Initialize /config/auth.json if missing, or load existing persisted credentials.
   */
  public initOrLoad(): void {
    try {
      if (fs.existsSync(AUTH_DB_PATH)) {
        const raw = fs.readFileSync(AUTH_DB_PATH, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<AuthConfig>;
        if (parsed && parsed.username && parsed.passwordHash && parsed.passwordSalt) {
          this.config = {
            username: String(parsed.username),
            passwordHash: String(parsed.passwordHash),
            passwordSalt: String(parsed.passwordSalt),
            authEnabled: parsed.authEnabled !== false,
            mustChangePassword: Boolean(parsed.mustChangePassword),
            tokenSecret: String(parsed.tokenSecret || crypto.randomBytes(32).toString('hex')),
            updatedAt: String(parsed.updatedAt || new Date().toISOString()),
          };
          return;
        }
      }
    } catch (err: any) {
      console.warn(`[Auth] Failed to read ${AUTH_DB_PATH}, generating fresh credentials: ${err.message}`);
    }

    // First-time startup: generate random initial password and print to console
    const initialPassword = this.generateRandomPassword(12);
    const salt = crypto.randomBytes(16).toString('hex');
    const tokenSecret = crypto.randomBytes(32).toString('hex');

    this.config = {
      username: 'admin',
      passwordHash: this.hashPassword(initialPassword, salt),
      passwordSalt: salt,
      authEnabled: true,
      mustChangePassword: true,
      tokenSecret,
      updatedAt: new Date().toISOString(),
    };
    this.lastGeneratedConsolePassword = initialPassword;
    this.saveConfig();

    console.log('');
    console.log('============================================================');
    console.log('🔐 [SECURITY] INITIAL ADMINISTRATOR CREDENTIALS GENERATED');
    console.log('------------------------------------------------------------');
    console.log(` 👤 Username         : ${this.config.username}`);
    console.log(` 🔑 Initial Password : ${initialPassword}`);
    console.log('------------------------------------------------------------');
    console.log(' ⚠️  Please sign in using the initial password above.');
    console.log(' ⚠️  You will be required to change your password on first login.');
    console.log(` 💾 Salted scrypt hash saved to: ${AUTH_DB_PATH}`);
    console.log('============================================================');
    console.log('');
  }

  private saveConfig(): void {
    try {
      const dir = path.dirname(AUTH_DB_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(AUTH_DB_PATH, JSON.stringify(this.config, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
      });
    } catch (err: any) {
      console.warn(`[Auth] Warning saving ${AUTH_DB_PATH}: ${err.message}`);
    }
  }

  /**
   * Reload config from disk in case the CLI reset-password tool updated /config/auth.json externally.
   */
  public reloadFromDiskIfModified(): void {
    try {
      if (!fs.existsSync(AUTH_DB_PATH)) return;
      const raw = fs.readFileSync(AUTH_DB_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<AuthConfig>;
      if (parsed && parsed.updatedAt && parsed.updatedAt !== this.config.updatedAt) {
        this.config = {
          username: String(parsed.username || 'admin'),
          passwordHash: String(parsed.passwordHash || ''),
          passwordSalt: String(parsed.passwordSalt || ''),
          authEnabled: parsed.authEnabled !== false,
          mustChangePassword: Boolean(parsed.mustChangePassword),
          tokenSecret: String(parsed.tokenSecret || this.config.tokenSecret),
          updatedAt: String(parsed.updatedAt),
        };
      }
    } catch {
      // Ignore transient read errors
    }
  }

  public createToken(): string {
    return crypto
      .createHmac('sha256', this.config.tokenSecret)
      .update(`${this.config.username}:${this.config.passwordHash}:${this.config.authEnabled}`)
      .digest('hex');
  }

  public isTokenValid(token: string | undefined): boolean {
    this.reloadFromDiskIfModified();
    if (!this.config.authEnabled) return true;
    if (!token) return false;
    try {
      const expected = this.createToken();
      const a = Buffer.from(token, 'utf-8');
      const b = Buffer.from(expected, 'utf-8');
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  public isAuthEnabled(): boolean {
    this.reloadFromDiskIfModified();
    return this.config.authEnabled;
  }

  public getStatus(token: string | undefined): AuthStatusResponse {
    this.reloadFromDiskIfModified();
    const authenticated = this.isTokenValid(token);
    return {
      authRequired: this.config.authEnabled,
      authenticated,
      username: this.config.username,
      mustChangePassword: this.config.authEnabled && authenticated && this.config.mustChangePassword,
    };
  }

  /**
   * Authenticate user credentials with IP brute-force lockout protection.
   */
  public login(
    clientIp: string,
    username: string,
    password: string
  ): { token: string; username: string; mustChangePassword: boolean; authRequired: boolean } {
    this.reloadFromDiskIfModified();
    const ipKey = clientIp || 'unknown';
    const now = Date.now();
    const entry = this.rateLimits.get(ipKey);

    if (entry && entry.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil((entry.lockedUntil - now) / 1000);
      throw new AuthError(
        `Too many failed login attempts. Please try again in ${retryAfterSeconds} seconds.`,
        429,
        retryAfterSeconds
      );
    }

    if (!this.config.authEnabled) {
      return {
        token: 'auth-disabled',
        username: this.config.username,
        mustChangePassword: false,
        authRequired: false,
      };
    }

    const userMatches = String(username || '').trim() === this.config.username;
    const passMatches = this.verifyPassword(
      String(password || ''),
      this.config.passwordSalt,
      this.config.passwordHash
    );

    if (!userMatches || !passMatches) {
      const prevCount =
        entry && entry.lockedUntil > 0 && entry.lockedUntil <= now ? 0 : entry?.failedAttempts || 0;
      const nextCount = prevCount + 1;

      if (nextCount >= MAX_FAILED_ATTEMPTS) {
        const lockedUntil = now + LOCKOUT_DURATION_MS;
        this.rateLimits.set(ipKey, { failedAttempts: nextCount, lockedUntil });
        throw new AuthError(
          `Maximum failed login attempts (${MAX_FAILED_ATTEMPTS}) reached. Locked for 5 minutes.`,
          429,
          Math.ceil(LOCKOUT_DURATION_MS / 1000)
        );
      } else {
        this.rateLimits.set(ipKey, { failedAttempts: nextCount, lockedUntil: 0 });
        const remaining = MAX_FAILED_ATTEMPTS - nextCount;
        throw new AuthError(
          `Invalid username or password (${remaining} attempt${remaining === 1 ? '' : 's'} remaining).`,
          401
        );
      }
    }

    // Reset rate limit counter on successful authentication
    this.rateLimits.delete(ipKey);

    return {
      token: this.createToken(),
      username: this.config.username,
      mustChangePassword: this.config.mustChangePassword,
      authRequired: this.config.authEnabled,
    };
  }

  /**
   * Update administrator username, password, or passwordless direct mode.
   */
  public updateSecurity(params: {
    currentPassword?: string;
    newUsername?: string;
    newPassword?: string;
    authEnabled?: boolean;
  }): {
    token: string;
    username: string;
    authRequired: boolean;
    mustChangePassword: boolean;
  } {
    this.reloadFromDiskIfModified();
    const currentPassword = String(params.currentPassword || '');
    const newUsername = params.newUsername !== undefined ? String(params.newUsername).trim() : undefined;
    const newPassword = params.newPassword !== undefined ? String(params.newPassword) : undefined;
    const nextAuthEnabled =
      typeof params.authEnabled === 'boolean' ? params.authEnabled : this.config.authEnabled;

    // Require currentPassword verification whenever auth is currently enabled,
    // or when re-enabling auth without setting a brand new password.
    const needsCurrentPasswordCheck =
      this.config.authEnabled || (!this.config.authEnabled && nextAuthEnabled && !newPassword);

    if (needsCurrentPasswordCheck) {
      if (!currentPassword) {
        throw new AuthError('Current password is required to modify security settings.', 400);
      }
      if (!this.verifyPassword(currentPassword, this.config.passwordSalt, this.config.passwordHash)) {
        throw new AuthError('Current password is incorrect.', 401);
      }
    }

    if (this.config.mustChangePassword && nextAuthEnabled && !newPassword) {
      throw new AuthError('You must set a new password on first login.', 400);
    }

    if (newUsername !== undefined) {
      if (newUsername.length < 2 || newUsername.length > 64) {
        throw new AuthError('Username must be between 2 and 64 characters.', 400);
      }
      this.config.username = newUsername;
    }

    if (newPassword !== undefined && newPassword.length > 0) {
      if (newPassword.length < 6) {
        throw new AuthError('New password must be at least 6 characters long.', 400);
      }
      const newSalt = crypto.randomBytes(16).toString('hex');
      this.config.passwordSalt = newSalt;
      this.config.passwordHash = this.hashPassword(newPassword, newSalt);
      this.config.tokenSecret = crypto.randomBytes(32).toString('hex');
      this.config.mustChangePassword = false;
    }

    this.config.authEnabled = nextAuthEnabled;
    if (!nextAuthEnabled) {
      this.config.mustChangePassword = false;
    }

    this.config.updatedAt = new Date().toISOString();
    this.saveConfig();

    return {
      token: this.createToken(),
      username: this.config.username,
      authRequired: this.config.authEnabled,
      mustChangePassword: this.config.mustChangePassword,
    };
  }

  /**
   * Reset administrator password from the CLI and print a new temporary password to stdout.
   */
  public resetPasswordCli(): { username: string; tempPassword: string } {
    this.reloadFromDiskIfModified();
    const tempPassword = this.generateRandomPassword(12);
    const newSalt = crypto.randomBytes(16).toString('hex');

    this.config = {
      username: this.config?.username || 'admin',
      passwordHash: this.hashPassword(tempPassword, newSalt),
      passwordSalt: newSalt,
      authEnabled: true,
      mustChangePassword: true,
      tokenSecret: crypto.randomBytes(32).toString('hex'),
      updatedAt: new Date().toISOString(),
    };
    this.lastGeneratedConsolePassword = tempPassword;
    this.saveConfig();
    this.rateLimits.clear();

    console.log('');
    console.log('============================================================');
    console.log('🔐 [SECURITY] ADMINISTRATOR PASSWORD RESET SUCCESSFUL');
    console.log('------------------------------------------------------------');
    console.log(` 👤 Username           : ${this.config.username}`);
    console.log(` 🔑 Temporary Password : ${tempPassword}`);
    console.log('------------------------------------------------------------');
    console.log(' ⚠️  Authentication has been re-enabled.');
    console.log(' ⚠️  You will be required to change this password upon login.');
    console.log(` 💾 Updated credentials file: ${AUTH_DB_PATH}`);
    console.log('============================================================');
    console.log('');

    return {
      username: this.config.username,
      tempPassword,
    };
  }

  public clearRateLimits(): void {
    this.rateLimits.clear();
  }

  public getLastGeneratedConsolePassword(): string | null {
    return this.lastGeneratedConsolePassword;
  }
}

export const authService = new AuthService();
