import React, { useEffect, useState } from 'react';
import { Download, FileText, Loader2, X } from 'lucide-react';
import { FileEntry } from '../../shared/types';
import { api } from '../api';
import { formatBytes, formatDateTime } from '../utils/format';

interface PreviewModalProps {
  remote: string;
  entry: FileEntry | null;
  onClose: () => void;
}

export const PreviewModal: React.FC<PreviewModalProps> = ({ remote, entry, onClose }) => {
  const [textContent, setTextContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isTextPreviewable = (entry: FileEntry): boolean => {
    const mime = entry.MimeType || '';
    const ext = entry.Name.split('.').pop()?.toLowerCase() || '';
    const textExts = [
      'txt',
      'md',
      'json',
      'yaml',
      'yml',
      'conf',
      'ini',
      'log',
      'csv',
      'xml',
      'sh',
      'py',
      'js',
      'ts',
      'tsx',
      'jsx',
      'html',
      'css',
      'env',
      'toml',
    ];
    return (
      mime.startsWith('text/') ||
      mime === 'application/json' ||
      mime === 'application/xml' ||
      textExts.includes(ext)
    );
  };

  useEffect(() => {
    if (!entry) return;
    if (isTextPreviewable(entry) && entry.Size <= 2 * 1024 * 1024) {
      setLoading(true);
      setError(null);
      const url = api.getDownloadUrl(remote, entry.Path, true);
      fetch(url)
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then((txt) => {
          setTextContent(txt);
        })
        .catch((err) => {
          setError(err.message || '加载文本预览失败');
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [remote, entry]);

  if (!entry) return null;

  const inlineUrl = api.getDownloadUrl(remote, entry.Path, true);
  const downloadUrl = api.getDownloadUrl(remote, entry.Path, false);
  const mime = entry.MimeType || '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-100 truncate">{entry.Name}</h3>
              <p className="text-xs text-slate-400 truncate">
                {remote === '@media' ? '/media' : `${remote}:`}/{entry.Path} •{' '}
                {formatBytes(entry.Size)} • {formatDateTime(entry.ModTime)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={downloadUrl}
              download={entry.Name}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              下载文件
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 bg-slate-950/60 flex items-center justify-center min-h-[320px]">
          {mime.startsWith('image/') ? (
            <img
              src={inlineUrl}
              alt={entry.Name}
              className="max-w-full max-h-[65vh] object-contain rounded-lg shadow-lg"
            />
          ) : mime.startsWith('video/') ? (
            <video src={inlineUrl} controls autoPlay className="max-w-full max-h-[65vh] rounded-lg" />
          ) : mime.startsWith('audio/') ? (
            <audio src={inlineUrl} controls autoPlay className="w-full max-w-md" />
          ) : isTextPreviewable(entry) ? (
            entry.Size > 2 * 1024 * 1024 ? (
              <div className="text-center text-slate-400 space-y-2">
                <p className="text-sm">该文本文件超过 2MB ({formatBytes(entry.Size)})，建议直接下载查看。</p>
              </div>
            ) : loading ? (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <Loader2 className="w-5 h-5 animate-spin text-sky-400" />
                正在读取文件内容...
              </div>
            ) : error ? (
              <div className="text-rose-400 text-sm">{error}</div>
            ) : (
              <pre className="w-full h-full max-h-[65vh] overflow-auto p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 whitespace-pre-wrap select-text leading-relaxed">
                {textContent || '(空文件)'}
              </pre>
            )
          ) : (
            <div className="text-center space-y-3 py-8">
              <p className="text-sm text-slate-300">
                暂不支持直接在线预览此格式 ({entry.MimeType || '未知格式'})
              </p>
              <a
                href={downloadUrl}
                download={entry.Name}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium"
              >
                <Download className="w-4 h-4" />
                立即下载 ({formatBytes(entry.Size)})
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
