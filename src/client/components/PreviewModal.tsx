import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileCode,
  FileImage,
  FileText,
  Film,
  Loader2,
  Music,
  X,
} from 'lucide-react';
import { FileEntry, RemoteInfo } from '../../shared/types';
import { api } from '../api';
import { useI18n } from '../i18n';
import {
  formatBytes,
  formatDateTime,
  formatRemoteFullPath,
  getFileCategory,
  isTextPreviewableCategory,
} from '../utils/format';
import { ALERT_TONES } from '../utils/themeStyles';
import { Modal } from './ui/Modal';

interface PreviewModalProps {
  remote: string;
  remotes?: RemoteInfo[];
  entry: FileEntry | null;
  onClose: () => void;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({
  remote,
  remotes,
  entry,
  onClose,
}) => {
  const { locale, tr } = useI18n();
  const [textContent, setTextContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const category = entry ? getFileCategory(entry) : 'other';
  const isText = isTextPreviewableCategory(category);

  useEffect(() => {
    setTextContent('');
    setError(null);
    setLoading(false);
    setCopied(false);

    if (!entry) return;
    if (!isText || entry.Size > 2 * 1024 * 1024) return;

    const controller = new AbortController();
    setLoading(true);
    const url = api.getDownloadUrl(remote, entry.Path, true);
    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((txt) => {
        setTextContent(txt);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setError(
          err.message ||
            tr('加载文本预览失败', '載入文字預覽失敗', 'Failed to load text preview')
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [remote, entry, isText, tr]);

  if (!entry) return null;

  const inlineUrl = api.getDownloadUrl(remote, entry.Path, true);
  const downloadUrl = api.getDownloadUrl(remote, entry.Path, false);

  const handleCopyText = async () => {
    if (!textContent) return;
    try {
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const renderHeaderIcon = () => {
    if (category === 'image') return <FileImage className="w-5 h-5" />;
    if (category === 'video') return <Film className="w-5 h-5" />;
    if (category === 'audio') return <Music className="w-5 h-5" />;
    if (category === 'code') return <FileCode className="w-5 h-5" />;
    return <FileText className="w-5 h-5" />;
  };

  return (
    <Modal
      isOpen={Boolean(entry)}
      onClose={onClose}
      maxWidthClass="max-w-4xl"
      ariaLabel={entry.Name}
    >
      {/* Modal Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-800 bg-slate-900/90 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400 shrink-0">
            {renderHeaderIcon()}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-100 truncate select-text">
              {entry.Name}
            </h3>
            <p className="text-xs text-slate-400 truncate select-text">
              {formatRemoteFullPath(remote, entry.Path, remotes)} •{' '}
              {formatBytes(entry.Size)} • {formatDateTime(entry.ModTime, locale)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isText && textContent && !loading && !error && (
            <button
              type="button"
              onClick={handleCopyText}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>
                {copied
                  ? tr('已复制', '已複製', 'Copied')
                  : tr('复制内容', '複製內容', 'Copy')}
              </span>
            </button>
          )}
          <a
            href={inlineUrl}
            target="_blank"
            rel="noreferrer"
            title={tr('在新标签页打开', '在新分頁開啟', 'Open in new tab')}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-sky-400 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
          <a
            href={downloadUrl}
            download={entry.Name}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{tr('下载文件', '下載檔案', 'Download')}</span>
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label={tr('关闭', '關閉', 'Close')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Modal Body */}
      <div className="flex-1 overflow-auto p-5 bg-slate-950/60 flex items-center justify-center min-h-[320px]">
        {category === 'image' ? (
          <img
            src={inlineUrl}
            alt={entry.Name}
            className="max-w-full max-h-[68vh] object-contain rounded-lg shadow-lg"
          />
        ) : category === 'video' ? (
          <video
            src={inlineUrl}
            controls
            preload="metadata"
            className="max-w-full max-h-[68vh] rounded-lg bg-black shadow-lg"
          />
        ) : category === 'audio' ? (
          <div className="w-full max-w-md p-6 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col items-center gap-4">
            <div className="p-4 rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Music className="w-8 h-8" />
            </div>
            <p className="text-sm font-medium text-slate-100 truncate max-w-full">{entry.Name}</p>
            <audio src={inlineUrl} controls preload="metadata" className="w-full" />
          </div>
        ) : category === 'pdf' ? (
          <iframe
            src={inlineUrl}
            title={entry.Name}
            className="w-full h-[68vh] rounded-lg border border-slate-800 bg-white"
          />
        ) : isText ? (
          entry.Size > 2 * 1024 * 1024 ? (
            <div className="text-center text-slate-400 space-y-3">
              <p className="text-sm">
                {tr(
                  `该文本文件超过 2MB (${formatBytes(entry.Size)})，建议直接下载查看。`,
                  `該文字檔案超過 2MB (${formatBytes(entry.Size)})，建議直接下載檢視。`,
                  `This text file exceeds 2MB (${formatBytes(entry.Size)}). Please download it directly.`
                )}
              </p>
              <a
                href={downloadUrl}
                download={entry.Name}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium"
              >
                <Download className="w-4 h-4" />
                {tr('立即下载', '立即下載', 'Download Now')}
              </a>
            </div>
          ) : loading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Loader2 className="w-5 h-5 animate-spin text-sky-400" />
              {tr('正在读取文件内容...', '正在讀取檔案內容...', 'Loading file content...')}
            </div>
          ) : error ? (
            <div className={`px-4 py-3 rounded-xl border text-xs ${ALERT_TONES.error}`}>
              {error}
            </div>
          ) : (
            <pre className="w-full h-full max-h-[68vh] overflow-auto p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 whitespace-pre-wrap break-words select-text leading-relaxed">
              {textContent || tr('(空文件)', '(空檔案)', '(Empty file)')}
            </pre>
          )
        ) : (
          <div className="text-center space-y-3 py-8">
            <p className="text-sm text-slate-300">
              {tr(
                `暂不支持直接在线预览此格式 (${entry.MimeType || '未知格式'})`,
                `暫不支援直接線上預覽此格式 (${entry.MimeType || '未知格式'})`,
                `Inline preview is not supported for this format (${entry.MimeType || 'unknown'})`
              )}
            </p>
            <a
              href={downloadUrl}
              download={entry.Name}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium"
            >
              <Download className="w-4 h-4" />
              {tr('立即下载', '立即下載', 'Download Now')} ({formatBytes(entry.Size)})
            </a>
          </div>
        )}
      </div>
    </Modal>
  );
};
