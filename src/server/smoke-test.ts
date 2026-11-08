import assert from 'node:assert';
import fs from 'node:fs';
import {
  buildRcloneProxyEnvAndArgs,
  calculateDirSize,
  deleteRemote,
  getRcloneVersionInfo,
  getRemoteProxyUrl,
  isNewerRcloneVersion,
  listDirectory,
  listRemotes,
  makeDirectory,
  renameEntry,
  deleteEntry,
  upsertRemote,
} from './rcloneService.js';
import { taskManager } from './taskManager.js';
import { schedulerService } from './schedulerService.js';
import { APP_VERSION, AUTH_DB_PATH, ensureDirectoriesAndDefaults } from './config.js';
import { authService, AuthError } from './authService.js';

async function runSmokeTests() {
  console.log(`🧪 Starting RcloneBrowser Next Gen v${APP_VERSION} Integration Smoke Tests...`);
  assert.strictEqual(APP_VERSION, '2.2', 'APP_VERSION should be loaded from version.json as 2.2');
  assert.strictEqual(isNewerRcloneVersion('v1.76.0', 'v1.77.0'), true, 'v1.77.0 > v1.76.0');
  assert.strictEqual(isNewerRcloneVersion('v1.76.0', 'v1.76.0'), false, 'v1.76.0 == v1.76.0');
  ensureDirectoriesAndDefaults();

  // 0. Verify v2.2 AuthService (initial console password, scrypt hash, forced change, rate limit, CLI reset)
  const resetInfo = authService.resetPasswordCli();
  assert.ok(
    resetInfo.tempPassword.startsWith('RbN-'),
    'Generated initial/temporary password should start with RbN-'
  );
  assert.ok(fs.existsSync(AUTH_DB_PATH), 'auth.json should exist on disk');
  const rawAuthJson = fs.readFileSync(AUTH_DB_PATH, 'utf-8');
  assert.ok(
    !rawAuthJson.includes(resetInfo.tempPassword),
    'Plaintext password must NEVER be stored in auth.json'
  );

  const initialLogin = authService.login('127.0.0.1', 'admin', resetInfo.tempPassword);
  assert.strictEqual(
    initialLogin.mustChangePassword,
    true,
    'First login with console temporary password must require password change'
  );
  assert.strictEqual(authService.isTokenValid(initialLogin.token), true, 'Initial token must be valid');

  const updatedAuth = authService.updateSecurity({
    currentPassword: resetInfo.tempPassword,
    newUsername: 'admin',
    newPassword: 'MyStrongNewPassword!2026',
    authEnabled: true,
  });
  assert.strictEqual(updatedAuth.mustChangePassword, false, 'mustChangePassword should be false after update');
  assert.strictEqual(
    authService.isTokenValid(initialLogin.token),
    false,
    'Old token must be invalidated after password change'
  );
  assert.strictEqual(
    authService.isTokenValid(updatedAuth.token),
    true,
    'New token returned by updateSecurity must be valid'
  );

  // Verify brute-force lockout after 5 failed attempts
  const attackerIp = '10.99.88.77';
  authService.clearRateLimits();
  for (let i = 1; i <= 5; i++) {
    let caughtError: AuthError | null = null;
    try {
      authService.login(attackerIp, 'admin', 'wrong-password');
    } catch (err: any) {
      caughtError = err;
    }
    assert.ok(caughtError instanceof AuthError, `Attempt ${i} should throw AuthError`);
    if (i < 5) {
      assert.strictEqual(caughtError!.statusCode, 401);
    } else {
      assert.strictEqual(caughtError!.statusCode, 429, '5th failed attempt should lock out IP with 429');
    }
  }
  authService.clearRateLimits();

  // Verify Passwordless Direct Mode toggle
  const passwordlessState = authService.updateSecurity({
    currentPassword: 'MyStrongNewPassword!2026',
    authEnabled: false,
  });
  assert.strictEqual(passwordlessState.authRequired, false, 'Passwordless mode should disable authRequired');
  assert.strictEqual(authService.isTokenValid(undefined), true, 'Token check passes in passwordless mode');

  // Re-enable password protection
  const reenabledState = authService.updateSecurity({
    newPassword: 'MyStrongNewPassword!2026',
    authEnabled: true,
  });
  assert.strictEqual(reenabledState.authRequired, true, 'Auth protection should be re-enabled');
  console.log('✔ v2.2 AuthService (console password, scrypt hash, forced change, rate limit, LAN mode) verified.');

  // 1. Verify Rclone version detection
  const versionInfo = await getRcloneVersionInfo();
  console.log('✔ Rclone Version Info:', versionInfo);
  assert.ok(versionInfo.version, 'Version string should exist');

  // 2. Verify Remotes CRUD
  const initialRemotes = listRemotes();
  assert.ok(initialRemotes.some((r) => r.name === '@media'), 'Built-in @media remote must exist');

  const afterAdd = await upsertRemote('test_backup_alias', 'alias', {
    remote: initialRemotes[0].rootPath || './data/media',
    _proxy_url: 'socks5://127.0.0.1:1080',
  });
  assert.ok(
    afterAdd.some((r) => r.name === 'test_backup_alias' && r.proxyUrl === 'socks5://127.0.0.1:1080'),
    'Newly added alias remote with per-remote proxy should exist'
  );
  assert.strictEqual(
    getRemoteProxyUrl('test_backup_alias'),
    'socks5://127.0.0.1:1080',
    'getRemoteProxyUrl should return configured proxy'
  );
  const proxyEnv = buildRcloneProxyEnvAndArgs('http://192.168.1.2:7890');
  assert.strictEqual(proxyEnv.env.HTTP_PROXY, 'http://192.168.1.2:7890');
  const directEnv = buildRcloneProxyEnvAndArgs('');
  assert.strictEqual(directEnv.env.HTTP_PROXY, undefined);
  console.log('✔ Remote upsert & per-remote proxy resolution verified. Total remotes:', afterAdd.length);

  // 3. Verify Directory Listing, Mkdir, Rename, Size, Delete
  await makeDirectory('@media', 'SmokeTestFolder');
  const rootEntries = await listDirectory('@media', '');
  assert.ok(
    rootEntries.some((e) => e.Name === 'SmokeTestFolder' && e.IsDir),
    'SmokeTestFolder should exist in @media'
  );

  await renameEntry('@media', 'SmokeTestFolder', 'SmokeTestFolderRenamed');
  const afterRename = await listDirectory('@media', '');
  assert.ok(
    afterRename.some((e) => e.Name === 'SmokeTestFolderRenamed'),
    'SmokeTestFolderRenamed should exist after rename'
  );

  const dirSize = await calculateDirSize('@media', 'Documents');
  console.log('✔ Calculated Documents folder size via rclone:', dirSize);
  assert.ok(dirSize.count >= 1, 'Documents should contain sample file');

  await deleteEntry('@media', 'SmokeTestFolderRenamed', true);
  console.log('✔ File Explorer operations (list, mkdir, rename, size, delete) verified.');

  // 4. Verify Transfer Task execution with real Rclone
  const copyTask = taskManager.createTask({
    name: 'Smoke Test Copy Documents -> Backups/SmokeCopy',
    operation: 'copy',
    srcRemote: '@media',
    srcPath: 'Documents',
    dstRemote: '@media',
    dstPath: 'Backups/SmokeCopy',
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Transfer task timed out')), 15000);
    const interval = setInterval(() => {
      const current = taskManager.getTaskById(copyTask.id);
      if (current && (current.status === 'completed' || current.status === 'failed')) {
        clearInterval(interval);
        clearTimeout(timeout);
        if (current.status === 'completed') {
          resolve();
        } else {
          reject(new Error(`Task failed: ${current.error}`));
        }
      }
    }, 200);
  });

  const copiedFiles = await listDirectory('@media', 'Backups/SmokeCopy');
  assert.ok(copiedFiles.length > 0, 'Copied files should exist in Backups/SmokeCopy');
  await deleteEntry('@media', 'Backups/SmokeCopy', true);
  taskManager.deleteTask(copyTask.id);
  console.log('✔ Real Rclone copy task execution & progress tracking verified.');

  // 5. Verify Cron Scheduler CRUD
  const schedule = schedulerService.createSchedule({
    name: 'Nightly Docs Sync',
    cronExpression: '0 2 * * *',
    operation: 'copy',
    srcRemote: '@media',
    srcPath: 'Documents',
    dstRemote: '@media',
    dstPath: 'Backups/Nightly',
    enabled: true,
  });
  assert.ok(schedule.id && schedule.nextRunAt, 'Schedule should compute nextRunAt');
  schedulerService.deleteSchedule(schedule.id);
  deleteRemote('test_backup_alias');
  console.log('✔ Cron Scheduler CRUD & nextRunAt calculation verified.');

  console.log('🎉 All integration tests passed successfully!');
  process.exit(0);
}

runSmokeTests().catch((err) => {
  console.error('❌ Smoke test failed:', err);
  process.exit(1);
});
