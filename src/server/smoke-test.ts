import assert from 'node:assert';
import {
  buildRcloneProxyEnvAndArgs,
  calculateDirSize,
  deleteRemote,
  getRcloneVersionInfo,
  getRemoteProxyUrl,
  listDirectory,
  listRemotes,
  makeDirectory,
  renameEntry,
  deleteEntry,
  upsertRemote,
} from './rcloneService.js';
import { taskManager } from './taskManager.js';
import { schedulerService } from './schedulerService.js';
import { ensureDirectoriesAndDefaults } from './config.js';

async function runSmokeTests() {
  console.log('🧪 Starting RcloneBrowser Next Gen Integration Smoke Tests...');
  ensureDirectoriesAndDefaults();

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
