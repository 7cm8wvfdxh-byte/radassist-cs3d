import { useState } from 'react';
import { setUser, logLogin } from '../lib/logger';

interface PasswordGateProps {
  onAuthenticated: () => void;
}

export default function PasswordGate({ onAuthenticated }: PasswordGateProps) {
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const handleSubmit = async () => {
    if (!password.trim()) return;
    setChecking(true);
    setError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      });

      const data = await res.json();

      if (data.ok) {
        const userName = name.trim() || 'Anonim';
        setUser(userName);
        sessionStorage.setItem('ra_auth', '1');
        sessionStorage.setItem('ra_user', userName);
        logLogin();
        onAuthenticated();
      } else {
        setError('Yanlış şifre. Tekrar deneyin.');
      }
    } catch {
      setError('Bağlantı hatası.');
    } finally {
      setChecking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div style={{
      width: '100vw', height: '100vh',
      background: 'var(--bg-primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 360, padding: 32, borderRadius: 16,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        textAlign: 'center',
      }}>
        {/* Logo */}
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: 'linear-gradient(135deg, var(--accent), var(--purple))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 700, fontSize: 20, color: 'white',
          letterSpacing: -1,
        }}>
          RA
        </div>

        <h1 style={{
          fontSize: 20, fontWeight: 700,
          color: 'var(--text-primary)',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          marginBottom: 4,
        }}>
          RadAssist
        </h1>
        <p style={{
          fontSize: 13, color: 'var(--text-muted)',
          marginBottom: 24,
        }}>
          DICOM Viewer & AI Asistan — Beta Test
        </p>

        {/* Name input */}
        <input
          type="text"
          placeholder="Adınız (opsiyonel)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            fontSize: 14, fontFamily: "'Plus Jakarta Sans', sans-serif",
            outline: 'none', marginBottom: 10,
            boxSizing: 'border-box',
          }}
        />

        {/* Password input */}
        <input
          type="password"
          placeholder="Erişim şifresi"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8,
            border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}`,
            background: 'var(--bg-tertiary)',
            color: 'var(--text-primary)',
            fontSize: 14, fontFamily: "'Plus Jakarta Sans', sans-serif",
            outline: 'none', marginBottom: 6,
            boxSizing: 'border-box',
          }}
        />

        {error && (
          <div style={{
            fontSize: 12, color: 'var(--danger)',
            marginBottom: 8, textAlign: 'left',
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={checking || !password.trim()}
          style={{
            width: '100%', padding: '10px 0', borderRadius: 8,
            border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, var(--accent), var(--accent-dim))',
            color: 'white', fontSize: 14, fontWeight: 600,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            marginTop: 8,
            opacity: checking || !password.trim() ? 0.5 : 1,
          }}
        >
          {checking ? 'Kontrol ediliyor...' : 'Giriş Yap'}
        </button>
      </div>
    </div>
  );
}
