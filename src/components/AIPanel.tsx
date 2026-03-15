import { useState, useRef, useEffect, type RefObject } from 'react';

interface SeriesInfo {
  seriesUID: string;
  description: string;
  modality: string;
  imageIds: string[];
  instanceCount: number;
}

interface AIPanelProps {
  hasImages: boolean;
  activeSeries: SeriesInfo | null;
  imageIndex: number;
  viewMode: 'dicom' | 'photo' | 'video';
  activePhoto: { url: string; name: string; file: File } | null;
  activeVideo: { url: string; name: string; file: File } | null;
  videoRef: RefObject<HTMLVideoElement | null>;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

const AI_MODELS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
  { id: 'claude-sonnet', name: 'Claude Sonnet', provider: 'anthropic' },
];

export default function AIPanel({ hasImages, activeSeries, imageIndex, viewMode, activePhoto, activeVideo, videoRef }: AIPanelProps) {
  const [model, setModel] = useState('gemini-2.5-flash');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'system',
      content: 'RadAssist AI hazır. DICOM görüntüsü yükleyin ve analiz için gönderin.',
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showApiInput, setShowApiInput] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load saved API key
  useEffect(() => {
    // Keys stored in memory only for this session
  }, []);

  const captureViewport = async (): Promise<string | null> => {
    try {
      // If viewing a video, capture current frame
      if (viewMode === 'video' && videoRef.current) {
        const video = videoRef.current;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(video, 0, 0);
        return canvas.toDataURL('image/png').split(',')[1];
      }
      // If viewing a photo, convert it to base64
      if (viewMode === 'photo' && activePhoto?.file) {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(activePhoto.file);
        });
      }
      // DICOM viewport canvas capture
      const canvas = document.querySelector('.viewport-element canvas') as HTMLCanvasElement;
      if (!canvas) return null;
      return canvas.toDataURL('image/png').split(',')[1];
    } catch {
      return null;
    }
  };

  const analyzeWithGemini = async (prompt: string, imageBase64: string | null) => {
    if (!apiKey) {
      setShowApiInput(true);
      return 'API anahtarı gerekli. Lütfen Gemini API key girin.';
    }

    const parts: any[] = [];
    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: 'image/png',
          data: imageBase64,
        },
      });
    }
    parts.push({ text: prompt });

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 2048,
            },
            systemInstruction: {
              parts: [
                {
                  text: `Sen deneyimli bir radyolog asistanısın. Türkçe yanıt ver. 
Görüntü tıbbi bir DICOM görüntüsü olabileceği gibi, ekran görüntüsü, telefon fotoğrafı veya başka bir görüntü de olabilir.
Tıbbi görüntüler için:
1. Görüntü kalitesi ve teknik değerlendirme
2. Anatomi ve normal yapılar
3. Patolojik bulgular (varsa)
4. Öneriler
formatında sistematik rapor hazırla. Klinik korelasyon öner.
Tıbbi olmayan görüntüler için: İçeriği analiz et ve açıkla.`,
                },
              ],
            },
          }),
        }
      );

      const data = await res.json();
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text;
      }
      if (data.error) {
        return `Hata: ${data.error.message}`;
      }
      return 'Yanıt alınamadı.';
    } catch (err) {
      return `Bağlantı hatası: ${(err as Error).message}`;
    }
  };

  const handleAnalyze = async () => {
    if (!hasImages) return;
    setAnalyzing(true);

    const imageBase64 = await captureViewport();

    let prompt: string;
    let userMessage: string;

    if (viewMode === 'video' && activeVideo) {
      prompt = `Bu video karesini analiz et. Video: ${activeVideo.name}. Tıbbi bir görüntüyse radyoloji raporu hazırla, değilse içeriği açıkla.`;
      userMessage = `🔍 Video karesi analizi başlatıldı (${activeVideo.name})`;
    } else if (viewMode === 'photo' && activePhoto) {
      prompt = `Bu görüntüyü analiz et. Dosya adı: ${activePhoto.name}. Tıbbi bir görüntüyse radyoloji raporu hazırla, değilse içeriği açıkla.`;
      userMessage = `🔍 Fotoğraf analizi başlatıldı (${activePhoto.name})`;
    } else {
      const seriesInfo = activeSeries
        ? `Modalite: ${activeSeries.modality}, Seri: ${activeSeries.description}, Kesit: ${imageIndex + 1}/${activeSeries.instanceCount}`
        : '';
      prompt = `Bu radyolojik görüntüyü analiz et. ${seriesInfo}. Sistematik bir radyoloji raporu hazırla.`;
      userMessage = `🔍 Görüntü analizi başlatıldı (${activeSeries?.modality || 'DICOM'} - Kesit ${imageIndex + 1})`;
    }

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userMessage, timestamp: new Date() },
    ]);

    const result = await analyzeWithGemini(prompt, imageBase64);

    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: result, timestamp: new Date() },
    ]);

    setAnalyzing(false);
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;
    const userMsg = inputText.trim();
    setInputText('');

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: userMsg, timestamp: new Date() },
    ]);

    setAnalyzing(true);

    const imageBase64 = hasImages ? await captureViewport() : null;
    let context: string;
    if (viewMode === 'video' && activeVideo) {
      context = `Mevcut görüntü: Video karesi - ${activeVideo.name}`;
    } else if (viewMode === 'photo' && activePhoto) {
      context = `Mevcut görüntü: Fotoğraf - ${activePhoto.name}`;
    } else if (activeSeries) {
      context = `Mevcut görüntü: ${activeSeries.modality} - ${activeSeries.description}, Kesit ${imageIndex + 1}/${activeSeries.instanceCount}`;
    } else {
      context = 'Henüz görüntü yüklenmemiş';
    }

    const prompt = `${context}\n\nKullanıcı sorusu: ${userMsg}`;
    const result = await analyzeWithGemini(prompt, imageBase64);

    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: result, timestamp: new Date() },
    ]);

    setAnalyzing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <h2>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          AI Asistan
          <span className="ai-badge">BETA</span>
        </h2>
      </div>

      <div className="ai-panel-body">
        {/* Model selector */}
        <select
          className="ai-model-select"
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          {AI_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>

        {/* API Key input */}
        {showApiInput && (
          <div style={{ marginBottom: 12 }}>
            <input
              type="password"
              placeholder="Gemini API Key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                fontSize: 12,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            />
            <div
              style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                marginTop: 4,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              aistudio.google.com → API Key
            </div>
          </div>
        )}

        {/* Analyze button */}
        <button
          className="ai-analyze-btn"
          onClick={handleAnalyze}
          disabled={!hasImages || analyzing}
        >
          {analyzing ? (
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
              Analiz ediliyor...
            </span>
          ) : (
            '🔬 Görüntüyü Analiz Et'
          )}
        </button>

        {/* Chat messages */}
        <div style={{ marginTop: 16 }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              {msg.role === 'system' ? (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                    padding: '8px 0',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {msg.content}
                </div>
              ) : msg.role === 'user' ? (
                <div
                  style={{
                    padding: '8px 12px',
                    background: 'var(--accent-glow)',
                    borderRadius: '8px 8px 2px 8px',
                    fontSize: 13,
                    color: 'var(--accent)',
                    fontWeight: 500,
                  }}
                >
                  {msg.content}
                </div>
              ) : (
                <div className="ai-result">
                  <div className="ai-result-title">
                    {AI_MODELS.find((m) => m.id === model)?.name || 'AI'} Yanıtı
                  </div>
                  <div className="ai-result-text">
                    {msg.content.split('\n').map((line, j) => (
                      <p key={j}>{line}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Chat input */}
      <div className="ai-chat-input">
        <input
          type="text"
          placeholder="Görüntü hakkında soru sor..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={analyzing}
        />
        <button onClick={handleSend} disabled={analyzing || !inputText.trim()}>
          Gönder
        </button>
      </div>
    </div>
  );
}
