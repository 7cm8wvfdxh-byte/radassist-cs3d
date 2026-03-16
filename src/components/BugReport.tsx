import { useState } from 'react';
import { getUser } from '../lib/logger';

interface BugReportProps {
  visible: boolean;
  onClose: () => void;
}

const CATEGORIES = [
  { id: 'crash', label: 'Uygulama çöktü / dondu' },
  { id: 'display', label: 'Görüntü düzgün yüklenmiyor' },
  { id: 'ai', label: 'AI analiz sorunu' },
  { id: 'tool', label: 'Araçlar çalışmıyor' },
  { id: 'ui', label: 'Arayüz / tasarım sorunu' },
  { id: 'other', label: 'Diğer' },
];

export default function BugReport({ visible, onClose }: BugReportProps) {
  const [category, setCategory] = useState('other');
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSend = async () => {
    if (!description.trim()) return;
    setSending(true);

    try {
      await fetch('/api/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: getUser(),
          category,
          description: description.trim(),
        }),
      });
      setSent(true);
      setTimeout(() => {
        onClose();
        setSent(false);
        setDescription('');
        setCategory('other');
      }, 2000);
    } catch {
      alert('Gönderim başarısız. İnternet bağlantınızı kontrol edin.');
    } finally {
      setSending(false);
    }
  };

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
    }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: '90vw', maxWidth: 380, padding: 24, borderRadius: 14,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
      }}>
        {sent ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--success)' }}>
              Rapor gönderildi, teşekkürler!
            </div>
          </div>
        ) : (
          <>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 16,
            }}>
              <h3 style={{
                fontSize: 15, fontWeight: 700,
                color: 'var(--text-primary)',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                🐛 Hata Bildir
              </h3>
              <button
                onClick={onClose}
                style={{
                  width: 28, height: 28, borderRadius: 6,
                  border: 'none', background: 'var(--bg-hover)',
                  color: 'var(--text-muted)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14,
                }}
              >
                ✕
              </button>
            </div>

            {/* Category */}
            <div style={{ marginBottom: 12 }}>
              <label style={{
                fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
                display: 'block', marginBottom: 6,
              }}>
                Kategori
              </label>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setCategory(c.id)}
                    style={{
                      padding: '5px 10px', borderRadius: 6,
                      border: `1px solid ${category === c.id ? 'var(--accent)' : 'var(--border)'}`,
                      background: category === c.id ? 'var(--accent-glow)' : 'transparent',
                      color: category === c.id ? 'var(--accent)' : 'var(--text-muted)',
                      fontSize: 11, cursor: 'pointer',
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom: 16 }}>
              <label style={{
                fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
                display: 'block', marginBottom: 6,
              }}>
                Açıklama
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ne oldu? Ne yaparken bu hatayı aldınız?"
                style={{
                  width: '100%', height: 100, padding: '10px 12px',
                  borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                  fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif",
                  resize: 'vertical', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <button
              onClick={handleSend}
              disabled={sending || !description.trim()}
              style={{
                width: '100%', padding: '10px 0', borderRadius: 8,
                border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, var(--accent), var(--accent-dim))',
                color: 'white', fontSize: 13, fontWeight: 600,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                opacity: sending || !description.trim() ? 0.5 : 1,
              }}
            >
              {sending ? 'Gönderiliyor...' : 'Gönder'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
