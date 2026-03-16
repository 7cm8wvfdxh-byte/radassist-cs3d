import { useState, useRef, useEffect } from 'react';
import { getUser } from '../lib/logger';

const ORGANS = [
  { id: 'general', label: 'Genel', icon: '🔍' },
  { id: 'brain', label: 'Beyin', icon: '🧠' },
  { id: 'spine', label: 'Omurga', icon: '🦴' },
  { id: 'chest', label: 'Göğüs', icon: '🫁' },
  { id: 'heart', label: 'Kalp', icon: '❤️' },
  { id: 'abdomen', label: 'Abdomen', icon: '🫃' },
  { id: 'liver', label: 'KC', icon: '🟤' },
  { id: 'kidney', label: 'Böbrek', icon: '🫘' },
  { id: 'pelvis', label: 'Pelvis', icon: '🦴' },
  { id: 'extremity', label: 'Ekst.', icon: '🦵' },
  { id: 'neck', label: 'Boyun', icon: '🔵' },
  { id: 'eye', label: 'Göz', icon: '👁️' },
];

interface MobileAppProps {
  onSwitchToDesktop: () => void;
}

type Step = 'capture' | 'review' | 'result';
type MediaType = 'image' | 'video';

export default function MobileApp(_props: MobileAppProps) {
  const [step, setStep] = useState<Step>('capture');
  const [mediaType, setMediaType] = useState<MediaType>('image');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [organ, setOrgan] = useState('general');
  const [analyzing, setAnalyzing] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const resultEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    resultEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- File handling ---
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    setMediaType(isVideo ? 'video' : 'image');
    setMediaUrl(URL.createObjectURL(file));
    setMediaFile(file);
    setStep('review');
    setMessages([]);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  // --- Image/frame to base64 ---
  const getBase64 = async (): Promise<string | null> => {
    try {
      if (mediaType === 'video' && videoRef.current) {
        const v = videoRef.current;
        const c = document.createElement('canvas');
        c.width = v.videoWidth || 640;
        c.height = v.videoHeight || 480;
        c.getContext('2d')!.drawImage(v, 0, 0);
        return c.toDataURL('image/png').split(',')[1];
      }
      if (mediaFile) {
        return new Promise((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve((r.result as string).split(',')[1]);
          r.onerror = () => resolve(null);
          r.readAsDataURL(mediaFile);
        });
      }
      return null;
    } catch {
      return null;
    }
  };

  // --- AI call ---
  const callAI = async (prompt: string, base64: string | null): Promise<string> => {
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          imageBase64: base64,
          systemPrompt: `Sen deneyimli bir radyolog asistanısın. Türkçe yanıt ver. Kısa ve net ol.
Tıbbi görüntüler için: Bulgular, olası tanı, öneriler.
Tıbbi olmayan görüntüler için: İçeriği açıkla.`,
        }),
      });
      const data = await res.json();
      return data.text || data.error || 'Yanıt alınamadı.';
    } catch (err) {
      return `Hata: ${(err as Error).message}`;
    }
  };

  const handleAnalyze = async () => {
    if (!mediaFile) return;
    setAnalyzing(true);
    setStep('result');

    const base64 = await getBase64();
    const organLabel = ORGANS.find((o) => o.id === organ)?.label || 'Genel';
    const mediaTag = mediaType === 'video' ? 'video karesi' : 'görüntü';

    const prompt = organ === 'general'
      ? `Bu ${mediaTag}yü analiz et. Sistematik rapor hazırla.`
      : `Bu ${mediaTag}de ${organLabel} bölgesine odaklanarak analiz et.`;

    const text = await callAI(prompt, base64);
    setMessages([{ role: 'ai', text }]);
    setAnalyzing(false);
  };

  const handleChat = async () => {
    if (!chatInput.trim() || !mediaFile) return;
    const msg = chatInput.trim();
    setChatInput('');
    setMessages((p) => [...p, { role: 'user', text: msg }]);
    setAnalyzing(true);

    const base64 = await getBase64();
    const text = await callAI(msg, base64);
    setMessages((p) => [...p, { role: 'ai', text }]);
    setAnalyzing(false);
  };

  const handleReset = () => {
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    setMediaUrl('');
    setMediaFile(null);
    setStep('capture');
    setMessages([]);
    setOrgan('general');
  };

  // ============ RENDER ============
  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      background: '#0a0a0c', color: '#e8e8ec',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
      overflow: 'hidden',
    }}>

      {/* ── HEADER ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 16px',
        borderBottom: '1px solid #1e1e24',
        background: '#111114', flexShrink: 0, zIndex: 5,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: 'linear-gradient(135deg,#3b82f6,#a855f7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: '#fff',
          fontFamily: "'JetBrains Mono',monospace",
        }}>RA</div>
        <span style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>RadAssist</span>
        {step !== 'capture' && (
          <button onClick={handleReset} style={{
            padding: '5px 12px', borderRadius: 8,
            border: '1px solid #2a2a35', background: 'transparent',
            color: '#9898a8', fontSize: 12, fontWeight: 600,
            fontFamily: 'inherit', cursor: 'pointer',
          }}>
            ← Yeni
          </button>
        )}
        <span style={{ fontSize: 10, color: '#606070', fontFamily: "'JetBrains Mono',monospace" }}>
          {getUser()}
        </span>
      </div>

      {/* ── STEP 1: CAPTURE ── */}
      {step === 'capture' && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: 24, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        }}>
          {/* Hidden inputs */}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment"
            style={{ display: 'none' }} onChange={handleFileSelect} />
          <input ref={galleryRef} type="file" accept="image/*,video/*,.dcm"
            style={{ display: 'none' }} onChange={handleFileSelect} />

          <div style={{ fontSize: 48, marginBottom: 16 }}>📷</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, textAlign: 'center' }}>
            Görüntü veya Video Yükle
          </h2>
          <p style={{ fontSize: 14, color: '#9898a8', marginBottom: 32, textAlign: 'center' }}>
            Fotoğraf çekin, galeriden seçin veya video yükleyin
          </p>

          <button onClick={() => cameraRef.current?.click()} style={{
            width: '100%', maxWidth: 320, padding: '15px 0', borderRadius: 12,
            border: 'none', background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
            color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit', marginBottom: 12,
          }}>
            📸 Fotoğraf Çek
          </button>

          <button onClick={() => galleryRef.current?.click()} style={{
            width: '100%', maxWidth: 320, padding: '15px 0', borderRadius: 12,
            border: '1px solid #2a2a35', background: '#19191e',
            color: '#e8e8ec', fontSize: 16, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>
            🖼️ Galeri / Video Seç
          </button>
        </div>
      )}

      {/* ── STEP 2: REVIEW ── */}
      {step === 'review' && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          overflowY: 'auto', WebkitOverflowScrolling: 'touch',
        }}>
          {/* Media preview */}
          <div style={{
            width: '100%', aspectRatio: '4/3', maxHeight: '50vh',
            background: '#000', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
          }}>
            {mediaType === 'image' ? (
              <img src={mediaUrl} alt="preview"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <video ref={videoRef} src={mediaUrl} controls playsInline
                style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            )}

            {/* Video frame capture hint */}
            {mediaType === 'video' && (
              <div style={{
                position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
                padding: '4px 12px', borderRadius: 8,
                background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                fontSize: 11, color: '#06b6d4', whiteSpace: 'nowrap',
              }}>
                İstediğin kareye gel → Analiz Et
              </div>
            )}
          </div>

          {/* Organ selector */}
          <div style={{ padding: '14px 16px' }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: '#9898a8',
              textTransform: 'uppercase', letterSpacing: '0.05em',
              marginBottom: 10,
            }}>
              Bölge / Organ Seç
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
            }}>
              {ORGANS.map((o) => (
                <button key={o.id} onClick={() => setOrgan(o.id)} style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 3,
                  padding: '10px 4px', borderRadius: 12,
                  border: `1.5px solid ${organ === o.id ? '#3b82f6' : '#1e1e24'}`,
                  background: organ === o.id ? 'rgba(59,130,246,0.15)' : '#111114',
                  color: organ === o.id ? '#60a5fa' : '#9898a8',
                  fontSize: 10, fontWeight: organ === o.id ? 700 : 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}>
                  <span style={{ fontSize: 22 }}>{o.icon}</span>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Analyze button — sticky bottom */}
          <div style={{
            padding: '12px 16px', marginTop: 'auto',
            borderTop: '1px solid #1e1e24', background: '#0a0a0c',
            position: 'sticky', bottom: 0, flexShrink: 0,
          }}>
            <button onClick={handleAnalyze} style={{
              width: '100%', padding: '15px 0', borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
              color: '#fff', fontSize: 16, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              🔬 {mediaType === 'video' ? 'Bu Kareyi ' : ''}Analiz Et
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: RESULT ── */}
      {step === 'result' && (
        <>
          {/* Compact header with thumbnail */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 16px', background: '#111114',
            borderBottom: '1px solid #1e1e24', flexShrink: 0,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: 8,
              overflow: 'hidden', background: '#19191e', flexShrink: 0,
            }}>
              {mediaType === 'image'
                ? <img src={mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🎬</div>
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8ec' }}>
                {ORGANS.find((o) => o.id === organ)?.icon}{' '}
                {ORGANS.find((o) => o.id === organ)?.label} Analizi
              </div>
              <div style={{ fontSize: 11, color: '#606070' }}>
                {analyzing ? 'Analiz ediliyor...' : `${messages.filter(m => m.role === 'ai').length} yanıt`}
              </div>
            </div>
          </div>

          {/* Scrollable messages area */}
          <div style={{
            flex: 1, overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            padding: 16,
            minHeight: 0, /* critical for flex scroll */
          }}>
            {analyzing && messages.length === 0 && (
              <div style={{
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                padding: 40, gap: 12, color: '#606070',
              }}>
                <div style={{
                  width: 24, height: 24,
                  border: '2.5px solid #2a2a35', borderTopColor: '#3b82f6',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                }} />
                <span style={{ fontSize: 13 }}>Gemini analiz ediyor...</span>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{
                marginBottom: 12,
                ...(m.role === 'user' ? {
                  marginLeft: 40,
                  padding: '10px 14px', borderRadius: '14px 14px 4px 14px',
                  background: 'rgba(59,130,246,0.12)',
                  border: '1px solid rgba(59,130,246,0.2)',
                  color: '#60a5fa', fontSize: 14, fontWeight: 500,
                } : {
                  padding: 14, borderRadius: 14,
                  background: '#111114', border: '1px solid #1e1e24',
                  fontSize: 14, lineHeight: 1.7, color: '#e8e8ec',
                }),
              }}>
                {m.role === 'ai' && (
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: '#3b82f6',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    marginBottom: 8,
                  }}>
                    Gemini 2.5 Flash
                  </div>
                )}
                {m.text.split('\n').map((line, j) => (
                  <p key={j} style={{ margin: '3px 0' }}>{line}</p>
                ))}
              </div>
            ))}

            {analyzing && messages.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
                <div style={{
                  width: 20, height: 20,
                  border: '2px solid #2a2a35', borderTopColor: '#3b82f6',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                }} />
              </div>
            )}
            <div ref={resultEndRef} />
          </div>

          {/* Chat input — fixed bottom */}
          <div style={{
            display: 'flex', gap: 8, padding: '10px 16px',
            borderTop: '1px solid #1e1e24', background: '#111114',
            flexShrink: 0,
          }}>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleChat()}
              placeholder="Takip sorusu sor..."
              disabled={analyzing}
              style={{
                flex: 1, padding: '12px 14px', borderRadius: 12,
                border: '1px solid #1e1e24', background: '#19191e',
                color: '#e8e8ec', fontSize: 16, /* 16px prevents iOS zoom */
                fontFamily: 'inherit', outline: 'none',
              }}
            />
            <button
              onClick={handleChat}
              disabled={analyzing || !chatInput.trim()}
              style={{
                width: 46, height: 46, borderRadius: 12, border: 'none',
                background: '#3b82f6', color: '#fff', fontSize: 20,
                cursor: 'pointer', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: analyzing || !chatInput.trim() ? 0.4 : 1,
              }}
            >
              ➤
            </button>
          </div>
        </>
      )}
    </div>
  );
}
