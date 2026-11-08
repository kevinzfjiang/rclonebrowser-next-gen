import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  EyeOff,
  Filter,
  FolderX,
  FileX,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {
  DEFAULT_GLOBAL_EXCLUDE,
  FILTER_PRESETS,
  FilterPreset,
  parseExcludePatterns,
} from '../../shared/filterPresets';
import { api } from '../api';
import { useI18n } from '../i18n';

interface FilterRulesModalProps {
  isOpen: boolean;
  globalExclude: string;
  hideFilteredInExplorer: boolean;
  onToggleHideInExplorer: (val: boolean) => void;
  onClose: () => void;
  onSaved: (newGlobalExclude: string) => void;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const FilterRulesModal: React.FC<FilterRulesModalProps> = ({
  isOpen,
  globalExclude,
  hideFilteredInExplorer,
  onToggleHideInExplorer,
  onClose,
  onSaved,
  onNotify,
}) => {
  const { tr } = useI18n();
  const [patterns, setPatterns] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [rawMode, setRawMode] = useState(false);
  const [rawText, setRawText] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const parsed = parseExcludePatterns(globalExclude);
      setPatterns(parsed);
      setRawText(parsed.join(', '));
      setCustomInput('');
    }
  }, [isOpen, globalExclude]);

  const patternSet = useMemo(() => new Set(patterns), [patterns]);

  if (!isOpen) return null;

  const isPresetActive = (preset: FilterPreset): boolean => {
    return preset.patterns.every((p) => patternSet.has(p));
  };

  const togglePreset = (preset: FilterPreset) => {
    const active = isPresetActive(preset);
    let next: string[];
    if (active) {
      const removeSet = new Set(preset.patterns);
      next = patterns.filter((p) => !removeSet.has(p));
    } else {
      next = parseExcludePatterns([...patterns, ...preset.patterns].join(', '));
    }
    setPatterns(next);
    setRawText(next.join(', '));
  };

  const handleAddCustom = (asFolder: boolean) => {
    const trimmed = customInput.trim().replace(/^\/+/, '');
    if (!trimmed) return;
    const rule = asFolder
      ? trimmed.endsWith('/**')
        ? trimmed
        : `${trimmed.replace(/\/+$/, '')}/**`
      : trimmed;
    const next = parseExcludePatterns([...patterns, rule].join(', '));
    setPatterns(next);
    setRawText(next.join(', '));
    setCustomInput('');
  };

  const handleRemovePattern = (pat: string) => {
    const next = patterns.filter((p) => p !== pat);
    setPatterns(next);
    setRawText(next.join(', '));
  };

  const handleResetDefaults = () => {
    const next = parseExcludePatterns(DEFAULT_GLOBAL_EXCLUDE);
    setPatterns(next);
    setRawText(next.join(', '));
  };

  const handleClearAll = () => {
    setPatterns([]);
    setRawText('');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const finalExclude = rawMode
        ? parseExcludePatterns(rawText).join(', ')
        : patterns.join(', ');
      const res = await api.setGlobalExclude(finalExclude);
      onSaved(res.globalExclude);
      onNotify(
        tr(
          '全局文件/文件夹过滤规则已保存并生效',
          '全域檔案/資料夾過濾規則已儲存並生效',
          'Global file/folder filter rules saved'
        ),
        'success'
      );
      onClose();
    } catch (err: any) {
      onNotify(
        err.message || tr('保存过滤规则失败', '儲存過濾規則失敗', 'Failed to save filter rules'),
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/70 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30">
              <Filter className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                {tr(
                  '全局同步与传输过滤规则 (--exclude)',
                  '全域同步與傳輸過濾規則 (--exclude)',
                  'Global Transfer & Sync Filter Rules (--exclude)'
                )}
              </h2>
              <p className="text-[11px] text-slate-400">
                {tr(
                  '自动过滤群晖 @eaDir、#recycle 等系统隐藏目录及自定义文件，对所有 Copy / Move / Sync 与定时任务生效',
                  '自動過濾群暉 @eaDir、#recycle 等系統隱藏目錄及自訂檔案，對所有 Copy / Move / Sync 與排程任務生效',
                  'Automatically exclude Synology @eaDir, #recycle, and custom patterns across all transfers & schedules'
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSave} className="p-6 space-y-5 overflow-y-auto text-xs flex-1">
          {/* 1. One-Click Built-in Filter Presets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-slate-200 font-semibold">
                {tr('1. 一键勾选过滤预设包', '1. 一鍵勾選過濾預設包', '1. One-Click Filter Presets')}
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:underline"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>{tr('恢复群晖推荐默认', '恢復群暉推薦預設', 'Reset Synology Defaults')}</span>
                </button>
                <span className="text-slate-700">|</span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="inline-flex items-center gap-1 text-[11px] text-rose-400 hover:underline"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>{tr('清空全部', '清空全部', 'Clear All')}</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {FILTER_PRESETS.map((preset) => {
                const active = isPresetActive(preset);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => togglePreset(preset)}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                      active
                        ? 'bg-sky-600/15 border-sky-500 text-slate-100 shadow-sm'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      readOnly
                      className="mt-0.5 rounded border-slate-600 text-sky-500 focus:ring-0 pointer-events-none"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-xs text-slate-100">
                        {tr(preset.zhCN, preset.zhTW, preset.en)}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                        {tr(preset.descriptionZhCN, preset.descriptionZhTW, preset.descriptionEn)}
                      </div>
                      <div className="text-[10px] font-mono text-sky-400/90 mt-1 truncate">
                        {preset.patterns.join(', ')}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Add Custom Folder or File Rule */}
          <div>
            <label className="block text-slate-200 font-semibold mb-2">
              {tr(
                '2. 添加自定义过滤文件夹或文件通配符',
                '2. 新增自訂過濾資料夾或檔案萬用字元',
                '2. Add Custom Folder or File Wildcard'
              )}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustom(false);
                  }
                }}
                placeholder={tr(
                  '输入目录名 (如 @eaDir、node_modules) 或文件通配符 (如 *.bak、*.log)',
                  '輸入目錄名 (如 @eaDir、node_modules) 或檔案萬用字元 (如 *.bak、*.log)',
                  'Enter folder name (e.g. @eaDir, node_modules) or file glob (e.g. *.bak, *.log)'
                )}
                className="flex-1 min-w-[220px] bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono focus:outline-none focus:border-sky-500"
              />
              <button
                type="button"
                onClick={() => handleAddCustom(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-medium transition-colors"
              >
                <FolderX className="w-3.5 h-3.5" />
                <span>{tr('过滤该文件夹 (/**)', '過濾該資料夾 (/**)', 'Exclude Folder (/**)')}</span>
              </button>
              <button
                type="button"
                onClick={() => handleAddCustom(false)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/40 text-sky-300 font-medium transition-colors"
              >
                <FileX className="w-3.5 h-3.5" />
                <span>{tr('过滤文件/规则', '過濾檔案/規則', 'Exclude File/Glob')}</span>
              </button>
            </div>
          </div>

          {/* 3. Active Rules List / Raw Editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-slate-200 font-semibold">
                {tr(
                  `当前生效的过滤规则 (${patterns.length} 项)`,
                  `目前生效的過濾規則 (${patterns.length} 項)`,
                  `Active Exclude Patterns (${patterns.length})`
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (!rawMode) {
                    setRawText(patterns.join(', '));
                  } else {
                    setPatterns(parseExcludePatterns(rawText));
                  }
                  setRawMode(!rawMode);
                }}
                className="text-[11px] text-sky-400 hover:underline"
              >
                {rawMode
                  ? tr('切换为标签视图', '切換為標籤檢視', 'Switch to Tag View')
                  : tr('切换为纯文本批量编辑', '切換為純文字批次編輯', 'Edit as Raw Text')}
              </button>
            </div>

            {rawMode ? (
              <textarea
                rows={4}
                value={rawText}
                onChange={(e) => {
                  setRawText(e.target.value);
                  setPatterns(parseExcludePatterns(e.target.value));
                }}
                placeholder="@eaDir/**, #recycle/**, *.tmp"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 font-mono text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              />
            ) : (
              <div className="min-h-[84px] max-h-44 overflow-y-auto p-3 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-wrap content-start gap-1.5">
                {patterns.length === 0 ? (
                  <span className="text-slate-500 text-xs">
                    {tr(
                      '当前未设置任何过滤规则（所有文件与系统目录都会被同步）',
                      '目前未設定任何過濾規則（所有檔案與系統目錄都會被同步）',
                      'No exclude rules active (all files and system folders will be synced)'
                    )}
                  </span>
                ) : (
                  patterns.map((pat) => {
                    const isDirRule = pat.endsWith('/**') || pat.endsWith('/');
                    return (
                      <span
                        key={pat}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-[11px] border ${
                          isDirRule
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                            : 'bg-sky-500/10 border-sky-500/30 text-sky-300'
                        }`}
                      >
                        <span>{pat}</span>
                        <button
                          type="button"
                          onClick={() => handleRemovePattern(pat)}
                          className="text-slate-400 hover:text-rose-400"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* 4. Explorer View Sync Toggle */}
          <label className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 cursor-pointer hover:border-slate-700">
            <div className="flex items-center gap-2.5">
              <EyeOff className="w-4 h-4 text-emerald-400 shrink-0" />
              <div>
                <div className="font-semibold text-slate-200">
                  {tr(
                    '在「文件管理器」浏览列表里同时隐藏上述过滤目录（如 @eaDir、#recycle）',
                    '在「檔案管理員」瀏覽清單裡同時隱藏上述過濾目錄（如 @eaDir、#recycle）',
                    'Also hide matching folders/files (e.g. @eaDir, #recycle) in File Explorer view'
                  )}
                </div>
                <div className="text-[11px] text-slate-400">
                  {tr(
                    '开启后，浏览群晖本地目录时不再显示杂乱的 @eaDir 与 #recycle 文件夹',
                    '開啟後，瀏覽群暉本機目錄時不再顯示雜亂的 @eaDir 與 #recycle 資料夾',
                    'Keeps Synology folders clean when browsing in Dual-Pane Explorer'
                  )}
                </div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={hideFilteredInExplorer}
              onChange={(e) => onToggleHideInExplorer(e.target.checked)}
              className="w-4 h-4 rounded border-slate-600 text-sky-500 focus:ring-0"
            />
          </label>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors"
            >
              {tr('取消', '取消', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold transition-colors shadow"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {saving
                  ? tr('保存中...', '儲存中...', 'Saving...')
                  : tr('保存全局过滤规则', '儲存全域過濾規則', 'Save Filter Rules')}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
