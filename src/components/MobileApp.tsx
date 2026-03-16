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

interface CapturedFrame {
  id: string;
  thumbnailUrl: string;
  base64: string;
  timestamp: number; // video seconds
  selected: boolean;
}

type Step = 'capture' | 'review' | 'frames' | 'result';
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
  const [frames, setFrames] = useState<CapturedFrame[]>([]);
  const [analyzeMode, setAnalyzeMode] = useState<'single' | 'multi'>('single');

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const resultEndRef = useRef<HTMLDivElement>(null);
  const framesStripRef = useRef<HTMLDivElement>(null);

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
    setFrames([]);
    e.target.value = '';
  };

  // --- Capture a frame from video ---
  const captureFrame = () => {
    const v = videoRef.current;
    if (!v) return;

    const c = document.createElement('canvas');
    c.width = v.videoWidth || 640;
    c.height = v.videoHeight || 480;
    c.getContext('2d')!.drawImage(v, 0, 0);

    const base64 = c.toDataURL('image/png').split(',')[1];
    const thumbnailUrl = c.toDataURL('image/jpeg', 0.6);
    const timestamp = v.currentTime;

    const newFrame: CapturedFrame = {
      id: `f_${Date.now()}`,
      thumbnailUrl,
      base64,
      timestamp,
      selected: true,
    };

    setFrames((prev) => [...prev, newFrame]);

    // Scroll strip to end
    setTimeout(() => {
      framesStripRef.current?.scrollTo({
        left: framesStripRef.current.scrollWidth,
        behavior: 'smooth',
      });
    }, 100);
  };

  // --- Toggle frame selection ---
  const toggleFrame = (id: string) => {
    setFrames((prev) =>
      prev.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f))
    );
  };

  // --- Remove a frame ---
  const removeFrame = (id: string) => {
    setFrames((prev) => prev.filter((f) => f.id !== id));
  };

  // --- Get base64 for current view ---
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

  // --- Analyze single image or current video frame ---
  const handleAnalyzeSingle = async () => {
    if (!mediaFile) return;
    setAnalyzing(true);
    setAnalyzeMode('single');
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

  // --- Analyze multiple captured frames ---
  const handleAnalyzeMulti = async () => {
    const selected = frames.filter((f) => f.selected);
    if (selected.length === 0) return;

    setAnalyzing(true);
    setAnalyzeMode('multi');
    setStep('result');

    const organLabel = ORGANS.find((o) => o.id === organ)?.label || 'Genel';
    const newMessages: { role: string; text: string }[] = [];

    // Analyze each frame
    for (let i = 0; i < selected.length; i++) {
      const frame = selected[i];
      const frameNum = i + 1;
      const totalFrames = selected.length;
      const timeStr = formatTime(frame.timestamp);

      newMessages.push({
        role: 'user',
        text: `📸 Kare ${frameNum}/${totalFrames} (${timeStr})`,
      });
      setMessages([...newMessages]);

      const prompt = selected.length === 1
        ? (organ === 'general'
            ? 'Bu video karesini analiz et. Sistematik rapor hazırla.'
            : `Bu video karesinde ${organLabel} bölgesine odaklanarak analiz et.`)
        : (organ === 'general'
            ? `Bu videodan seçilen ${totalFrames} kareden ${frameNum}. kareyi analiz et (zaman: ${timeStr}). Bulguları raporla.`
            : `Bu videodan seçilen ${totalFrames} kareden ${frameNum}. karede ${organLabel} bölgesini analiz et (zaman: ${timeStr}).`);

      const text = await callAI(prompt, frame.base64);
      newMessages.push({ role: 'ai', text });
      setMessages([...newMessages]);
    }

    // If multiple frames, add comparison summary
    if (selected.length > 1) {
      newMessages.push({
        role: 'user',
        text: `📊 ${selected.length} kare karşılaştırması`,
      });
      setMessages([...newMessages]);

      const summaryPrompt = `${selected.length} farklı video karesini analiz ettim. Yukarıdaki tüm bulgularımı karşılaştırarak kısa bir özet ve genel değerlendirme yap. Kareler arası farklılıklar veya tutarlı bulgular varsa belirt.`;
      const summary = await callAI(summaryPrompt, selected[0].base64);
      newMessages.push({ role: 'ai', text: summary });
      setMessages([...newMessages]);
    }

    setAnalyzing(false);
  };

  // --- Chat follow-up ---
  const handleChat = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput('');
    setMessages((p) => [...p, { role: 'user', text: msg }]);
    setAnalyzing(true);

    // Use first selected frame or current image
    let base64: string | null = null;
    const selectedFrames = frames.filter((f) => f.selected);
    if (selectedFrames.length > 0) {
      base64 = selectedFrames[0].base64;
    } else {
      base64 = await getBase64();
    }

    const text = await callAI(msg, base64);
    setMessages((p) => [...p, { role: 'ai', text }]);
    setAnalyzing(false);
  };

  const handleReset = () => {
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    frames.forEach((f) => {
      if (f.thumbnailUrl.startsWith('data:')) return;
      URL.revokeObjectURL(f.thumbnailUrl);
    });
    setMediaUrl('');
    setMediaFile(null);
    setStep('capture');
    setMessages([]);
    setFrames([]);
    setOrgan('general');
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const selectedCount = frames.filter((f) => f.selected).length;

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
          }}>← Yeni</button>
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

          <button onClick={() => cameraRef.current?.click()} style={btnPrimary}>
            📸 Fotoğraf Çek
          </button>
          <button onClick={() => galleryRef.current?.click()} style={btnSecondary}>
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
            width: '100%', aspectRatio: '4/3', maxHeight: '45vh',
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
          </div>

          {/* Video: frame capture bar */}
          {mediaType === 'video' && (
            <div style={{
              padding: '10px 16px',
              borderBottom: '1px solid #1e1e24',
              background: '#111114', flexShrink: 0,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: frames.length > 0 ? 10 : 0,
              }}>
                <button onClick={captureFrame} style={{
                  padding: '10px 20px', borderRadius: 10, border: 'none',
                  background: '#06b6d4', color: '#fff',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  📸 Kare Yakala
                </button>
                {frames.length > 0 && (
                  <span style={{ fontSize: 12, color: '#06b6d4', fontWeight: 600 }}>
                    {frames.length} kare yakalandı
                  </span>
                )}
              </div>

              {/* Captured frames strip */}
              {frames.length > 0 && (
                <div ref={framesStripRef} style={{
                  display: 'flex', gap: 8, overflowX: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  paddingBottom: 4,
                }}>
                  {frames.map((f, i) => (
                    <div key={f.id} style={{
                      position: 'relative', flexShrink: 0,
                      width: 72, borderRadius: 8, overflow: 'hidden',
                      border: `2px solid ${f.selected ? '#3b82f6' : '#1e1e24'}`,
                      opacity: f.selected ? 1 : 0.5,
                    }}>
                      <img
                        src={f.thumbnailUrl} alt={`Kare ${i + 1}`}
                        style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }}
                        onClick={() => toggleFrame(f.id)}
                      />
                      {/* Time badge */}
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        padding: '2px 0', textAlign: 'center',
                        background: 'rgba(0,0,0,0.7)',
                        fontSize: 9, color: '#9898a8',
                        fontFamily: "'JetBrains Mono',monospace",
                      }}>
                        {formatTime(f.timestamp)}
                      </div>
                      {/* Selection check */}
                      {f.selected && (
                        <div style={{
                          position: 'absolute', top: 2, right: 2,
                          width: 18, height: 18, borderRadius: 9,
                          background: '#3b82f6', color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700,
                        }}>✓</div>
                      )}
                      {/* Remove button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeFrame(f.id); }}
                        style={{
                          position: 'absolute', top: 2, left: 2,
                          width: 18, height: 18, borderRadius: 9,
                          background: 'rgba(239,68,68,0.8)', color: '#fff',
                          border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9,
                        }}
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Organ selector */}
          <div style={{ padding: '14px 16px' }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: '#9898a8',
              textTransform: 'uppercase', letterSpacing: '0.05em',
              marginBottom: 10,
            }}>Bölge / Organ Seç</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {ORGANS.map((o) => (
                <button key={o.id} onClick={() => setOrgan(o.id)} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  padding: '10px 4px', borderRadius: 12,
                  border: `1.5px solid ${organ === o.id ? '#3b82f6' : '#1e1e24'}`,
                  background: organ === o.id ? 'rgba(59,130,246,0.15)' : '#111114',
                  color: organ === o.id ? '#60a5fa' : '#9898a8',
                  fontSize: 10, fontWeight: organ === o.id ? 700 : 500,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>
                  <span style={{ fontSize: 22 }}>{o.icon}</span>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons — sticky bottom */}
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid #1e1e24', background: '#0a0a0c',
            position: 'sticky', bottom: 0, flexShrink: 0,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            {/* Single frame / image analyze */}
            <button onClick={handleAnalyzeSingle} style={{
              width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
              color: '#fff', fontSize: 15, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              🔬 {mediaType === 'video' ? 'Mevcut Kareyi ' : ''}Analiz Et
            </button>

            {/* Multi-frame analyze — only if video with captured frames */}
            {mediaType === 'video' && frames.length > 0 && (
              <button
                onClick={handleAnalyzeMulti}
                disabled={selectedCount === 0}
                style={{
                  width: '100%', padding: '14px 0', borderRadius: 12,
                  border: '1.5px solid #06b6d4', background: 'rgba(6,182,212,0.1)',
                  color: '#06b6d4', fontSize: 15, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                  opacity: selectedCount === 0 ? 0.4 : 1,
                }}
              >
                📊 {selectedCount} Kareyi Toplu Analiz Et
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── STEP 3: RESULT ── */}
      {step === 'result' && (
        <>
          {/* Compact header */}
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
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {ORGANS.find((o) => o.id === organ)?.icon}{' '}
                {ORGANS.find((o) => o.id === organ)?.label} Analizi
              </div>
              <div style={{ fontSize: 11, color: '#606070' }}>
                {analyzing
                  ? 'Analiz ediliyor...'
                  : analyzeMode === 'multi'
                    ? `${selectedCount} kare analiz edildi`
                    : 'Tamamlandı'}
              </div>
            </div>
          </div>

          {/* Multi-frame: thumbnail strip at top of results */}
          {analyzeMode === 'multi' && frames.filter((f) => f.selected).length > 1 && (
            <div style={{
              display: 'flex', gap: 6, padding: '8px 16px',
              overflowX: 'auto', WebkitOverflowScrolling: 'touch',
              borderBottom: '1px solid #1e1e24', flexShrink: 0,
            }}>
              {frames.filter((f) => f.selected).map((f, i) => (
                <div key={f.id} style={{
                  width: 52, flexShrink: 0, borderRadius: 6,
                  overflow: 'hidden', border: '1px solid #2a2a35',
                  position: 'relative',
                }}>
                  <img src={f.thumbnailUrl} alt=""
                    style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    textAlign: 'center', background: 'rgba(0,0,0,0.7)',
                    fontSize: 8, color: '#9898a8', padding: '1px 0',
                  }}>#{i + 1}</div>
                </div>
              ))}
            </div>
          )}

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            padding: 16, minHeight: 0,
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
                  }}>Gemini 2.5 Flash</div>
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

          {/* Chat input */}
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
                color: '#e8e8ec', fontSize: 16,
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
            >➤</button>
          </div>
        </>
      )}
    </div>
  );
}

// Shared button styles
const btnPrimary: React.CSSProperties = {
  width: '100%', maxWidth: 320, padding: '15px 0', borderRadius: 12,
  border: 'none', background: 'linear-gradient(135deg,#3b82f6,#2563eb)',
  color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer',
  fontFamily: "'Plus Jakarta Sans',sans-serif", marginBottom: 12,
};
const btnSecondary: React.CSSProperties = {
  width: '100%', maxWidth: 320, padding: '15px 0', borderRadius: 12,
  border: '1px solid #2a2a35', background: '#19191e',
  color: '#e8e8ec', fontSize: 16, fontWeight: 600, cursor: 'pointer',
  fontFamily: "'Plus Jakarta Sans',sans-serif",
};
