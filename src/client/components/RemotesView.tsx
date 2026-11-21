import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Cloud,
  Code2,
  Download,
  Edit3,
  Eye,
  EyeOff,
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
import { useI18n } from '../i18n';
import { localizeTemplate } from '../utils/templateI18n';
import { ALERT_TONES, BADGE_TONES, TINT_BUTTON_TONES } from '../utils/themeStyles';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { Modal } from './ui/Modal';
import { QuotaBar } from './ui/QuotaBar';

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
  const { locale, tr } = useI18n();
  const [subTab, setSubTab] = useState<'cards' | 'raw'>('cards');
  const [quotas, setQuotas] = useState<Record<string, StorageQuota>>({});
  const [loadingQuota, setLoadingQuota] = useState<string | null>(null);

  // Raw config editor state
  const [rawPath, setRawPath] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [savedRawContent, setSavedRawContent] = useState('');
  const [rawLoading, setRawLoading] = useState(false);
  const [rawSaving, setRawSaving] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);

  // Confirm states
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deletingRemote, setDeletingRemote] = useState(false);
  const [discardRawConfirm, setDiscardRawConfirm] = useState(false);

  // Wizard Modal state
  const [showWizard, setShowWizard] = useState(false);
  const [editingMode, setEditingMode] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('s3');
  const [remoteName, setRemoteName] = useState('');
  const [formParams, setFormParams] = useState<RemoteConfigParams>({});
  const [revealedFields, setRevealedFields] = useState<Record<string, boolean>>({});
  const [proxyMode, setProxyMode] = useState<'direct' | 'http' | 'socks5'>('direct');
  const [proxyUrlInput, setProxyUrlInput] = useState<string>('');
  const [customKV, setCustomKV] = useState<{ key: string; value: string }[]>([]);
  const [obscurePasswords, setObscurePasswords] = useState(true);
  const [savingRemote, setSavingRemote] = useState(false);

  const localizedTemplates = useMemo(
    () => templates.map((t) => localizeTemplate(t, locale)),
    [templates, locale]
  );

  const isRawDirty = subTab === 'raw' && !rawLoading && rawContent !== savedRawContent;

  const loadRawConf = useCallback(async () => {
    setRawLoading(true);
    try {
      const res = await api.getRawConfig();
      setRawPath(res.path);
      setRawContent(res.content);
      setSavedRawContent(res.content);
    } catch (err: any) {
      onNotify(
        err.message || tr('读取配置文件失败', '讀取設定檔失敗', 'Failed to read config file'),
        'error'
      );
    } finally {
      setRawLoading(false);
    }
  }, [onNotify, tr]);

  useEffect(() => {
    if (subTab === 'raw') {
      loadRawConf();
    }
  }, [subTab, loadRawConf]);

  const handleSaveRawConfig = useCallback(async () => {
    setRawSaving(true);
    try {
      await api.saveRawConfig(rawContent);
      setSavedRawContent(rawContent);
      onNotify(
        tr(
          'rclone.conf 配置文件已保存并生效',
          'rclone.conf 設定檔已儲存並生效',
          'rclone.conf saved and reloaded'
        ),
        'success'
      );
      onRefreshRemotes();
    } catch (err: any) {
      onNotify(
        err.message || tr('保存配置文件失败', '儲存設定檔失敗', 'Failed to save config'),
        'error'
      );
    } finally {
      setRawSaving(false);
    }
  }, [rawContent, onNotify, onRefreshRemotes, tr]);

  // Ctrl/Cmd + S shortcut in raw editor
  useEffect(() => {
    if (subTab !== 'raw') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!rawSaving && !rawLoading) {
          handleSaveRawConfig();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [subTab, rawSaving, rawLoading, handleSaveRawConfig]);

  const handleSwitchSubTab = (target: 'cards' | 'raw') => {
    if (target === subTab) return;
    if (subTab === 'raw' && isRawDirty) {
      setDiscardRawConfirm(true);
      return;
    }
    setSubTab(target);
  };

  const handleCheckQuota = async (name: string) => {
    setLoadingQuota(name);
    try {
      const q = await api.getRemoteQuota(name);
      setQuotas((prev) => ({ ...prev, [name]: q }));
      if (q.supported) {
        onNotify(
          tr(
            `已获取 "${name}" 存储空间信息`,
            `已取得 "${name}" 儲存空間資訊`,
            `Fetched storage quota for "${name}"`
          ),
          'success'
        );
      } else {
        onNotify(
          tr(
            `"${name}" 后端协议暂不支持 rclone about 配额查询`,
            `"${name}" 後端協定暫不支援 rclone about 配額查詢`,
            `"${name}" backend does not support rclone about quota`
          ),
          'info'
        );
      }
    } catch (err: any) {
      onNotify(
        err.message || tr('连接测试失败', '連線測試失敗', 'Connection test failed'),
        'error'
      );
    } finally {
      setLoadingQuota(null);
    }
  };

  const openCreateWizard = (defaultType = 's3') => {
    const tpl = localizedTemplates.find((t) => t.type === defaultType) || localizedTemplates[0];
    const defaults: RemoteConfigParams = {};
    if (tpl) {
      for (const f of tpl.fields) {
        if (f.defaultValue !== undefined) {
          defaults[f.key] = f.defaultValue;
        }
      }
    }
    setEditingMode(false);
    setSelectedType(tpl?.type || defaultType);
    setRemoteName('');
    setFormParams(defaults);
    setRevealedFields({});
    setProxyMode('direct');
    setProxyUrlInput('');
    setCustomKV([]);
    setObscurePasswords(true);
    setShowWizard(true);
  };

  const openEditWizard = (remote: RemoteInfo) => {
    const tpl = localizedTemplates.find((t) => t.type === remote.type);
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

    const existingProxy = (
      remote.proxyUrl ||
      remote.params._proxy_url ||
      remote.params.proxy_url ||
      ''
    ).trim();
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
    setRevealedFields({});
    setCustomKV(extras);
    // Safe to keep true on edit: backend only obscures password fields whose value changed!
    setObscurePasswords(true);
    setShowWizard(true);
  };

  const handleSelectTemplateType = (type: string) => {
    setSelectedType(type);
    const tpl = localizedTemplates.find((t) => t.type === type);
    const defaults: RemoteConfigParams = {};
    if (tpl) {
      for (const f of tpl.fields) {
        if (f.defaultValue !== undefined) {
          defaults[f.key] = f.defaultValue;
        }
      }
    }
    setFormParams(defaults);
    setRevealedFields({});
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

  const remoteNameError = useMemo(() => {
    const trimmed = remoteName.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('@')) {
      return tr('名称不能以 @ 开头（系统保留）', '名稱不能以 @ 開頭（系統保留）', 'Name cannot start with @ (reserved)');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      return tr(
        '仅支持字母、数字、下划线 (_) 和连字符 (-)',
        '僅支援字母、數字、底線 (_) 與連字號 (-)',
        'Only letters, numbers, underscores (_), and hyphens (-) are allowed'
      );
    }
    return null;
  }, [remoteName, tr]);

  const handleSaveRemote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remoteName.trim()) {
      onNotify(tr('请输入 Remote 名称', '請輸入 Remote 名稱', 'Please enter a Remote name'), 'error');
      return;
    }
    if (!editingMode && remoteNameError) {
      onNotify(remoteNameError, 'error');
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
      onNotify(
        tr(
          `已保存 Remote 配置: ${remoteName}`,
          `已儲存 Remote 設定: ${remoteName}`,
          `Saved Remote: ${remoteName}`
        ),
        'success'
      );
      onRefreshRemotes();
    } catch (err: any) {
      onNotify(
        err.message || tr('保存 Remote 失败', '儲存 Remote 失敗', 'Failed to save Remote'),
        'error'
      );
    } finally {
      setSavingRemote(false);
    }
  };

  const confirmDeleteRemote = async () => {
    if (!deleteTarget) return;
    setDeletingRemote(true);
    try {
      await api.deleteRemote(deleteTarget);
      onNotify(
        tr(`已删除 Remote: ${deleteTarget}`, `已刪除 Remote: ${deleteTarget}`, `Deleted Remote: ${deleteTarget}`),
        'info'
      );
      setDeleteTarget(null);
      onRefreshRemotes();
    } catch (err: any) {
      onNotify(err.message || tr('删除失败', '刪除失敗', 'Delete failed'), 'error');
    } finally {
      setDeletingRemote(false);
    }
  };

  const handleImportConfFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setRawContent(reader.result);
        onNotify(
          tr(
            `已导入 "${file.name}"，请点击“保存配置”使其生效`,
            `已匯入 "${file.name}"，請點擊「儲存設定」使其生效`,
            `Imported "${file.name}". Click "Save Config" to apply.`
          ),
          'info'
        );
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

  const activeTemplate = localizedTemplates.find((t) => t.type === selectedType);
  const rawLineCount = rawContent ? rawContent.split(/\r?\n/).length : 0;

  return (
    <div className="flex flex-col h-full gap-4 overflow-hidden">
      {/* Top Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/70 border border-slate-800 rounded-xl px-4 py-2.5 shrink-0 select-none">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleSwitchSubTab('cards')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              subTab === 'cards'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>
              {tr('已配置存储源', '已設定儲存源', 'Configured Remotes')} ({remotes.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleSwitchSubTab('raw')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              subTab === 'raw'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>
              {tr(
                'rclone.conf 源文件编辑与导入',
                'rclone.conf 原始檔編輯與匯入',
                'rclone.conf Raw Editor & Import'
              )}
            </span>
            {isRawDirty && (
              <span
                className="w-2 h-2 rounded-full bg-amber-400"
                title={tr('有未保存的更改', '有未儲存的變更', 'Unsaved changes')}
              />
            )}
          </button>
        </div>

        {subTab === 'cards' && (
          <button
            type="button"
            onClick={() => openCreateWizard('drive')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors shadow-lg shadow-sky-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>{tr('新增 Remote 存储源', '新增 Remote 儲存源', 'Add Remote')}</span>
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
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : r.type === 'crypt'
                                ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                                : 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
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
                                ? tr('本地数据卷 (/media)', '本機資料卷 (/media)', 'Local Volume (/media)')
                                : isBuiltin
                                  ? `${tr('本地挂载点', '本機掛載點', 'Local Mount')}: ${r.name.slice(1)}`
                                  : `${r.name}:`}
                            </h4>
                            <span className={`px-2 py-0.5 rounded border font-mono text-[10px] uppercase ${BADGE_TONES.sky}`}>
                              {r.type}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5 truncate">
                            {isBuiltin
                              ? `${tr('挂载路径', '掛載路徑', 'Mount Path')}: ${r.rootPath || '/media'}`
                              : r.params.endpoint ||
                                r.params.url ||
                                r.params.host ||
                                r.params.remote ||
                                r.params.provider ||
                                tr('标准 Rclone 存储节点', '標準 Rclone 儲存節點', 'Rclone Storage Node')}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Per-Remote Proxy Badge */}
                    {!isBuiltin && (
                      <div
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${
                          proxyVal
                            ? ALERT_TONES.indigo
                            : 'bg-slate-950/60 border-slate-800/80 text-slate-400'
                        }`}
                      >
                        {proxyVal ? (
                          <>
                            <Globe className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                            <span className="font-mono truncate" title={proxyVal}>
                              {tr('独立代理', '獨立代理', 'Proxy')}: {proxyVal}
                            </span>
                          </>
                        ) : (
                          <>
                            <Zap className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>
                              {tr(
                                '网络策略: 直连 (无代理)',
                                '網路策略: 直連 (無代理)',
                                'Network: Direct (No Proxy)'
                              )}
                            </span>
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
                      ).length === 0 && (
                        <div className="text-slate-500">
                          {tr('默认参数配置', '預設參數設定', 'Default parameters')}
                        </div>
                      )}
                    </div>

                    {/* Visual Quota Bar if loaded */}
                    {q && q.supported && <QuotaBar quota={q} />}
                  </div>

                  {/* Card Footer Buttons */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenRemoteInExplorer(r.name)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${TINT_BUTTON_TONES.sky}`}
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>{tr('浏览文件', '瀏覽檔案', 'Browse')}</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleCheckQuota(r.name)}
                        disabled={loadingQuota === r.name}
                        title={tr('查询容量与连接状态 (rclone about)', '查詢容量與連線狀態 (rclone about)', 'Check quota & connection')}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs inline-flex items-center gap-1 transition-colors"
                      >
                        {loadingQuota === r.name ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5" />
                        )}
                        <span>{tr('测速/容量', '測速/容量', 'Quota')}</span>
                      </button>

                      {!isBuiltin && (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditWizard(r)}
                            aria-label={tr('编辑此 Remote 与代理设置', '編輯此 Remote 與代理設定', 'Edit Remote & Proxy')}
                            title={tr('编辑此 Remote 与代理设置', '編輯此 Remote 與代理設定', 'Edit Remote & Proxy')}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-500 dark:hover:text-amber-300 transition-colors"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(r.name)}
                            aria-label={tr('删除此 Remote', '刪除此 Remote', 'Delete Remote')}
                            title={tr('删除此 Remote', '刪除此 Remote', 'Delete Remote')}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-300 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
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
              {tr(
                '快速添加主流云存储与协议向导（支持为每个存储单独绑定 HTTP / SOCKS5 代理）',
                '快速新增主流雲端儲存與協定精靈（支援為每個儲存單獨綁定 HTTP / SOCKS5 代理）',
                'Quick Add Storage Provider Wizard (Supports Per-Remote HTTP / SOCKS5 Proxy)'
              )}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {localizedTemplates.map((tpl) => (
                <button
                  key={tpl.type}
                  type="button"
                  onClick={() => openCreateWizard(tpl.type)}
                  className="flex items-start gap-3 p-3 rounded-xl bg-slate-950/70 hover:bg-slate-900 border border-slate-800/90 hover:border-sky-500/50 text-left transition-all group"
                >
                  <span className="px-2 py-1 rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400 font-mono text-xs font-bold shrink-0 group-hover:bg-sky-600 group-hover:text-white transition-colors">
                    {tpl.badge}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-200 group-hover:text-sky-500 dark:group-hover:text-sky-300 truncate">
                      {tpl.name}
                    </p>
                    <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{tpl.subtitle}</p>
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
            <div className="text-xs flex flex-wrap items-center gap-2">
              <span className="text-slate-400">
                {tr('配置文件路径:', '設定檔路徑:', 'Config Path:')}
              </span>
              <code className="text-sky-600 dark:text-sky-400 font-mono bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                {rawPath || '/config/rclone/rclone.conf'}
              </code>
              {isRawDirty && (
                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${BADGE_TONES.amber}`}>
                  {tr('未保存', '未儲存', 'Unsaved')}
                </span>
              )}
              <span className="text-slate-500 hidden xl:inline">
                (
                {tr(
                  '提示: 可添加 _proxy_url = socks5://ip:port 绑定独立代理，Ctrl+S 快速保存',
                  '提示: 可新增 _proxy_url = socks5://ip:port 綁定獨立代理，Ctrl+S 快速儲存',
                  'Tip: Add _proxy_url = socks5://ip:port for per-remote proxy · Ctrl+S to save'
                )}
                )
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
                type="button"
                onClick={() => importFileRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{tr('导入 rclone.conf', '匯入 rclone.conf', 'Import rclone.conf')}</span>
              </button>

              <button
                type="button"
                onClick={handleExportConfFile}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{tr('导出备份', '匯出備份', 'Export Backup')}</span>
              </button>

              <button
                type="button"
                onClick={handleSaveRawConfig}
                disabled={rawSaving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium disabled:opacity-50 transition-colors"
              >
                {rawSaving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{tr('保存配置', '儲存設定', 'Save Config')}</span>
              </button>
            </div>
          </div>

          <div className="flex-1 p-4 flex flex-col min-h-0">
            {rawLoading ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-xs gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-sky-400" />
                {tr('正在加载 rclone.conf...', '正在載入 rclone.conf...', 'Loading rclone.conf...')}
              </div>
            ) : (
              <textarea
                value={rawContent}
                onChange={(e) => setRawContent(e.target.value)}
                spellCheck={false}
                placeholder="# Paste or edit standard INI-formatted rclone.conf content here..."
                className="flex-1 w-full bg-slate-950 border border-slate-800 rounded-xl p-4 font-mono text-xs text-slate-200 focus:outline-none focus:border-sky-500 resize-none leading-relaxed select-text"
              />
            )}
          </div>

          <div className="flex items-center justify-between px-4 py-1.5 border-t border-slate-800 bg-slate-950/60 text-[11px] text-slate-400 font-mono">
            <span>
              {tr(`${rawLineCount} 行 · ${rawContent.length} 字符`, `${rawLineCount} 行 · ${rawContent.length} 字元`, `${rawLineCount} lines · ${rawContent.length} chars`)}
            </span>
            <span>Ctrl / Cmd + S {tr('保存', '儲存', 'to Save')}</span>
          </div>
        </div>
      )}

      {/* Remote Creation / Edit Wizard Modal */}
      <Modal
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        closeDisabled={savingRemote}
        maxWidthClass="max-w-2xl"
        ariaLabel={tr('Remote 存储配置向导', 'Remote 儲存設定精靈', 'Remote Configuration Wizard')}
      >
        <form onSubmit={handleSaveRemote} className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60 shrink-0">
            <h3 className="text-sm font-semibold text-slate-100">
              {editingMode
                ? `${tr('编辑 Remote', '編輯 Remote', 'Edit Remote')}: ${remoteName}`
                : tr(
                    '新增 Rclone Remote 存储配置向导',
                    '新增 Rclone Remote 儲存設定精靈',
                    'Add Rclone Remote Wizard'
                  )}
            </h3>
            <button
              type="button"
              onClick={() => setShowWizard(false)}
              aria-label={tr('关闭', '關閉', 'Close')}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
            {/* Name & Provider Type */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  {tr(
                    'Remote 标识名称 (不含冒号) *',
                    'Remote 識別名稱 (不含冒號) *',
                    'Remote Name (without colon) *'
                  )}
                </label>
                <input
                  type="text"
                  required
                  disabled={editingMode}
                  value={remoteName}
                  onChange={(e) => setRemoteName(e.target.value)}
                  placeholder="e.g. gdrive_a, s3_backup, onedrive"
                  className={`w-full bg-slate-950 border rounded-lg px-3 py-2 text-slate-100 font-mono disabled:opacity-60 focus:outline-none ${
                    !editingMode && remoteNameError
                      ? 'border-rose-500 focus:border-rose-500'
                      : 'border-slate-700 focus:border-sky-500'
                  }`}
                />
                {!editingMode && remoteNameError && (
                  <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1">
                    {remoteNameError}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  {tr(
                    'Rclone 存储协议类型 (Type) *',
                    'Rclone 儲存協定類型 (Type) *',
                    'Storage Provider Type *'
                  )}
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => handleSelectTemplateType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-sky-500"
                >
                  {localizedTemplates.map((t) => (
                    <option key={t.type} value={t.type}>
                      [{t.badge}] {t.name} ({t.type})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dedicated Per-Remote Proxy Configuration Card */}
            <div className={`p-4 rounded-xl border space-y-3 ${ALERT_TONES.indigo}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="font-semibold">
                    {tr(
                      '独立网络代理设置 (Per-Remote Proxy)',
                      '獨立網路代理設定 (Per-Remote Proxy)',
                      'Per-Remote Network Proxy'
                    )}
                  </span>
                </div>
                <span className="text-[11px] opacity-80">
                  {tr(
                    '仅对该 Remote 生效，互不干扰',
                    '僅對該 Remote 生效，互不干擾',
                    'Isolated per remote'
                  )}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleProxyModeChange('direct')}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                    proxyMode === 'direct'
                      ? `${TINT_BUTTON_TONES.emerald} shadow-sm`
                      : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>{tr('直连 (无代理)', '直連 (無代理)', 'Direct (No Proxy)')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleProxyModeChange('http')}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                    proxyMode === 'http'
                      ? `${TINT_BUTTON_TONES.indigo} shadow-sm`
                      : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>{tr('HTTP / HTTPS 代理', 'HTTP / HTTPS 代理', 'HTTP / HTTPS Proxy')}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleProxyModeChange('socks5')}
                  className={`py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all ${
                    proxyMode === 'socks5'
                      ? `${TINT_BUTTON_TONES.sky} shadow-sm`
                      : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>{tr('SOCKS5 代理', 'SOCKS5 代理', 'SOCKS5 Proxy')}</span>
                </button>
              </div>

              {proxyMode !== 'direct' && (
                <div className="space-y-1.5 pt-1">
                  <label className="block font-medium">
                    {tr(
                      '代理服务器地址 (支持带账号密码认证)',
                      '代理伺服器位址 (支援帶帳號密碼驗證)',
                      'Proxy URL (Supports user:pass authentication)'
                    )}
                  </label>
                  <input
                    type="text"
                    required
                    value={proxyUrlInput}
                    onChange={(e) => setProxyUrlInput(e.target.value)}
                    placeholder={
                      proxyMode === 'socks5'
                        ? 'socks5://192.168.1.2:1080 or socks5://user:pass@192.168.1.2:1080'
                        : 'http://192.168.1.2:7890 or http://user:pass@192.168.1.2:7890'
                    }
                    className="w-full bg-slate-950 border border-indigo-500/50 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-indigo-400"
                  />
                </div>
              )}
            </div>

            {activeTemplate && (
              <div className={`px-3.5 py-2.5 rounded-lg border text-xs ${ALERT_TONES.info}`}>
                {activeTemplate.subtitle}
              </div>
            )}

            {/* Template Fields */}
            {activeTemplate && (
              <div className="space-y-3 pt-1">
                {activeTemplate.fields.map((field) => {
                  const isRevealed = Boolean(revealedFields[field.key]);
                  return (
                    <div key={field.key}>
                      <label className="block text-slate-300 font-medium mb-1">
                        {field.label}{' '}
                        <span className="text-slate-500 font-mono">({field.key})</span>
                        {field.required && <span className="text-rose-500 ml-1">*</span>}
                      </label>

                      {field.type === 'select' && field.options ? (
                        <select
                          value={formParams[field.key] ?? field.defaultValue ?? ''}
                          onChange={(e) =>
                            setFormParams((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-sky-500"
                        >
                          {field.options.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : field.type === 'boolean' ? (
                        <label className="inline-flex items-center gap-2 cursor-pointer py-1">
                          <input
                            type="checkbox"
                            checked={(formParams[field.key] ?? field.defaultValue) === 'true'}
                            onChange={(e) =>
                              setFormParams((prev) => ({
                                ...prev,
                                [field.key]: e.target.checked ? 'true' : 'false',
                              }))
                            }
                            className="rounded border-slate-700 bg-slate-950 text-sky-500"
                          />
                          <span className="text-slate-300 font-mono">{field.key}</span>
                        </label>
                      ) : field.type === 'password' ? (
                        <div className="relative">
                          <input
                            type={isRevealed ? 'text' : 'password'}
                            required={field.required}
                            value={formParams[field.key] ?? ''}
                            onChange={(e) =>
                              setFormParams((prev) => ({ ...prev, [field.key]: e.target.value }))
                            }
                            placeholder={field.placeholder || ''}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-9 py-2 text-slate-100 font-mono focus:outline-none focus:border-sky-500"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setRevealedFields((prev) => ({
                                ...prev,
                                [field.key]: !prev[field.key],
                              }))
                            }
                            aria-label={tr('切换可见性', '切換可見性', 'Toggle visibility')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                          >
                            {isRevealed ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <input
                          type={field.type === 'number' ? 'number' : 'text'}
                          required={field.required}
                          value={formParams[field.key] ?? ''}
                          onChange={(e) =>
                            setFormParams((prev) => ({ ...prev, [field.key]: e.target.value }))
                          }
                          placeholder={field.placeholder || ''}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-sky-500"
                        />
                      )}

                      {field.helpText && (
                        <p className="text-[11px] text-slate-400 mt-1">{field.helpText}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Custom Extra Parameters */}
            <div className="pt-2 border-t border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-medium">
                  {tr(
                    '附加自定义参数 (高级可选)',
                    '附加自訂參數 (進階選填)',
                    'Custom Extra Parameters (Optional)'
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setCustomKV((prev) => [...prev, { key: '', value: '' }])}
                  className="text-sky-600 dark:text-sky-400 hover:underline text-xs inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {tr('添加键值对', '新增鍵值對', 'Add Key-Value')}
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
                    placeholder="key (e.g. chunk_size)"
                    className="w-1/3 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                  />
                  <input
                    type="text"
                    value={item.value}
                    onChange={(e) =>
                      setCustomKV((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, value: e.target.value } : row))
                      )
                    }
                    placeholder="value (e.g. 64M)"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 font-mono text-slate-100 focus:outline-none focus:border-sky-500"
                  />
                  <button
                    type="button"
                    onClick={() => setCustomKV((prev) => prev.filter((_, i) => i !== idx))}
                    aria-label={tr('移除参数', '移除參數', 'Remove parameter')}
                    className="p-1.5 text-slate-400 hover:text-rose-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="pt-2">
              <label className="inline-flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={obscurePasswords}
                  onChange={(e) => setObscurePasswords(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 bg-slate-950 text-sky-500"
                />
                <span className="text-slate-300 leading-snug">
                  {tr(
                    '自动使用 rclone obscure 加密修改过的明文密码字段（未修改的已加密密码会自动跳过，不会重复加密）',
                    '自動使用 rclone obscure 加密修改過的明文密碼欄位（未修改的已加密密碼會自動跳過，不會重複加密）',
                    'Automatically obscure modified plaintext password fields via rclone obscure (unchanged secrets are preserved safely)'
                  )}
                </span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-800 bg-slate-950/60 shrink-0">
            <button
              type="button"
              onClick={() => setShowWizard(false)}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors"
            >
              {tr('取消', '取消', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={savingRemote || (!editingMode && Boolean(remoteNameError))}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white disabled:opacity-50 transition-colors"
            >
              {savingRemote ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>{tr('保存 Remote 配置', '儲存 Remote 設定', 'Save Remote')}</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Remote Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title={tr('删除 Remote 存储源', '刪除 Remote 儲存源', 'Delete Remote')}
        tone="danger"
        loading={deletingRemote}
        message={tr(
          `确定要从 rclone.conf 中删除 Remote "${deleteTarget}" 吗？已创建的定时任务若引用该存储源可能会执行失败。`,
          `確定要從 rclone.conf 中刪除 Remote "${deleteTarget}" 嗎？已建立的排程任務若引用該儲存源可能會執行失敗。`,
          `Are you sure you want to delete "${deleteTarget}" from rclone.conf? Any schedules referencing it may fail.`
        )}
        confirmLabel={tr('确认删除', '確認刪除', 'Delete')}
        onConfirm={confirmDeleteRemote}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Unsaved Raw Config Warning */}
      <ConfirmDialog
        isOpen={discardRawConfirm}
        title={tr('放弃未保存的配置更改？', '放棄未儲存的設定變更？', 'Discard Unsaved Changes?')}
        tone="warning"
        message={tr(
          '您在 rclone.conf 源文件编辑器中有未保存的修改。切换视图将丢失这些更改。',
          '您在 rclone.conf 原始檔編輯器中有未儲存的修改。切換檢視將遺失這些變更。',
          'You have unsaved edits in the rclone.conf raw editor. Switching views will discard them.'
        )}
        confirmLabel={tr('放弃修改并切换', '放棄修改並切換', 'Discard & Switch')}
        onConfirm={() => {
          setDiscardRawConfirm(false);
          setRawContent(savedRawContent);
          setSubTab('cards');
        }}
        onClose={() => setDiscardRawConfirm(false)}
      />
    </div>
  );
};
