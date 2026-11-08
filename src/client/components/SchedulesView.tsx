import React, { useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  Edit3,
  Filter,
  Loader2,
  Play,
  Plus,
  Power,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  RemoteInfo,
  ScheduleJob,
  TransferOperation,
} from '../../shared/types';
import {
  FILTER_PRESETS,
  mergeExcludePatterns,
  parseExcludePatterns,
} from '../../shared/filterPresets';
import { api } from '../api';
import { useI18n } from '../i18n';
import { formatDateTime } from '../utils/format';

interface SchedulesViewProps {
  schedules: ScheduleJob[];
  remotes: RemoteInfo[];
  globalExclude: string;
  onRefreshSchedules: () => void;
  onRefreshTasks: () => void;
  onSwitchToTasks: () => void;
  onOpenFilterModal: () => void;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const SchedulesView: React.FC<SchedulesViewProps> = ({
  schedules,
  remotes,
  globalExclude,
  onRefreshSchedules,
  onRefreshTasks,
  onSwitchToTasks,
  onOpenFilterModal,
  onNotify,
}) => {
  const { tr } = useI18n();
  const [showModal, setShowModal] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [cronExpression, setCronExpression] = useState('0 2 * * *');
  const [operation, setOperation] = useState<TransferOperation>('sync');
  const [srcRemote, setSrcRemote] = useState(remotes[0]?.name || '@media');
  const [srcPath, setSrcPath] = useState('Documents');
  const [dstRemote, setDstRemote] = useState(remotes[0]?.name || '@media');
  const [dstPath, setDstPath] = useState('Backups/Documents');
  const [bwlimit, setBwlimit] = useState('');
  const [exclude, setExclude] = useState('');
  const [saving, setSaving] = useState(false);
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  const cronPresets = [
    {
      label: tr('每 15 分钟 (*/15 * * * *)', '每 15 分鐘 (*/15 * * * *)', 'Every 15 mins (*/15 * * * *)'),
      value: '*/15 * * * *',
    },
    {
      label: tr('每 30 分钟 (*/30 * * * *)', '每 30 分鐘 (*/30 * * * *)', 'Every 30 mins (*/30 * * * *)'),
      value: '*/30 * * * *',
    },
    {
      label: tr('每小时整点 (0 * * * *)', '每小時整點 (0 * * * *)', 'Hourly (0 * * * *)'),
      value: '0 * * * *',
    },
    {
      label: tr('每 6 小时 (0 */6 * * *)', '每 6 小時 (0 */6 * * *)', 'Every 6 hours (0 */6 * * *)'),
      value: '0 */6 * * *',
    },
    {
      label: tr('每天凌晨 02:00 (0 2 * * *)', '每天凌晨 02:00 (0 2 * * *)', 'Daily at 02:00 (0 2 * * *)'),
      value: '0 2 * * *',
    },
    {
      label: tr('每天中午 12:00 (0 12 * * *)', '每天中午 12:00 (0 12 * * *)', 'Daily at 12:00 (0 12 * * *)'),
      value: '0 12 * * *',
    },
    {
      label: tr('每周日凌晨 03:00 (0 3 * * 0)', '每週日凌晨 03:00 (0 3 * * 0)', 'Weekly Sun 03:00 (0 3 * * 0)'),
      value: '0 3 * * 0',
    },
  ];

  const openCreateModal = () => {
    setEditingJobId(null);
    setName(tr('每日自动云备份', '每日自動雲端備份', 'Daily Cloud Backup'));
    setCronExpression('0 2 * * *');
    setOperation('copy');
    setSrcRemote('@media');
    setSrcPath('Documents');
    setDstRemote(remotes[1]?.name || '@media');
    setDstPath('Backups/Documents');
    setBwlimit('');
    setExclude('');
    setShowModal(true);
  };

  const openEditModal = (job: ScheduleJob) => {
    setEditingJobId(job.id);
    setName(job.name);
    setCronExpression(job.cronExpression);
    setOperation(job.operation);
    setSrcRemote(job.srcRemote);
    setSrcPath(job.srcPath);
    setDstRemote(job.dstRemote);
    setDstPath(job.dstPath);
    setBwlimit(job.options?.bwlimit || '');
    setExclude(job.options?.exclude || '');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name,
        cronExpression,
        operation,
        srcRemote,
        srcPath,
        dstRemote,
        dstPath,
        options: {
          bwlimit: bwlimit.trim() || undefined,
          exclude: exclude.trim() || undefined,
        },
      };

      if (editingJobId) {
        await api.updateSchedule(editingJobId, payload);
        onNotify(tr('已更新定时同步任务', '已更新排程同步任務', 'Updated schedule'), 'success');
      } else {
        await api.createSchedule(payload);
        onNotify(tr('已创建定时同步任务', '已建立排程同步任務', 'Created schedule'), 'success');
      }

      setShowModal(false);
      onRefreshSchedules();
    } catch (err: any) {
      onNotify(
        err.message || tr('保存定时任务失败', '儲存排程任務失敗', 'Failed to save schedule'),
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnable = async (job: ScheduleJob) => {
    try {
      await api.updateSchedule(job.id, { enabled: !job.enabled });
      onNotify(
        tr(
          `定时任务 "${job.name}" 已${!job.enabled ? '启用' : '暂停'}`,
          `排程任務 "${job.name}" 已${!job.enabled ? '啟用' : '暫停'}`,
          `Schedule "${job.name}" ${!job.enabled ? 'enabled' : 'paused'}`
        ),
        !job.enabled ? 'success' : 'info'
      );
      onRefreshSchedules();
    } catch (err: any) {
      onNotify(err.message || tr('切换状态失败', '切換狀態失敗', 'Failed to toggle'), 'error');
    }
  };

  const handleTriggerNow = async (job: ScheduleJob) => {
    setTriggeringId(job.id);
    try {
      await api.triggerSchedule(job.id);
      onNotify(
        tr(
          `已立即触发 "${job.name}"，可在任务中心查看实时进度`,
          `已立即觸發 "${job.name}"，可在任務中心查看即時進度`,
          `Triggered "${job.name}". View progress in Transfer Center.`
        ),
        'success'
      );
      onRefreshSchedules();
      onRefreshTasks();
    } catch (err: any) {
      onNotify(err.message || tr('触发失败', '觸發失敗', 'Failed to trigger'), 'error');
    } finally {
      setTriggeringId(null);
    }
  };

  const handleDelete = async (job: ScheduleJob) => {
    if (
      !window.confirm(
        tr(
          `确定要删除定时任务 "${job.name}" 吗？`,
          `確定要刪除排程任務 "${job.name}" 嗎？`,
          `Are you sure you want to delete schedule "${job.name}"?`
        )
      )
    )
      return;
    try {
      await api.deleteSchedule(job.id);
      onNotify(tr('已删除定时任务', '已刪除排程任務', 'Schedule deleted'), 'info');
      onRefreshSchedules();
    } catch (err: any) {
      onNotify(err.message || tr('删除失败', '刪除失敗', 'Delete failed'), 'error');
    }
  };

  return (
    <div className="flex flex-col h-full gap-4 overflow-hidden">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/70 border border-slate-800 rounded-xl px-4 py-3 shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-sky-400" />
            <span>
              {tr(
                `Cron 定时同步与备份任务 (${schedules.length})`,
                `Cron 排程同步與備份任務 (${schedules.length})`,
                `Cron Scheduled Sync & Backup Jobs (${schedules.length})`
              )}
            </span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {tr(
              '支持标准 5 段式 Cron 表达式，容器后台自动按计划调用 Rclone 执行增量备份或镜像同步',
              '支援標準 5 段式 Cron 表達式，容器背景自動依計畫呼叫 Rclone 執行增量備份或鏡像同步',
              'Supports standard 5-field Cron expressions for automated background Rclone backups and syncs'
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenFilterModal}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/40 text-sky-300 text-xs font-medium transition-colors"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>
              {tr('全局过滤规则', '全域過濾規則', 'Filter Rules')} (
              {parseExcludePatterns(globalExclude).length})
            </span>
          </button>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors shadow-lg shadow-sky-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>{tr('新建定时任务', '新增排程任務', 'New Schedule')}</span>
          </button>
        </div>
      </div>

      {/* Schedules List */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 bg-slate-900/40 border border-slate-800/60 rounded-xl text-slate-500 gap-3">
            <CalendarClock className="w-10 h-10 stroke-1 text-slate-600" />
            <div className="text-center space-y-1">
              <p className="text-xs text-slate-300">
                {tr(
                  '尚未配置任何定时备份或同步计划',
                  '尚未設定任何排程備份或同步計畫',
                  'No scheduled backup or sync jobs configured yet'
                )}
              </p>
              <p className="text-[11px] text-slate-500">
                {tr(
                  '点击右上角“新建定时任务”设置全自动云端同步',
                  '點擊右上角「新增排程任務」設定全自動雲端同步',
                  'Click "New Schedule" in the top right to automate cloud syncs'
                )}
              </p>
            </div>
          </div>
        ) : (
          schedules.map((job) => (
            <div
              key={job.id}
              className={`bg-slate-900/80 border rounded-xl p-4 transition-all space-y-3 ${
                job.enabled ? 'border-slate-800' : 'border-slate-800/50 opacity-70'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <button
                    onClick={() => handleToggleEnable(job)}
                    title={
                      job.enabled
                        ? tr('点击暂停计划', '點擊暫停計畫', 'Click to disable')
                        : tr('点击启用计划', '點擊啟用計畫', 'Click to enable')
                    }
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                      job.enabled
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    <Power className="w-3 h-3" />
                    <span>
                      {job.enabled
                        ? tr('已启用', '已啟用', 'Enabled')
                        : tr('已暂停', '已暫停', 'Disabled')}
                    </span>
                  </button>

                  <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[10px] font-bold uppercase">
                    {job.operation}
                  </span>

                  <span className="px-2.5 py-0.5 rounded bg-slate-950 border border-slate-800 font-mono text-xs text-amber-300">
                    Cron: {job.cronExpression}
                  </span>

                  <h4 className="text-sm font-semibold text-slate-100">{job.name}</h4>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleTriggerNow(job)}
                    disabled={triggeringId === job.id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 text-xs font-medium"
                  >
                    {triggeringId === job.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                    <span>{tr('立即运行一次', '立即執行一次', 'Run Now')}</span>
                  </button>

                  <button
                    onClick={() => openEditModal(job)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300"
                    title={tr('编辑计划', '編輯計畫', 'Edit Schedule')}
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDelete(job)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400"
                    title={tr('删除计划', '刪除計畫', 'Delete Schedule')}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Source -> Destination */}
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono bg-slate-950/70 border border-slate-800/80 rounded-lg px-3 py-2 text-slate-300">
                <span className="text-sky-400">{job.srcRemote}:</span>
                <span>/{job.srcPath}</span>
                <ArrowRight className="w-3.5 h-3.5 text-slate-500 mx-1 shrink-0" />
                <span className="text-emerald-400">{job.dstRemote}:</span>
                <span>/{job.dstPath}</span>
              </div>

              {/* Schedule Execution Metadata */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 pt-1">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                    {tr('下次计划运行:', '下次排程執行:', 'Next Run:')}{' '}
                    <strong className="text-slate-200">
                      {job.enabled && job.nextRunAt
                        ? formatDateTime(job.nextRunAt)
                        : tr('已暂停', '已暫停', 'Disabled')}
                    </strong>
                  </span>

                  {job.lastRunAt && (
                    <span className="flex items-center gap-1.5">
                      {tr('上次运行:', '上次執行:', 'Last Run:')} {formatDateTime(job.lastRunAt)}
                      {job.lastRunStatus === 'completed' && (
                        <span className="inline-flex items-center gap-0.5 text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {tr('成功', '成功', 'Success')}
                        </span>
                      )}
                      {job.lastRunStatus === 'failed' && (
                        <span className="inline-flex items-center gap-0.5 text-rose-400">
                          <XCircle className="w-3.5 h-3.5" /> {tr('失败', '失敗', 'Failed')}
                        </span>
                      )}
                      {job.lastRunStatus === 'running' && (
                        <span className="inline-flex items-center gap-0.5 text-sky-400">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />{' '}
                          {tr('执行中', '執行中', 'Running')}
                        </span>
                      )}
                    </span>
                  )}
                </div>

                {job.lastTaskId && (
                  <button
                    onClick={onSwitchToTasks}
                    className="text-sky-400 hover:underline text-xs"
                  >
                    {tr('查看任务日志 →', '查看任務日誌 →', 'View Task Logs →')}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create / Edit Schedule Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSave}
            className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-slate-100">
                {editingJobId
                  ? tr('编辑定时同步计划', '編輯排程同步計畫', 'Edit Cron Schedule')
                  : tr('新建 Cron 定时同步计划', '新增 Cron 排程同步計畫', 'New Cron Schedule')}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    {tr('计划任务名称 *', '排程任務名稱 *', 'Schedule Name *')}
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={tr('如: 每日照片库异地备份', '如: 每日照片庫異地備份', 'e.g. Nightly Photos Backup')}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    {tr('同步动作类型 *', '同步動作類型 *', 'Operation *')}
                  </label>
                  <select
                    value={operation}
                    onChange={(e) => setOperation(e.target.value as TransferOperation)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                  >
                    <option value="copy">{tr('COPY (增量复制备份)', 'COPY (增量複製備份)', 'COPY (Incremental Backup)')}</option>
                    <option value="sync">{tr('SYNC (镜像同步)', 'SYNC (鏡像同步)', 'SYNC (Mirror Sync)')}</option>
                    <option value="move">{tr('MOVE (定时归档移动)', 'MOVE (定時歸檔移動)', 'MOVE (Archive & Move)')}</option>
                  </select>
                </div>
              </div>

              {/* Cron Expression */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-amber-400">
                    {tr(
                      'Cron 周期表达式 (分 时 日 月 周)',
                      'Cron 週期表達式 (分 時 日 月 週)',
                      'Cron Expression (min hour day month weekday)'
                    )}
                  </label>
                  <select
                    value={
                      cronPresets.some((p) => p.value === cronExpression) ? cronExpression : ''
                    }
                    onChange={(e) => {
                      if (e.target.value) setCronExpression(e.target.value);
                    }}
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200"
                  >
                    <option value="">
                      {tr('-- 选择常用周期预设 --', '-- 選擇常用週期預設 --', '-- Select Preset --')}
                    </option>
                    {cronPresets.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <input
                  type="text"
                  required
                  value={cronExpression}
                  onChange={(e) => setCronExpression(e.target.value)}
                  placeholder="0 2 * * *"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-slate-100"
                />
              </div>

              {/* Source */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-slate-400 mb-1">
                    {tr('源 Remote', '來源 Remote', 'Source Remote')}
                  </label>
                  <select
                    value={srcRemote}
                    onChange={(e) => setSrcRemote(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100"
                  >
                    {remotes.map((r) => (
                      <option key={r.name} value={r.name}>
                        {r.name === '@media'
                          ? tr('本地 (/media)', '本機 (/media)', 'Local (/media)')
                          : `${r.name}: (${r.type})`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-slate-400 mb-1">
                    {tr('源目录路径', '來源目錄路徑', 'Source Path')}
                  </label>
                  <input
                    type="text"
                    value={srcPath}
                    onChange={(e) => setSrcPath(e.target.value)}
                    placeholder="Documents"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 font-mono text-slate-100"
                  />
                </div>
              </div>

              {/* Destination */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-slate-400 mb-1">
                    {tr('目标 Remote', '目標 Remote', 'Destination Remote')}
                  </label>
                  <select
                    value={dstRemote}
                    onChange={(e) => setDstRemote(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100"
                  >
                    {remotes.map((r) => (
                      <option key={r.name} value={r.name}>
                        {r.name === '@media'
                          ? tr('本地 (/media)', '本機 (/media)', 'Local (/media)')
                          : `${r.name}: (${r.type})`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-slate-400 mb-1">
                    {tr('目标目录路径', '目標目錄路徑', 'Destination Path')}
                  </label>
                  <input
                    type="text"
                    value={dstPath}
                    onChange={(e) => setDstPath(e.target.value)}
                    placeholder="Backups/Documents"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 font-mono text-slate-100"
                  />
                </div>
              </div>

              {/* Extra options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">
                    {tr('任务限速 (--bwlimit，可选)', '任務限速 (--bwlimit，選填)', 'Bandwidth Limit (--bwlimit)')}
                  </label>
                  <input
                    type="text"
                    value={bwlimit}
                    onChange={(e) => setBwlimit(e.target.value)}
                    placeholder="10M"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">
                    {tr('额外排除文件规则 (--exclude，可选)', '額外排除檔案規則 (--exclude，選填)', 'Extra Exclude Pattern (--exclude)')}
                  </label>
                  <input
                    type="text"
                    value={exclude}
                    onChange={(e) => setExclude(e.target.value)}
                    placeholder="@eaDir/**, *.tmp"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 font-mono"
                  />
                </div>
              </div>

              {/* Quick Filter Preset Chips */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="text-slate-400">
                    {tr(
                      `自动生效全局过滤规则 (${parseExcludePatterns(globalExclude).length} 项，默认过滤群晖 @eaDir/#recycle)`,
                      `自動生效全域過濾規則 (${parseExcludePatterns(globalExclude).length} 項，預設過濾群暉 @eaDir/#recycle)`,
                      `Global filter rules (${parseExcludePatterns(globalExclude).length} patterns incl. Synology @eaDir) apply automatically`
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={onOpenFilterModal}
                    className="text-sky-400 hover:underline font-medium"
                  >
                    {tr('配置全局过滤规则 →', '設定全域過濾規則 →', 'Configure Global Rules →')}
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-500">
                    {tr('快捷追加:', '捷徑追加:', 'Quick add:')}
                  </span>
                  {FILTER_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        setExclude((prev) =>
                          mergeExcludePatterns(prev, preset.patterns.join(', '))
                        )
                      }
                      className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] text-slate-300 transition-colors"
                    >
                      + {tr(preset.zhCN.split(' ')[0], preset.zhTW.split(' ')[0], preset.en.split(' ')[0])}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-800 bg-slate-950/60">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300"
              >
                {tr('取消', '取消', 'Cancel')}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{tr('保存定时任务', '儲存排程任務', 'Save Schedule')}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
