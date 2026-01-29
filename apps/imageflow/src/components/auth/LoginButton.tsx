import { useCallback, useRef, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { loginWithGoogle, logout, isGoogleAuthAvailable } from '../../services/googleAuth';
import { useUiStore } from '../../store';

export function LoginButton() {
  const user = useAuthStore((s) => s.user);
  const showToast = useUiStore((s) => s.showToast);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleLogin = useCallback(async () => {
    setSigningIn(true);
    try {
      await loginWithGoogle();
      showToast('success', 'Signed in to Google', 2000);
    } catch (err: any) {
      if (err?.message !== 'OAuth error') {
        showToast('error', err?.message || 'Sign-in failed', 3000);
      }
    } finally {
      setSigningIn(false);
    }
  }, [showToast]);

  const handleLogout = useCallback(() => {
    logout();
    setMenuOpen(false);
    showToast('info', 'Signed out', 2000);
  }, [showToast]);

  if (!isGoogleAuthAvailable()) return null;

  if (!user) {
    return (
      <button
        onClick={handleLogin}
        disabled={signingIn}
        className="px-3 py-1.5 text-xs font-medium rounded bg-editor-surface-light text-editor-text-dim hover:text-editor-text transition-colors flex items-center gap-1.5 disabled:opacity-50"
        title="Sign in with Google"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        {signingIn ? 'Signing in...' : 'Sign in'}
      </button>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        onBlur={(e) => {
          if (!menuRef.current?.contains(e.relatedTarget as Node)) {
            setMenuOpen(false);
          }
        }}
        className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-editor-surface-light transition-colors"
        title={user.email}
      >
        <img
          src={user.picture}
          alt=""
          className="w-6 h-6 rounded-full"
          referrerPolicy="no-referrer"
        />
        <span className="text-xs text-editor-text-dim max-w-[80px] truncate">
          {user.name.split(' ')[0]}
        </span>
      </button>
      {menuOpen && (
        <div className="absolute top-full right-0 mt-1 bg-editor-surface border border-editor-border rounded shadow-lg py-1 min-w-[160px] z-50">
          <div className="px-3 py-1.5 text-xs text-editor-text-dim border-b border-editor-border">
            {user.email}
          </div>
          <button
            className="w-full px-3 py-1.5 text-sm text-left text-editor-text hover:bg-editor-surface-light"
            onClick={handleLogout}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
