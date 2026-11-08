import React, { useEffect, useRef, useState } from 'react';
import {
  Cloud,
  Code2,
  Download,
  Edit3,
  FolderOpen,
  Globe,
  HardDrive,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import {
  RemoteConfigParams,
  RemoteInfo,
  RemoteProviderTemplate,
  StorageQuota,
} from '../../shared/types';
import { api } from '../api';
import { formatBytes } from '../utils/format';

interface RemotesViewProps {
  remotes: RemoteInfo[];
  templates: RemoteProviderTemplate[];
  onRefreshRemotes: () => void;
  onOpenRemoteInExplorer: (remoteName: string) => void;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const RemotesView: React.FC<RemotesViewProps> = ({
  remotes,
  templates,
  onRefreshRemotes,
  onOpenRemoteInExplorer,
  onNotify,
}) => {
  const [subTab, setSubTab] = useState<'cards' | 'raw'>('cards');
  const [quotas, setQuotas] = useState<Record<string, StorageQuota>>({});
  const [loadingQuota, setLoadingQuota] = useState<string | null>(null);

  // Raw config editor state
  const [rawPath, setRawPath] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [rawLoading, setRawLoading] = useState(false);
  const [rawSaving, setRawSaving] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  // Wizard Modal state
  const [showWizard, setShowWizard] = useState(false);
  const [editingMode, setEditingMode] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('s3');
  const [remoteName, setRemoteName] = useState('');
  const [formParams, setFormParams] = useState<RemoteConfigParams>({});
  const [proxyMode, setProxyMode] = useState<'direct' | 'http' | 'socks5'>('direct');
  const [proxyUrlInput, setProxyUrlInput] = useState<string>('');
  const [customKV, setCustomKV] = useState<{ key: string; value: string }[]>([]);
  const [obscurePasswords, setObscurePasswords] = useState(true);
  const [savingRemote, setSavingRemote] = useState(false);

  const loadRawConf = async () => {
    setRawLoading(true);
    try {
      const res = await api.getRawConfig();
      setRawPath(res.path);
      setRawContent(res.content);
    } catch (err: any) {
      onNotify(err.message || '读取配置文件失败', 'error');
    } finally {
      setRawLoading(false);
    }
  };

  useEffect(() => {
    if (subTab === 'raw') {
      loadRawConf();
    }
  }, [subTab]);

  const handleCheckQuota = async (name: string) => {
    setLoadingQuota(name);
    try {
      const q = await api.getRemoteQuota(name);
      setQuotas((prev) => ({ ...prev, [name]: q }));
      if (q.supported) {
        onNotify(`已获取 "${name}" 存储空间信息`, 'success');
      } else {
        onNotify(`"${name}" 后端协议暂不支持 rclone about 配额查询`, 'info');
      }
    } catch (err: any) {
      onNotify(err.message || '连接测试失败', 'error');
    } finally {
      setLoadingQuota(null);
    }
  };

  const openCreateWizard = (defaultType = 's3') => {
    const tpl = templates.find((t) => t.type === defaultType) || templates[0];
    const defaults: RemoteConfigParams = {};
    if (tpl) {
      for (const f of tpl.fields) {
        if (f.defaultValue !== undefined) {
          defaults[f.key] = f.defaultValue;
        }
      }
    }
    setEditingMode(false);
    setSelectedType(defaultType);
    setRemoteName('');
    setFormParams(defaults);
    setProxyMode('direct');
    setProxyUrlInput('');
    setCustomKV([]);
    setObscurePasswords(true);
    setShowWizard(true);
  };

  const openEditWizard = (remote: RemoteInfo) => {
    const tpl = templates.find((t) => t.type === remote.type);
    const knownKeys = new Set(tpl?.fields.map((f) => f.key) || []);
    knownKeys.add('type');
    knownKeys.add('_proxy_url');
    knownKeys.add('proxy_url');

    const baseParams: RemoteConfigParams = {};
    const extras: { key: string; value: string }[] = [];

    for (const [k, v] of Object.entries(remote.params)) {
      if (k === 'type' || k === '_proxy_url' || k === 'proxy_url') continue;
      if (knownKeys.has(k)) {
        baseParams[k] = v;
      } else {
        extras.push({ key: k, value: v });
      }
    }

    const existingProxy = (remote.proxyUrl || remote.params._proxy_url || remote.params.proxy_url || '').trim();
    if (!existingProxy) {
      setProxyMode('direct');
      setProxyUrlInput('');
    } else if (existingProxy.startsWith('socks')) {
      setProxyMode('socks5');
      setProxyUrlInput(existingProxy);
    } else {
      setProxyMode('http');
      setProxyUrlInput(existingProxy);
    }

    setEditingMode(true);
    setSelectedType(remote.type);
    setRemoteName(remote.name);
    setFormParams(baseParams);
    setCustomKV(extras);
    setObscurePasswords(false);
    setShowWizard(true);
  };

  const handleSelectTemplateType = (type: string) => {
    setSelectedType(type);
    const tpl = templates.find((t) => t.type === type);
    const defaults: RemoteConfigParams = {};
    if (tpl) {
      for (const f of tpl.fields) {
        if (f.defaultValue !== undefined) {
          defaults[f.key] = f.defaultValue;
        }
      }
    }
    setFormParams(defaults);
  };

  const handleProxyModeChange = (mode: 'direct' | 'http' | 'socks5') => {
    setProxyMode(mode);
    if (mode === 'direct') {
      setProxyUrlInput('');
    } else if (mode === 'http') {
      if (!proxyUrlInput || proxyUrlInput.startsWith('socks')) {
        setProxyUrlInput('http://192.168.1.2:7890');
      }
    } else if (mode === 'socks5') {
      if (!proxyUrlInput || proxyUrlInput.startsWith('http')) {
        setProxyUrlInput('socks5://192.168.1.2:1080');
      }
    }
  };

  const handleSaveRemote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remoteName.trim()) {
      onNotify('请输入 Remote 名称', 'error');
      return;
    }

    const mergedParams: RemoteConfigParams = { ...formParams };
    for (const item of customKV) {
      if (item.key.trim()) {
        mergedParams[item.key.trim()] = item.value.trim();
      }
    }

    if (proxyMode !== 'direct' && proxyUrlInput.trim()) {
      mergedParams._proxy_url = proxyUrlInput.trim();
    } else {
      mergedParams._proxy_url = '';
    }

    setSavingRemote(true);
    try {
      await api.upsertRemote({
        name: remoteName.trim(),
        type: selectedType,
        params: mergedParams,
        obscurePasswords,
      });
      setShowWizard(false);
      onNotify(`已保存 Remote 配置: ${remoteName}`, 'success');
      onRefreshRemotes();
    } catch (err: any) {
      onNotify(err.message || '保存 Remote 失败', 'error');
    } finally {
      setSavingRemote(false);
    }
  };

  const handleDeleteRemote = async (name: string) => {
    if (!window.confirm(`确定要从 rclone.conf 中删除 Remote "${name}" 吗？`)) return;
    try {
      await api.deleteRemote(name);
      onNotify(`已删除 Remote: ${name}`, 'info');
      onRefreshRemotes();
    } catch (err: any) {
      onNotify(err.message || '删除失败', 'error');
    }
  };

  const handleSaveRawConfig = async () => {
    setRawSaving(true);
    try {
      await api.saveRawConfig(rawContent);
      onNotify('rclone.conf 配置文件已保存并生效', 'success');
      onRefreshRemotes();
    } catch (err: any) {
      onNotify(err.message || '保存配置文件失败', 'error');
    } finally {
      setRawSaving(false);
    }
  };

  const handleImportConfFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setRawContent(reader.result);
        onNotify(`已导入 "${file.name}"，请点击“保存配置”使其生效`, 'info');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportConfFile = () => {
    const blob = new Blob([rawContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rclone.conf';
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeTemplate = templates.find((t) => t.type === selectedType);

  return (
    <div className="flex flex-col h-full gap-4 overflow-hidden">
      {/* Top Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/70 border border-slate-800 rounded-xl px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSubTab('cards')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              subTab === 'cards'
                ? 'bg-sky-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>已配置存储源 ({remotes.length})</span>
          </button>

          <button
            onClick={() => setSubTab('raw')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              subTab === 'raw'
                ? 'bg-sky-600 text-white'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>rclone.conf 源文件编辑与导入</span>
          </button>
        </div>

        {subTab === 'cards' && (
          <button
            onClick={() => openCreateWizard('drive')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors shadow-lg shadow-sky-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>新增 Remote 存储源</span>
          </button>
        )}
      </div>

      {/* Main Content */}
      {subTab === 'cards' ? (
        <div className="flex-1 overflow-y-auto pr-1 space-y-5">
          {/* Remote Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {remotes.map((r) => {
              const q = quotas[r.name];
              const isBuiltin = r.name.startsWith('@');
              const proxyVal = r.proxyUrl || r.params._proxy_url || r.params.proxy_url;

              return (
                <div
                  key={r.name}
                  className="bg-slate-900/80 border border-slate-800 hover:border-slate-700 rounded-xl p-4 flex flex-col justify-between gap-4 transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`p-2.5 rounded-xl shrink-0 ${
                            isBuiltin
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : r.type === 'crypt'
                                ? 'bg-purple-500/15 text-purple-400'
                                : 'bg-sky-500/15 text-sky-400'
                          }`}
                        >
                          {isBuiltin ? (
                            <HardDrive className="w-5 h-5" />
                          ) : r.type === 'crypt' ? (
                            <Lock className="w-5 h-5" />
                          ) : (
                            <Cloud className="w-5 h-5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-slate-100 truncate">
                              {r.name === '@media'
                                ? '本地数据卷 (/media)'
                                : isBuiltin
                                  ? `本地挂载点: ${r.name.slice(1)}`
                                  : `${r.name}:`}
                            </h4>
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-sky-300 font-mono text-[10px] uppercase">
                              {r.type}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5 truncate">
                            {isBuiltin
                              ? `容器挂载路径: ${r.rootPath || '/media'}`
                              : r.params.endpoint ||
                                r.params.url ||
                                r.params.host ||
                                r.params.remote ||
                                r.params.provider ||
                                '标准 Rclone 存储节点'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Per-Remote Proxy Badge */}
                    {!isBuiltin && (
                      <div
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${
                          proxyVal
                            ? 'bg-indigo-950/40 border-indigo-500/40 text-indigo-200'
                            : 'bg-slate-950/60 border-slate-800/80 text-slate-400'
                        }`}
                      >
                        {proxyVal ? (
                          <>
                            <Globe className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <span className="font-mono truncate" title={proxyVal}>
                              独立代理: {proxyVal}
                            </span>
                          </>
                        ) : (
                          <>
                            <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>网络策略: 直连 (无代理)</span>
                          </>
                        )}
                      </div>
                    )}

                    {/* Key parameters summary */}
                    <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 space-y-1 font-mono text-[11px]">
                      {Object.entries(r.params)
                        .filter(([k]) => k !== 'type' && k !== '_proxy_url' && k !== 'proxy_url')
                        .slice(0, 4)
                        .map(([k, v]) => {
                          const isSecret =
                            k.includes('secret') ||
                            k.includes('pass') ||
                            k.includes('token');
                          return (
                            <div key={k} className="flex items-center justify-between gap-2">
                              <span className="text-slate-500">{k}:</span>
                              <span className="text-slate-300 truncate max-w-[180px]">
                                {isSecret ? '••••••••••••' : v}
                              </span>
                            </div>
                          );
                        })}
                      {Object.keys(r.params).filter(
                        (k) => k !== 'type' && k !== '_proxy_url' && k !== 'proxy_url'
                      ).length === 0 && <div className="text-slate-500">默认参数配置</div>}
                    </div>

                    {/* Quota Display if loaded */}
                    {q && q.supported && (
                      <div className="bg-emerald-950/20 border border-emerald-800/40 rounded-lg px-3 py-2 text-xs flex items-center justify-between">
                        <span className="text-emerald-300">已用: {formatBytes(q.used)}</span>
                        {q.free !== undefined && (
                          <span className="text-slate-300">可用: {formatBytes(q.free)}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Footer Buttons */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 gap-2">
                    <button
                      onClick={() => onOpenRemoteInExplorer(r.name)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 text-xs font-medium transition-colors"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>浏览文件</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleCheckQuota(r.name)}
                        disabled={loadingQuota === r.name}
                        title="查询容量与连接状态 (rclone about)"
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs inline-flex items-center gap-1"
                      >
                        {loadingQuota === r.name ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        <span>测速/容量</span>
                      </button>

                      {!isBuiltin && (
                        <>
                          <button
                            onClick={() => openEditWizard(r)}
                            title="编辑此 Remote 与代理设置"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteRemote(r.name)}
                            title="删除此 Remote"
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Templates Showcase */}
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-xl p-4 space-y-3">
            <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              快速添加主流云存储与协议向导（支持为每个存储单独绑定 HTTP / SOCKS5 代理）
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {templates.map((tpl) => (
                <button
                  key={tpl.type}
                  onClick={() => openCreateWizard(tpl.type)}
                  className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/70 hover:bg-slate-900 border border-slate-800/90 hover:border-sky-500/50 text-left transition-all group"
                >
                  <span className="px-2 py-1 rounded-lg bg-sky-500/10 text-sky-400 font-mono text-xs font-bold shrink-0 group-hover:bg-sky-500 group-hover:text-white transition-colors">
                    {tpl.badge}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-200 group-hover:text-sky-300 truncate">
                      {tpl.name}
                    </p>
                    <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{tpl.subtitle}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Raw rclone.conf Editor */
        <div className="flex-1 flex flex-col bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-800 bg-slate-950/50">
            <div className="text-xs">
              <span className="text-slate-400">配置文件路径: </span>
              <code className="text-sky-400 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                {rawPath || '/config/rclone/rclone.conf'}
              </code>
              <span className="ml-3 text-slate-500">
                (提示: 可在任意段落添加 <code className="text-indigo-300">_proxy_url = socks5://ip:port</code> 绑定独立代理)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                ref={importFileRef}
                type="file"
                accept=".conf,.txt,.ini"
                className="hidden"
                onChange={handleImportConfFile}
              />
              <button
                onClick={() => importFileRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>导入 rclone.conf</span>
              </button>

              <button
                onClick={handleExportConfFile}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs"
              >
                <Download className="w-3.5 h-3.5" />
                <span>导出备份</span>
              </button>

              <button
                onClick={handleSaveRawConfig}
                disabled={rawSaving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium disabled:opacity-50"
              >
                {rawSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>保存配置</span>
              </button>
            </div>
          </div>

          <div className="flex-1 p-4 flex flex-col">
            {rawLoading ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-xs gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-sky-400" />
                正在加载 rclone.conf...
              </div>
            ) : (
              <textarea
                value={rawContent}
                onChange={(e) => setRawContent(e.target.value)}
                spellCheck={false}
                placeholder="# 在此粘贴或编辑标准 INI 格式的 rclone.conf 内容..."
                className="flex-1 w-full bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-200 focus:outline-none focus:border-sky-500 resize-none leading-relaxed select-text"
              />
            )}
          </div>
        </div>
      )}

      {/* Remote Creation / Edit Wizard Modal */}
      {showWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <form
            onSubmit={handleSaveRemote}
            className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
              <h3 className="text-sm font-semibold text-slate-100">
                {editingMode ? `编辑 Remote: ${remoteName}` : '新增 Rclone Remote 存储配置向导'}
              </h3>
              <button
                type="button"
                onClick={() => setShowWizard(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
              {/* Name & Provider Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Remote 标识名称 (不含冒号) *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={editingMode}
                    value={remoteName}
                    onChange={(e) => setRemoteName(e.target.value)}
                    placeholder="例如: gdrive_a, gdrive_b, onedrive"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Rclone 存储协议类型 (Type) *
                  </label>
                  <select
                    value={selectedType}
                    onChange={(e) => handleSelectTemplateType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                  >
                    {templates.map((t) => (
                      <option key={t.type} value={t.type}>
                        [{t.badge}] {t.name} ({t.type})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dedicated Per-Remote Proxy Configuration Card */}
              <div className="p-4 rounded-xl bg-indigo-950/25 border border-indigo-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-indigo-400" />
                    <span className="font-semibold text-indigo-200">
                      独立网络代理设置 (Per-Remote Proxy)
                    </span>
                  </div>
                  <span className="text-[11px] text-indigo-300/80">
                    仅对该 Remote 生效，互不干扰
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleProxyModeChange('direct')}
                    className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                      proxyMode === 'direct'
                        ? 'bg-emerald-600/25 border-emerald-500 text-emerald-200'
                        : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>直连 (无代理)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleProxyModeChange('http')}
                    className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                      proxyMode === 'http'
                        ? 'bg-indigo-600/30 border-indigo-400 text-indigo-100'
                        : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>HTTP / HTTPS 代理</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleProxyModeChange('socks5')}
                    className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                      proxyMode === 'socks5'
                        ? 'bg-sky-600/30 border-sky-400 text-sky-100'
                        : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>SOCKS5 代理</span>
                  </button>
                </div>

                {proxyMode !== 'direct' && (
                  <div className="space-y-1.5 pt-1">
                    <label className="block text-slate-300 font-medium">
                      代理服务器地址 (支持带账号密码认证)
                    </label>
                    <input
                      type="text"
                      required
                      value={proxyUrlInput}
                      onChange={(e) => setProxyUrlInput(e.target.value)}
                      placeholder={
                        proxyMode === 'socks5'
                          ? 'socks5://192.168.1.2:1080 或 socks5://user:pass@192.168.1.2:1080'
                          : 'http://192.168.1.2:7890 或 http://user:pass@192.168.1.2:7890'
                      }
                      className="w-full bg-slate-950 border border-indigo-500/50 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-indigo-400"
                    />
                    <p className="text-[11px] text-slate-400">
                      例如：Google Drive A 可设为 <code className="text-indigo-300">socks5://192.168.1.2:1080</code>，Google Drive B 设为 <code className="text-indigo-300">http://192.168.1.2:7890</code>，OneDrive 选择“直连”。即使在不同代理的网盘之间直接对传，系统也会自动启动双进程隔离桥接。
                    </p>
                  </div>
                )}
              </div>

              {activeTemplate && (
                <div className="px-3.5 py-2.5 rounded-lg bg-sky-950/30 border border-sky-800/50 text-sky-200 text-xs">
                  {activeTemplate.subtitle}
                </div>
              )}

              {/* Template Fields */}
              {activeTemplate && (
                <div className="space-y-3 pt-1">
                  {activeTemplate.fields.map((field) => (
                    <div key={field.key}>
                      <label className="block text-slate-300 font-medium mb-1">
                        {field.label}{' '}
                        <span className="text-slate-500 font-mono">({field.key})</span>
                        {field.required && <span className="text-rose-400 ml-1">*</span>}
                      </label>

                      {field.type === 'select' && field.options ? (
                        <select
                          value={formParams[field.key] ?? field.defaultValue ?? ''}
                          onChange={(e) =>
                            setFormParams((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
                        >
                          {field.options.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={field.type === 'password' ? 'password' : 'text'}
                          required={field.required}
                          value={formParams[field.key] ?? ''}
                          onChange={(e) =>
                            setFormParams((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          placeholder={field.placeholder || ''}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
                        />
                      )}

                      {field.helpText && (
                        <p className="text-[11px] text-slate-500 mt-1">{field.helpText}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Custom Extra Parameters */}
              <div className="pt-2 border-t border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-300 font-medium">附加自定义参数 (高级可选)</span>
                  <button
                    type="button"
                    onClick={() => setCustomKV((prev) => [...prev, { key: '', value: '' }])}
                    className="text-sky-400 hover:text-sky-300 text-xs inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    添加键值对
                  </button>
                </div>

                {customKV.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={item.key}
                      onChange={(e) =>
                        setCustomKV((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, key: e.target.value } : row))
                        )
                      }
                      placeholder="参数名 (如 chunk_size)"
                      className="w-1/3 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-slate-100"
                    />
                    <input
                      type="text"
                      value={item.value}
                      onChange={(e) =>
                        setCustomKV((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, value: e.target.value } : row
                          )
                        )
                      }
                      placeholder="参数值 (如 64M)"
                      className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => setCustomKV((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-1.5 text-slate-400 hover:text-rose-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={obscurePasswords}
                    onChange={(e) => setObscurePasswords(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-sky-500"
                  />
                  <span className="text-slate-300">
                    自动使用 <code className="text-sky-400">rclone obscure</code> 加密明文密码字段
                    (WebDAV / SFTP / SMB / FTP / Crypt 必选)
                  </span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-800 bg-slate-950/60">
              <button
                type="button"
                onClick={() => setShowWizard(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={savingRemote}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white disabled:opacity-50"
              >
                {savingRemote ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>保存 Remote 配置</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
