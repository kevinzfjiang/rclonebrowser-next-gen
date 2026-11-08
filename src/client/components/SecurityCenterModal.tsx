import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Lock,
  LogOut,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Unlock,
  X,
} from 'lucide-react';
import { api, setAuthToken } from '../api';
import { useI18n } from '../i18n';

interface SecurityCenterModalProps {
  isOpen: boolean;
  forcedFirstLogin: boolean;
  currentUsername: string;
  authRequired: boolean;
  recentLoginPassword?: string;
  onClose: () => void;
  onUpdated: (result: {
    username: string;
    authRequired: boolean;
    mustChangePassword: boolean;
  }) => void;
  onLogout: () => void;
  onNotify: (text: string, type?: 'success' | 'error' | 'info') => void;
}

export const SecurityCenterModal: React.FC<SecurityCenterModalProps> = ({
  isOpen,
  forcedFirstLogin,
  currentUsername,
  authRequired,
  recentLoginPassword,
  onClose,
  onUpdated,
  onLogout,
  onNotify,
}) => {
  const { tr } = useI18n();

  const [username, setUsername] = useState(currentUsername || 'admin');
  const [authEnabled, setAuthEnabled] = useState<boolean>(authRequired);
  const [currentPassword, setCurrentPassword] = useState(recentLoginPassword || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setUsername(currentUsername || 'admin');
      setAuthEnabled(forcedFirstLogin ? true : authRequired);
      setCurrentPassword(recentLoginPassword || '');
      setNewPassword('');
      setConfirmPassword('');
      setError(null);
    }
  }, [isOpen, currentUsername, authRequired, forcedFirstLogin, recentLoginPassword]);

  if (!isOpen) return null;

  const requiresNewPassword = forcedFirstLogin && authEnabled;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (authRequired && !currentPassword.trim()) {
      setError(
        tr(
          '请输入当前管理员密码以验证身份',
          '請輸入目前管理員密碼以驗證身份',
          'Please enter your current password to verify identity'
        )
      );
      return;
    }

    if (requiresNewPassword && !newPassword) {
      setError(
        tr(
          '首次登录必须设置新的管理员密码',
          '首次登入必須設定新的管理員密碼',
          'You must set a new administrator password on first login'
        )
      );
      return;
    }

    if (!authRequired && authEnabled && !newPassword && !currentPassword) {
      setError(
        tr(
          '重新启用密码保护时，请设置新密码',
          '重新啟用密碼保護時，請設定新密碼',
          'Please enter a new password when re-enabling authentication'
        )
      );
      return;
    }

    if (newPassword) {
      if (newPassword.length < 6) {
        setError(
          tr(
            '新密码长度不能少于 6 位字符',
            '新密碼長度不能少於 6 位字元',
            'New password must be at least 6 characters long'
          )
        );
        return;
      }
      if (newPassword !== confirmPassword) {
        setError(
          tr(
            '两次输入的新密码不一致',
            '兩次輸入的新密碼不一致',
            'New password and confirmation do not match'
          )
        );
        return;
      }
      if (forcedFirstLogin && currentPassword && newPassword === currentPassword) {
        setError(
          tr(
            '新密码不能与初始临时密码相同',
            '新密碼不能與初始臨時密碼相同',
            'New password cannot be the same as the initial temporary password'
          )
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await api.updateSecurity({
        currentPassword: currentPassword || undefined,
        newUsername: username.trim(),
        newPassword: newPassword || undefined,
        authEnabled,
      });

      setAuthToken(res.token);
      onUpdated({
        username: res.username,
        authRequired: res.authRequired,
        mustChangePassword: res.mustChangePassword,
      });
      onNotify(
        tr(
          '安全设置已更新并持久化至 /config/auth.json',
          '安全設定已更新並持久化至 /config/auth.json',
          'Security settings updated and saved to /config/auth.json'
        ),
        'success'
      );
      onClose();
    } catch (err: any) {
      setError(
        err.message ||
          tr('更新安全设置失败', '更新安全設定失敗', 'Failed to update security settings')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/60 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${
                forcedFirstLogin
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
              }`}
            >
              {forcedFirstLogin ? (
                <KeyRound className="w-5 h-5" />
              ) : (
                <Shield className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                {forcedFirstLogin
                  ? tr(
                      '首次登录 — 请修改初始管理员密码',
                      '首次登入 — 請修改初始管理員密碼',
                      'First Login — Change Initial Password'
                    )
                  : tr(
                      '安全与认证中心 (Security Center)',
                      '安全與驗證中心 (Security Center)',
                      'Security & Authentication Center'
                    )}
              </h2>
              <p className="text-[11px] text-slate-400">
                {forcedFirstLogin
                  ? tr(
                      '出于安全考虑，请立即替换控制台生成的初始随机密码',
                      '出於安全考量，請立即替換主控台產生的初始隨機密碼',
                      'For security, please replace the console-generated initial password now'
                    )
                  : tr(
                      '密码采用 Scrypt 加盐哈希存储于 /config/auth.json，告别明文环境变量',
                      '密碼採用 Scrypt 加鹽雜湊儲存於 /config/auth.json，告別明文環境變數',
                      'Salted scrypt hash stored in /config/auth.json — no plaintext env vars'
                    )}
              </p>
            </div>
          </div>

          {!forcedFirstLogin ? (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onLogout}
              title={tr('退出登录', '登出', 'Sign Out')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-400 hover:text-rose-400"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{tr('退出', '登出', 'Sign Out')}</span>
            </button>
          )}
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {forcedFirstLogin && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-950/30 border border-amber-700/50 text-amber-200">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1 text-[11px] leading-relaxed">
                <p className="font-semibold">
                  {tr(
                    '您正在使用容器首次启动生成的临时随机密码登录。',
                    '您正在使用容器首次啟動產生的臨時隨機密碼登入。',
                    'You signed in using the one-time initial password from container logs.'
                  )}
                </p>
                <p className="text-amber-300/90">
                  {tr(
                    '设置新密码后，初始密码将立即失效，且新密码仅以 Scrypt 加密哈希形式保存在 /config/auth.json 中。',
                    '設定新密碼後，初始密碼將立即失效，且新密碼僅以 Scrypt 加密雜湊形式保存在 /config/auth.json 中。',
                    'Once updated, the initial password is invalidated and only the salted scrypt hash is saved in /config/auth.json.'
                  )}
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300">
              {error}
            </div>
          )}

          {/* Authentication Mode Toggle */}
          <div>
            <label className="block text-slate-300 font-medium mb-2">
              {tr('访问认证模式', '存取驗證模式', 'Authentication Mode')}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setAuthEnabled(true)}
                className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                  authEnabled
                    ? 'bg-sky-600/15 border-sky-500 text-slate-100 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <ShieldCheck
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    authEnabled ? 'text-sky-400' : 'text-slate-500'
                  }`}
                />
                <div>
                  <div className="font-semibold text-xs">
                    {tr('启用登录密码保护', '啟用登入密碼保護', 'Password Protected')}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {tr(
                      '推荐：访问 Web 控制台需验证密码',
                      '推薦：存取 Web 控制台需驗證密碼',
                      'Recommended: Require login to access UI'
                    )}
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setAuthEnabled(false)}
                className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                  !authEnabled
                    ? 'bg-amber-500/15 border-amber-500/80 text-slate-100 shadow-sm'
                    : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Unlock
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    !authEnabled ? 'text-amber-400' : 'text-slate-500'
                  }`}
                />
                <div>
                  <div className="font-semibold text-xs">
                    {tr('免密直连模式', '免密直連模式', 'Passwordless LAN Mode')}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {tr(
                      '仅限受信任家庭内网：无需密码直接进入',
                      '僅限受信任家庭內網：無需密碼直接進入',
                      'Trusted home LAN only: Open access'
                    )}
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Administrator Username */}
          <div>
            <label className="block text-slate-300 font-medium mb-1">
              {tr('管理员用户名', '管理員使用者名稱', 'Administrator Username')}
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Current Password (shown if authRequired is currently true and not already pre-filled by immediate first login) */}
          {authRequired && !(forcedFirstLogin && recentLoginPassword) && (
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                {forcedFirstLogin
                  ? tr('初始临时密码 (当前密码)', '初始臨時密碼 (目前密碼)', 'Initial Temporary Password')
                  : tr('当前管理员密码', '目前管理員密碼', 'Current Password')}
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={tr(
                  '输入当前密码以验证身份',
                  '輸入目前密碼以驗證身份',
                  'Enter current password to verify'
                )}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </div>
          )}

          {/* New Password Fields (shown when authEnabled is true) */}
          {authEnabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  {requiresNewPassword || !authRequired
                    ? tr('新管理员密码 *', '新管理員密碼 *', 'New Password *')
                    : tr('新密码 (留空则不修改)', '新密碼 (留空則不修改)', 'New Password (optional)')}
                </label>
                <input
                  type="password"
                  required={requiresNewPassword || !authRequired}
                  autoFocus={forcedFirstLogin}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={tr('至少 6 位字符', '至少 6 位字元', 'At least 6 characters')}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  {tr('确认新密码', '確認新密碼', 'Confirm New Password')}
                </label>
                <input
                  type="password"
                  required={Boolean(newPassword) || requiresNewPassword || !authRequired}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={tr('再次输入新密码', '再次輸入新密碼', 'Re-enter new password')}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>
          )}

          {/* CLI Reset Tip */}
          {!forcedFirstLogin && (
            <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1.5 text-[11px] text-slate-400">
              <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                <Terminal className="w-3.5 h-3.5 text-sky-400" />
                <span>
                  {tr(
                    '忘记密码如何重置？(Docker CLI 一键重置)',
                    '忘記密碼如何重置？(Docker CLI 一鍵重置)',
                    'Forgot password? Reset via Docker CLI:'
                  )}
                </span>
              </div>
              <code className="block font-mono text-[10px] text-sky-300 bg-slate-900 px-2.5 py-1.5 rounded border border-slate-800 select-all">
                docker exec -it rclonebrowser-next node dist/server/reset-password.js
              </code>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
            {!forcedFirstLogin && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-colors"
              >
                {tr('取消', '取消', 'Cancel')}
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold transition-colors shadow"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {submitting
                  ? tr('正在保存...', '正在儲存...', 'Saving...')
                  : forcedFirstLogin
                    ? tr('保存新密码并进入系统', '儲存新密碼並進入系統', 'Save Password & Continue')
                    : tr('保存安全设置', '儲存安全設定', 'Save Security Settings')}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
