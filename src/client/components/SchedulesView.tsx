import React, { useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  Edit3,
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
import { api } from '../api';
import { formatDateTime } from '../utils/format';

interface SchedulesViewProps {
  schedules: ScheduleJob[];
  remotes: RemoteInfo[];
  onRefreshSchedules: () => void;
  onRefreshTasks: () => void;
  onSwitchToTasks: () => void;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const CRON_PRESETS = [
  { label: '每 15 分钟 (*/15 * * * *)', value: '*/15 * * * *' },
  { label: '每 30 分钟 (*/30 * * * *)', value: '*/30 * * * *' },
  { label: '每小时整点 (0 * * * *)', value: '0 * * * *' },
  { label: '每 6 小时 (0 */6 * * *)', value: '0 */6 * * *' },
  { label: '每天凌晨 02:00 (0 2 * * *)', value: '0 2 * * *' },
  { label: '每天中午 12:00 (0 12 * * *)', value: '0 12 * * *' },
  { label: '每周日凌晨 03:00 (0 3 * * 0)', value: '0 3 * * 0' },
];

export const SchedulesView: React.FC<SchedulesViewProps> = ({
  schedules,
  remotes,
  onRefreshSchedules,
  onRefreshTasks,
  onSwitchToTasks,
  onNotify,
}) => {
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

  const openCreateModal = () => {
    setEditingJobId(null);
    setName('每日自动云备份');
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
        onNotify('已更新定时同步任务', 'success');
      } else {
        await api.createSchedule(payload);
        onNotify('已创建定时同步任务', 'success');
      }

      setShowModal(false);
      onRefreshSchedules();
    } catch (err: any) {
      onNotify(err.message || '保存定时任务失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnable = async (job: ScheduleJob) => {
    try {
      await api.updateSchedule(job.id, { enabled: !job.enabled });
      onNotify(
        `定时任务 "${job.name}" 已${!job.enabled ? '启用' : '暂停'}`,
        !job.enabled ? 'success' : 'info'
      );
      onRefreshSchedules();
    } catch (err: any) {
      onNotify(err.message || '切换状态失败', 'error');
    }
  };

  const handleTriggerNow = async (job: ScheduleJob) => {
    setTriggeringId(job.id);
    try {
      await api.triggerSchedule(job.id);
      onNotify(`已立即触发 "${job.name}"，可在任务中心查看实时进度`, 'success');
      onRefreshSchedules();
      onRefreshTasks();
    } catch (err: any) {
      onNotify(err.message || '触发失败', 'error');
    } finally {
      setTriggeringId(null);
    }
  };

  const handleDelete = async (job: ScheduleJob) => {
    if (!window.confirm(`确定要删除定时任务 "${job.name}" 吗？`)) return;
    try {
      await api.deleteSchedule(job.id);
      onNotify('已删除定时任务', 'info');
      onRefreshSchedules();
    } catch (err: any) {
      onNotify(err.message || '删除失败', 'error');
    }
  };

  return (
    <div className="flex flex-col h-full gap-4 overflow-hidden">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/70 border border-slate-800 rounded-xl px-4 py-3 shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-sky-400" />
            <span>Cron 定时同步与备份任务 ({schedules.length})</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            支持标准 5 段式 Cron 表达式，容器后台自动按计划调用 Rclone 执行增量备份或镜像同步
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors shadow-lg shadow-sky-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>新建定时任务</span>
        </button>
      </div>

      {/* Schedules List */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {schedules.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 bg-slate-900/40 border border-slate-800/60 rounded-xl text-slate-500 gap-3">
            <CalendarClock className="w-10 h-10 stroke-1 text-slate-600" />
            <div className="text-center space-y-1">
              <p className="text-xs text-slate-300">尚未配置任何定时备份或同步计划</p>
              <p className="text-[11px] text-slate-500">
                点击右上角“新建定时任务”设置全自动云端同步
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
                    title={job.enabled ? '点击暂停计划' : '点击启用计划'}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                      job.enabled
                        ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    <Power className="w-3 h-3" />
                    <span>{job.enabled ? '已启用' : '已暂停'}</span>
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
                    <span>立即运行一次</span>
                  </button>

                  <button
                    onClick={() => openEditModal(job)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300"
                    title="编辑计划"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDelete(job)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400"
                    title="删除计划"
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
                    下次计划运行:{' '}
                    <strong className="text-slate-200">
                      {job.enabled && job.nextRunAt ? formatDateTime(job.nextRunAt) : '已暂停'}
                    </strong>
                  </span>

                  {job.lastRunAt && (
                    <span className="flex items-center gap-1.5">
                      上次运行: {formatDateTime(job.lastRunAt)}
                      {job.lastRunStatus === 'completed' && (
                        <span className="inline-flex items-center gap-0.5 text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> 成功
                        </span>
                      )}
                      {job.lastRunStatus === 'failed' && (
                        <span className="inline-flex items-center gap-0.5 text-rose-400">
                          <XCircle className="w-3.5 h-3.5" /> 失败
                        </span>
                      )}
                      {job.lastRunStatus === 'running' && (
                        <span className="inline-flex items-center gap-0.5 text-sky-400">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> 执行中
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
                    查看任务日志 →
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
                {editingJobId ? '编辑定时同步计划' : '新建 Cron 定时同步计划'}
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
                  <label className="block text-slate-300 font-medium mb-1">计划任务名称 *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="如: 每日照片库异地备份"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">同步动作类型 *</label>
                  <select
                    value={operation}
                    onChange={(e) => setOperation(e.target.value as TransferOperation)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                  >
                    <option value="copy">COPY (增量复制备份)</option>
                    <option value="sync">SYNC (镜像同步)</option>
                    <option value="move">MOVE (定时归档移动)</option>
                  </select>
                </div>
              </div>

              {/* Cron Expression */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-amber-400">Cron 周期表达式 (分 时 日 月 周)</label>
                  <select
                    value={
                      CRON_PRESETS.some((p) => p.value === cronExpression) ? cronExpression : ''
                    }
                    onChange={(e) => {
                      if (e.target.value) setCronExpression(e.target.value);
                    }}
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200"
                  >
                    <option value="">-- 选择常用周期预设 --</option>
                    {CRON_PRESETS.map((p) => (
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
                  <label className="block text-slate-400 mb-1">源 Remote</label>
                  <select
                    value={srcRemote}
                    onChange={(e) => setSrcRemote(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100"
                  >
                    {remotes.map((r) => (
                      <option key={r.name} value={r.name}>
                        {r.name === '@media' ? '本地 (/media)' : `${r.name}: (${r.type})`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-slate-400 mb-1">源目录路径</label>
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
                  <label className="block text-slate-400 mb-1">目标 Remote</label>
                  <select
                    value={dstRemote}
                    onChange={(e) => setDstRemote(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100"
                  >
                    {remotes.map((r) => (
                      <option key={r.name} value={r.name}>
                        {r.name === '@media' ? '本地 (/media)' : `${r.name}: (${r.type})`}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-slate-400 mb-1">目标目录路径</label>
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
                  <label className="block text-slate-400 mb-1">任务限速 (--bwlimit，可选)</label>
                  <input
                    type="text"
                    value={bwlimit}
                    onChange={(e) => setBwlimit(e.target.value)}
                    placeholder="例如: 10M"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">排除文件规则 (--exclude，可选)</label>
                  <input
                    type="text"
                    value={exclude}
                    onChange={(e) => setExclude(e.target.value)}
                    placeholder="*.tmp, node_modules/**"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-800 bg-slate-950/60">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white disabled:opacity-50"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>保存定时任务</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
