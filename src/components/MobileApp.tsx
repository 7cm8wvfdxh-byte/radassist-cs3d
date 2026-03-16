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

export default function MobileApp(_props: MobileAppProps) {
  const [step, setStep] = useState<Step>('capture');
  const [image, setImage] = useState<{ url: string; file: File } | null>(null);
  const [organ, setOrgan] = useState('general');
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const resultEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    resultEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, result]);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImage({ url: URL.createObjectURL(file), file });
    setStep('review');
    setResult('');
    setMessages([]);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const callAI = async (prompt: string, imageBase64: string | null): Promise<string> => {
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          imageBase64,
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
    if (!image) return;
    setAnalyzing(true);
    setStep('result');

    const base64 = await fileToBase64(image.file);
    const organLabel = ORGANS.find((o) => o.id === organ)?.label || 'Genel';

    const prompt = organ === 'general'
      ? 'Bu tıbbi görüntüyü analiz et. Sistematik rapor hazırla.'
      : `Bu görüntüde ${organLabel} bölgesine odaklanarak analiz et. Bulguları değerlendir.`;

    const text = await callAI(prompt, base64);
    setResult(text);
    setMessages([{ role: 'ai', text }]);
    setAnalyzing(false);
  };

  const handleChat = async () => {
    if (!chatInput.trim() || !image) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);

    setAnalyzing(true);
    const base64 = await fileToBase64(image.file);
    const text = await callAI(userMsg, base64);
    setMessages((prev) => [...prev, { role: 'ai', text }]);
    setAnalyzing(false);
  };

  const handleReset = () => {
    if (image) URL.revokeObjectURL(image.url);
    setImage(null);
    setStep('capture');
    setResult('');
    setMessages([]);
    setOrgan('general');
  };

  return (
    <div style={S.root}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.logo}>RA</div>
        <span style={S.title}>RadAssist</span>
        <div style={{ flex: 1 }} />
        <span style={S.user}>{getUser()}</span>
      </div>

      {/* STEP 1: CAPTURE */}
      {step === 'capture' && (
        <div style={S.captureScreen}>
          {/* Hidden inputs */}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleCapture} />
          <input ref={galleryRef} type="file" accept="image/*,video/*,.dcm" multiple style={{ display: 'none' }} onChange={handleCapture} />

          <div style={S.captureContent}>
            <div style={S.captureIcon}>📷</div>
            <h2 style={S.captureTitle}>Görüntü Yükle</h2>
            <p style={S.captureDesc}>Fotoğraf çekin veya galeriden seçin</p>

            <button style={S.cameraBtn} onClick={() => cameraRef.current?.click()}>
              📸 Fotoğraf Çek
            </button>
            <button style={S.galleryBtn} onClick={() => galleryRef.current?.click()}>
              🖼️ Galeriden Seç
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: REVIEW — pick organ + analyze */}
      {step === 'review' && image && (
        <div style={S.reviewScreen}>
          {/* Image preview */}
          <div style={S.imagePreview}>
            <img src={image.url} alt="preview" style={S.previewImg} />
            <button style={S.changeBtn} onClick={handleReset}>✕</button>
          </div>

          {/* Organ selector */}
          <div style={S.organSection}>
            <div style={S.organLabel}>Bölge seç:</div>
            <div style={S.organGrid}>
              {ORGANS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setOrgan(o.id)}
                  style={{
                    ...S.organBtn,
                    background: organ === o.id ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.05)',
                    borderColor: organ === o.id ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                    color: organ === o.id ? '#60a5fa' : '#9898a8',
                  }}
                >
                  <span style={{ fontSize: 20 }}>{o.icon}</span>
                  <span style={{ fontSize: 10 }}>{o.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Analyze button */}
          <button style={S.analyzeBtn} onClick={handleAnalyze}>
            🔬 Analiz Et
          </button>
        </div>
      )}

      {/* STEP 3: RESULT */}
      {step === 'result' && (
        <div style={S.resultScreen}>
          {/* Compact image top bar */}
          <div style={S.resultHeader}>
            <div style={S.resultThumb}>
              {image && <img src={image.url} alt="" style={S.thumbImg} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e8e8ec' }}>
                {ORGANS.find((o) => o.id === organ)?.icon} {ORGANS.find((o) => o.id === organ)?.label} Analizi
              </div>
              <div style={{ fontSize: 11, color: '#606070' }}>
                {analyzing ? 'Analiz ediliyor...' : 'Tamamlandı'}
              </div>
            </div>
            <button style={S.newBtn} onClick={handleReset}>
              + Yeni
            </button>
          </div>

          {/* Messages */}
          <div style={S.resultBody}>
            {analyzing && messages.length === 0 && (
              <div style={S.loadingMsg}>
                <div style={S.spinner} />
                <span>Gemini analiz ediyor...</span>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={m.role === 'user' ? S.userMsg : S.aiMsg}>
                {m.role === 'ai' && <div style={S.aiMsgLabel}>Gemini 2.5 Flash</div>}
                {m.text.split('\n').map((line, j) => (
                  <p key={j} style={{ margin: '4px 0' }}>{line}</p>
                ))}
              </div>
            ))}

            {analyzing && messages.length > 0 && (
              <div style={S.loadingMsg}>
                <div style={S.spinner} />
              </div>
            )}
            <div ref={resultEndRef} />
          </div>

          {/* Chat input */}
          <div style={S.chatBar}>
            <input
              style={S.chatInput}
              placeholder="Takip sorusu sor..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleChat()}
              disabled={analyzing}
            />
            <button
              style={{ ...S.sendBtn, opacity: analyzing || !chatInput.trim() ? 0.4 : 1 }}
              onClick={handleChat}
              disabled={analyzing || !chatInput.trim()}
            >
              ➤
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Styles
const S: Record<string, React.CSSProperties> = {
  root: {
    width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
    background: '#0a0a0c', color: '#e8e8ec', fontFamily: "'Plus Jakarta Sans', sans-serif",
    overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 16px', borderBottom: '1px solid #2a2a35',
    background: '#111114', flexShrink: 0,
  },
  logo: {
    width: 30, height: 30, borderRadius: 8,
    background: 'linear-gradient(135deg, #3b82f6, #a855f7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 700, color: 'white',
    fontFamily: "'JetBrains Mono', monospace",
  },
  title: { fontSize: 16, fontWeight: 700 },
  user: { fontSize: 11, color: '#606070', fontFamily: "'JetBrains Mono', monospace" },

  // Capture
  captureScreen: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  captureContent: {
    textAlign: 'center', padding: 24, width: '100%', maxWidth: 320,
  },
  captureIcon: { fontSize: 48, marginBottom: 16 },
  captureTitle: { fontSize: 20, fontWeight: 700, marginBottom: 6 },
  captureDesc: { fontSize: 14, color: '#9898a8', marginBottom: 28 },
  cameraBtn: {
    width: '100%', padding: '14px 0', borderRadius: 12, border: 'none',
    background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
    color: 'white', fontSize: 16, fontWeight: 600, cursor: 'pointer',
    fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 12,
  },
  galleryBtn: {
    width: '100%', padding: '14px 0', borderRadius: 12,
    border: '1px solid #2a2a35', background: '#19191e',
    color: '#e8e8ec', fontSize: 16, fontWeight: 600, cursor: 'pointer',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },

  // Review
  reviewScreen: {
    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  imagePreview: {
    flex: 1, position: 'relative', background: '#000',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: 0,
  },
  previewImg: {
    maxWidth: '100%', maxHeight: '100%', objectFit: 'contain',
  },
  changeBtn: {
    position: 'absolute', top: 10, right: 10,
    width: 36, height: 36, borderRadius: 10,
    border: 'none', background: 'rgba(0,0,0,0.6)',
    color: 'white', fontSize: 16, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(8px)',
  },
  organSection: {
    padding: '12px 16px', background: '#111114',
    borderTop: '1px solid #2a2a35', flexShrink: 0,
  },
  organLabel: {
    fontSize: 11, fontWeight: 600, color: '#9898a8',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
  },
  organGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6,
  },
  organBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
    padding: '8px 2px', borderRadius: 10,
    border: '1.5px solid rgba(255,255,255,0.1)',
    cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
    transition: 'all 0.15s ease',
  },
  analyzeBtn: {
    margin: '12px 16px', padding: '14px 0', borderRadius: 12, border: 'none',
    background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
    color: 'white', fontSize: 16, fontWeight: 700, cursor: 'pointer',
    fontFamily: "'Plus Jakarta Sans', sans-serif", flexShrink: 0,
  },

  // Result
  resultScreen: {
    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  resultHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 16px', background: '#111114',
    borderBottom: '1px solid #2a2a35', flexShrink: 0,
  },
  resultThumb: {
    width: 40, height: 40, borderRadius: 8, overflow: 'hidden',
    background: '#19191e', flexShrink: 0,
  },
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover' },
  newBtn: {
    padding: '6px 14px', borderRadius: 8, border: '1px solid #2a2a35',
    background: 'transparent', color: '#9898a8', fontSize: 12,
    fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
    flexShrink: 0,
  },
  resultBody: {
    flex: 1, overflowY: 'auto', padding: 16,
    WebkitOverflowScrolling: 'touch',
  },
  loadingMsg: {
    display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center',
    padding: 20, color: '#606070', fontSize: 13,
  },
  spinner: {
    width: 20, height: 20, border: '2px solid #2a2a35',
    borderTopColor: '#3b82f6', borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  aiMsg: {
    padding: 14, borderRadius: 14, background: '#19191e',
    border: '1px solid #2a2a35', marginBottom: 10,
    fontSize: 14, lineHeight: 1.7, color: '#e8e8ec',
  },
  aiMsgLabel: {
    fontSize: 10, fontWeight: 700, color: '#3b82f6',
    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
  },
  userMsg: {
    padding: '10px 14px', borderRadius: '14px 14px 4px 14px',
    background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.2)',
    marginBottom: 10, marginLeft: 40,
    fontSize: 14, color: '#60a5fa', fontWeight: 500,
  },
  chatBar: {
    display: 'flex', gap: 8, padding: '10px 16px',
    borderTop: '1px solid #2a2a35', background: '#111114',
    flexShrink: 0,
  },
  chatInput: {
    flex: 1, padding: '12px 14px', borderRadius: 12,
    border: '1px solid #2a2a35', background: '#19191e',
    color: '#e8e8ec', fontSize: 15,
    fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none',
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 12, border: 'none',
    background: '#3b82f6', color: 'white', fontSize: 18,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
};
