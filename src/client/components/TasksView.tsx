import React, { useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Gauge,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Square,
  Terminal,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  RemoteInfo,
  TransferOperation,
  TransferTask,
} from '../../shared/types';
import { api } from '../api';
import { formatBytes, formatDateTime, formatEta, formatSpeed } from '../utils/format';

interface TasksViewProps {
  tasks: TransferTask[];
  remotes: RemoteInfo[];
  globalBwLimit: string;
  totalSpeed: number;
  onRefreshTasks: () => void;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const BW_OPTIONS = [
  { label: '不限速 (Unlimited)', value: 'off' },
  { label: '1 MB/s', value: '1M' },
  { label: '2 MB/s', value: '2M' },
  { label: '5 MB/s', value: '5M' },
  { label: '10 MB/s', value: '10M' },
  { label: '20 MB/s', value: '20M' },
  { label: '50 MB/s', value: '50M' },
  { label: '100 MB/s', value: '100M' },
];

export const TasksView: React.FC<TasksViewProps> = ({
  tasks,
  remotes,
  globalBwLimit,
  totalSpeed,
  onRefreshTasks,
  onNotify,
}) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed' | 'failed'>('all');
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [showNewModal, setShowNewModal] = useState(false);

  // New task form state
  const [name, setName] = useState('');
  const [operation, setOperation] = useState<TransferOperation>('copy');
  const [srcRemote, setSrcRemote] = useState(remotes[0]?.name || '@media');
  const [srcPath, setSrcPath] = useState('');
  const [dstRemote, setDstRemote] = useState(remotes[1]?.name || remotes[0]?.name || '@media');
  const [dstPath, setDstPath] = useState('Backups');
  const [dryRun, setDryRun] = useState(false);
  const [bwlimit, setBwlimit] = useState('');
  const [transfers, setTransfers] = useState(4);
  const [exclude, setExclude] = useState('');
  const [createEmptySrcDirs, setCreateEmptySrcDirs] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const toggleLogs = (id: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBwLimitChange = async (val: string) => {
    try {
      await api.setGlobalBwLimit(val);
      onNotify(`全局带宽限制已更新为: ${val === 'off' ? '不限速' : val}`, 'success');
      onRefreshTasks();
    } catch (err: any) {
      onNotify(err.message || '设置限速失败', 'error');
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createTask({
        name: name.trim() || undefined,
        operation,
        srcRemote,
        srcPath,
        dstRemote,
        dstPath,
        options: {
          dryRun,
          bwlimit: bwlimit.trim() || undefined,
          transfers,
          exclude: exclude.trim() || undefined,
          createEmptySrcDirs,
        },
      });
      setShowNewModal(false);
      setName('');
      onNotify('任务已加入队列并开始执行', 'success');
      onRefreshTasks();
    } catch (err: any) {
      onNotify(err.message || '创建任务失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await api.cancelTask(id);
      onNotify('已取消该任务', 'info');
      onRefreshTasks();
    } catch (err: any) {
      onNotify(err.message || '取消失败', 'error');
    }
  };

  const handleRetry = async (id: string) => {
    try {
      await api.retryTask(id);
      onNotify('已重新提交任务', 'success');
      onRefreshTasks();
    } catch (err: any) {
      onNotify(err.message || '重试失败', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteTask(id);
      onRefreshTasks();
    } catch (err: any) {
      onNotify(err.message || '删除失败', 'error');
    }
  };

  const handleClearCompleted = async () => {
    try {
      await api.clearCompletedTasks();
      onNotify('已清理历史完成的任务记录', 'info');
      onRefreshTasks();
    } catch (err: any) {
      onNotify(err.message || '清理失败', 'error');
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'active') return t.status === 'running' || t.status === 'queued';
    if (filter === 'completed') return t.status === 'completed';
    if (filter === 'failed') return t.status === 'failed' || t.status === 'cancelled';
    return true;
  });

  const runningCount = tasks.filter((t) => t.status === 'running' || t.status === 'queued').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const failedCount = tasks.filter((t) => t.status === 'failed' || t.status === 'cancelled').length;

  return (
    <div className="flex flex-col h-full gap-4 overflow-hidden">
      {/* Top KPI Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">运行与排队中任务</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">{runningCount}</p>
          </div>
          <div className="p-3 rounded-xl bg-sky-500/10 text-sky-400">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">实时总传输速度</p>
            <p className="text-2xl font-bold text-emerald-400 font-mono mt-1">
              {formatSpeed(totalSpeed)}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400">
            <Gauge className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">已完成 / 失败任务</p>
            <p className="text-2xl font-bold text-slate-100 mt-1">
              <span className="text-emerald-400">{completedCount}</span>
              <span className="text-slate-600 mx-1.5">/</span>
              <span className="text-rose-400">{failedCount}</span>
            </p>
          </div>
          <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">默认全局带宽限速 (--bwlimit)</span>
          </div>
          <select
            value={globalBwLimit}
            onChange={(e) => handleBwLimitChange(e.target.value)}
            className="mt-2 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
          >
            {BW_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Filter & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/70 border border-slate-800 rounded-xl px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-1">
          {[
            { id: 'all', label: `全部 (${tasks.length})` },
            { id: 'active', label: `进行中 (${runningCount})` },
            { id: 'completed', label: `已完成 (${completedCount})` },
            { id: 'failed', label: `异常/取消 (${failedCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === tab.id
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {(completedCount > 0 || failedCount > 0) && (
            <button
              onClick={handleClearCompleted}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>清理已结束记录</span>
            </button>
          )}
          <button
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors shadow-lg shadow-sky-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>新建传输 / 同步任务</span>
          </button>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 bg-slate-900/40 border border-slate-800/60 rounded-xl text-slate-500 gap-2">
            <Activity className="w-8 h-8 stroke-1 text-slate-600" />
            <p className="text-xs">暂无符合条件的传输或同步任务</p>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const isLogsOpen = expandedLogs.has(task.id);
            const isRunning = task.status === 'running' || task.status === 'queued';

            return (
              <div
                key={task.id}
                className="bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-xl p-4 transition-all space-y-3"
              >
                {/* Header Row */}
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {/* Status Icon */}
                    {task.status === 'running' && (
                      <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
                    )}
                    {task.status === 'queued' && (
                      <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    {task.status === 'completed' && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}
                    {task.status === 'failed' && (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    {task.status === 'cancelled' && (
                      <XCircle className="w-4 h-4 text-slate-400 shrink-0" />
                    )}

                    {/* Operation Badge */}
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        task.operation === 'sync'
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : task.operation === 'move'
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                            : 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                      }`}
                    >
                      {task.operation}
                    </span>

                    {task.options.dryRun && (
                      <span className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[10px] font-semibold">
                        DRY-RUN (模拟预演)
                      </span>
                    )}

                    {task.triggeredBy === 'schedule' && (
                      <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-[10px]">
                        定时任务
                      </span>
                    )}

                    <h4 className="text-sm font-semibold text-slate-100">{task.name}</h4>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => toggleLogs(task.id)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                        isLogsOpen
                          ? 'bg-slate-800 border-sky-500/50 text-sky-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>日志 ({task.logs.length})</span>
                    </button>

                    {isRunning ? (
                      <button
                        onClick={() => handleCancel(task.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-medium"
                      >
                        <Square className="w-3 h-3 fill-current" />
                        <span>取消</span>
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => handleRetry(task.id)}
                          title="重新执行此任务"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>重试</span>
                        </button>
                        <button
                          onClick={() => handleDelete(task.id)}
                          title="删除记录"
                          className="p-1 rounded-lg bg-slate-950 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-800"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Source -> Destination Path Info */}
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono bg-slate-950/70 border border-slate-800/80 rounded-lg px-3 py-2 text-slate-300">
                  <span className="text-sky-400">{task.srcRemote}:</span>
                  <span>/{task.srcPath}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 mx-1 shrink-0" />
                  <span className="text-emerald-400">{task.dstRemote}:</span>
                  <span>/{task.dstPath}</span>
                </div>

                {/* Progress Bar & Metrics */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3 text-slate-300">
                      <span className="font-semibold text-sky-400">{task.progress}%</span>
                      <span>
                        {formatBytes(task.transferredBytes)}
                        {task.totalBytes > 0 ? ` / ${formatBytes(task.totalBytes)}` : ''}
                      </span>
                      {task.totalFiles > 0 && (
                        <span className="text-slate-400">
                          ({task.filesTransferred}/{task.totalFiles} 文件)
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 font-mono text-xs">
                      {task.status === 'running' && (
                        <>
                          <span className="text-emerald-400">{formatSpeed(task.speed)}</span>
                          <span className="text-slate-400">ETA: {formatEta(task.eta)}</span>
                        </>
                      )}
                      {task.completedAt && (
                        <span className="text-slate-500 text-[11px]">
                          结束于 {formatDateTime(task.completedAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className={`h-full transition-all duration-300 ${
                        task.status === 'completed'
                          ? 'bg-emerald-500'
                          : task.status === 'failed'
                            ? 'bg-rose-500'
                            : task.status === 'cancelled'
                              ? 'bg-slate-600'
                              : 'bg-gradient-to-r from-sky-500 to-indigo-500'
                      }`}
                      style={{ width: `${Math.max(2, task.progress)}%` }}
                    />
                  </div>
                </div>

                {/* Active Transferring Sub-files */}
                {task.activeFiles && task.activeFiles.length > 0 && (
                  <div className="bg-slate-950/50 border border-slate-800/60 rounded-lg p-2.5 space-y-1.5">
                    <p className="text-[11px] font-medium text-slate-400">
                      正在传输文件 ({task.activeFiles.length}):
                    </p>
                    {task.activeFiles.slice(0, 4).map((af, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px] gap-2">
                        <span className="text-slate-300 truncate font-mono">{af.name}</span>
                        <span className="text-slate-400 shrink-0 font-mono">
                          {af.percentage}% ({formatSpeed(af.speed)})
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Error Alert */}
                {task.error && (
                  <div className="text-xs text-rose-300 bg-rose-950/30 border border-rose-800/50 rounded-lg px-3 py-2 font-mono">
                    错误详情: {task.error}
                  </div>
                )}

                {/* Terminal Logs Drawer */}
                {isLogsOpen && (
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 max-h-60 overflow-y-auto font-mono text-[11px] text-slate-300 space-y-1 select-text">
                    {task.logs.length === 0 ? (
                      <p className="text-slate-500">暂无日志输出...</p>
                    ) : (
                      task.logs.map((line, idx) => (
                        <div
                          key={idx}
                          className={
                            line.includes('[ERROR]') || line.includes('[FAILED]')
                              ? 'text-rose-400'
                              : line.includes('[SUCCESS]')
                                ? 'text-emerald-400'
                                : line.includes('[CMD]')
                                  ? 'text-sky-400'
                                  : 'text-slate-300'
                          }
                        >
                          {line}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Create New Task Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <form
            onSubmit={handleCreateTask}
            className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-slate-100">新建 Rclone 传输 / 同步任务</h3>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">操作类型 (Operation)</label>
                  <select
                    value={operation}
                    onChange={(e) => setOperation(e.target.value as TransferOperation)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                  >
                    <option value="copy">COPY (增量复制，不删目标文件)</option>
                    <option value="sync">SYNC (镜像同步，保持目标与源一致)</option>
                    <option value="move">MOVE (移动文件，完成后清理源文件)</option>
                    <option value="check">CHECK (校验源和目标文件哈希/大小)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">任务名称 (可选)</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="留空自动生成描述名称"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                  />
                </div>
              </div>

              {/* Source */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
                <p className="font-semibold text-sky-400">源端 (Source)</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-slate-400 mb-1">源 Remote</label>
                    <select
                      value={srcRemote}
                      onChange={(e) => setSrcRemote(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100"
                    >
                      {remotes.map((r) => (
                        <option key={r.name} value={r.name}>
                          {r.name === '@media' ? '本地 (/media)' : `${r.name}: (${r.type})`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-slate-400 mb-1">源路径 (子目录或文件路径)</label>
                    <input
                      type="text"
                      value={srcPath}
                      onChange={(e) => setSrcPath(e.target.value)}
                      placeholder="例如: Documents 或 bucket/folder (留空代表根目录)"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* Destination */}
              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
                <p className="font-semibold text-emerald-400">目标端 (Destination)</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block text-slate-400 mb-1">目标 Remote</label>
                    <select
                      value={dstRemote}
                      onChange={(e) => setDstRemote(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-slate-100"
                    >
                      {remotes.map((r) => (
                        <option key={r.name} value={r.name}>
                          {r.name === '@media' ? '本地 (/media)' : `${r.name}: (${r.type})`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-slate-400 mb-1">目标路径</label>
                    <input
                      type="text"
                      value={dstPath}
                      onChange={(e) => setDstPath(e.target.value)}
                      placeholder="例如: Backups/2026"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono text-slate-100"
                    />
                  </div>
                </div>
              </div>

              {/* Advanced Options */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">并发传输数 (--transfers)</label>
                  <input
                    type="number"
                    min={1}
                    max={32}
                    value={transfers}
                    onChange={(e) => setTransfers(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">单任务限速 (--bwlimit)</label>
                  <input
                    type="text"
                    value={bwlimit}
                    onChange={(e) => setBwlimit(e.target.value)}
                    placeholder="如 10M (留空沿用全局)"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">排除规则 (--exclude)</label>
                  <input
                    type="text"
                    value={exclude}
                    onChange={(e) => setExclude(e.target.value)}
                    placeholder="*.tmp, .DS_Store"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 pt-1">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dryRun}
                    onChange={(e) => setDryRun(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-sky-500"
                  />
                  <span className="text-slate-300">
                    启用模拟测试 (--dry-run，仅输出日志不实际改动文件)
                  </span>
                </label>

                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createEmptySrcDirs}
                    onChange={(e) => setCreateEmptySrcDirs(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-sky-500"
                  />
                  <span className="text-slate-300">同步空目录结构 (--create-empty-src-dirs)</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-800 bg-slate-950/60">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                <span>立即启动任务</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
