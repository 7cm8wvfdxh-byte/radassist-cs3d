import { useState, useEffect } from 'react';
import type { AIPanelProps } from '../types';
import { captureCurrentView } from '../lib/mediaCapture';
import { analyzeWithGemini, buildConversationHistory } from '../lib/geminiClient';
import { useGeminiChat } from '../hooks/useGeminiChat';
import { useClinicalContext } from '../hooks/useClinicalContext';
import {
  getSystemPrompt,
  buildAnalysisPrompt,
  getScoringHint,
  MEDICAL_DISCLAIMER,
} from '../lib/promptTemplates';
import { renderMarkdown } from '../lib/markdownRenderer';

export default function AIPanel({
  hasImages,
  activeSeries,
  imageIndex,
  viewMode,
  activePhoto,
  activeVideo,
  videoRef,
  annotationData,
  onAnnotationConsumed,
}: AIPanelProps) {
  const {
    messages,
    analyzing,
    setAnalyzing,
    scrollRef,
    addUserMessage,
    addAssistantMessage,
    setMessages,
  } = useGeminiChat({ initialMessage: 'RadAssist AI hazir. Goruntu yukleyin ve analiz icin gonderin.' });

  const {
    showContext,
    setShowContext,
    clinicalContext,
    setClinicalContext,
    hasContext,
    resetContext,
  } = useClinicalContext();

  const [inputText, setInputText] = useState('');

  // Auto-trigger analysis when annotation data arrives
  useEffect(() => {
    if (!annotationData) return;

    const runAnnotationAnalysis = async () => {
      setAnalyzing(true);

      const imageToSend = annotationData.hasDrawing
        ? (annotationData.drawingDataUrl || annotationData.fullImageWithAnnotation)
        : annotationData.fullImageWithAnnotation;

      const modality = activeSeries?.modality;
      const systemPrompt = getSystemPrompt(modality);

      const prompt = buildAnalysisPrompt({
        modality,
        seriesDescription: activeSeries?.description,
        organLabel: annotationData.organLabel,
        hasDrawing: annotationData.hasDrawing,
        clinicalContext: hasContext() ? clinicalContext : undefined,
      });

      const scoringHint = getScoringHint(annotationData.organ, modality);
      const fullPrompt = scoringHint ? `${prompt}\n\n${scoringHint}` : prompt;

      const regionInfo = annotationData.hasDrawing
        ? `Isaretlenmis bolge (${annotationData.organLabel})`
        : annotationData.organLabel;

      addUserMessage(`Hedefli analiz: ${regionInfo}${annotationData.hasDrawing ? ' (cizimli)' : ''}`);

      const history = buildConversationHistory(messages);
      const result = await analyzeWithGemini({
        prompt: fullPrompt,
        imageBase64: imageToSend,
        systemPrompt,
        history,
      });

      addAssistantMessage(result);
      setAnalyzing(false);
      onAnnotationConsumed();
    };

    runAnnotationAnalysis();
  }, [annotationData]);

  const captureViewport = async (): Promise<string | null> => {
    return captureCurrentView({
      viewMode,
      videoRef: videoRef.current,
      activePhoto,
    });
  };

  const handleAnalyze = async () => {
    if (!hasImages) return;
    setAnalyzing(true);

    const imageBase64 = await captureViewport();
    const modality = activeSeries?.modality;
    const systemPrompt = getSystemPrompt(modality);

    let prompt: string;
    let userMessage: string;

    if (viewMode === 'video' && activeVideo) {
      prompt = buildAnalysisPrompt({
        clinicalContext: hasContext() ? clinicalContext : undefined,
      });
      userMessage = `Goruntu analizi baslatildi (Video: ${activeVideo.name})`;
    } else if (viewMode === 'photo' && activePhoto) {
      prompt = buildAnalysisPrompt({
        clinicalContext: hasContext() ? clinicalContext : undefined,
      });
      userMessage = `Goruntu analizi baslatildi (${activePhoto.name})`;
    } else {
      prompt = buildAnalysisPrompt({
        modality,
        seriesDescription: activeSeries?.description,
        imageIndex,
        totalImages: activeSeries?.instanceCount,
        clinicalContext: hasContext() ? clinicalContext : undefined,
      });
      userMessage = `Goruntu analizi baslatildi (${modality || 'DICOM'} - Kesit ${imageIndex + 1})`;
    }

    addUserMessage(userMessage);

    const history = buildConversationHistory(messages);
    const result = await analyzeWithGemini({
      prompt,
      imageBase64,
      systemPrompt,
      history,
    });

    addAssistantMessage(result);
    setAnalyzing(false);
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;
    const userMsg = inputText.trim();
    setInputText('');

    addUserMessage(userMsg);
    setAnalyzing(true);

    const imageBase64 = hasImages ? await captureViewport() : null;
    let context: string;
    if (viewMode === 'video' && activeVideo) {
      context = `Mevcut goruntu: Video karesi - ${activeVideo.name}`;
    } else if (viewMode === 'photo' && activePhoto) {
      context = `Mevcut goruntu: Fotograf - ${activePhoto.name}`;
    } else if (activeSeries) {
      context = `Mevcut goruntu: ${activeSeries.modality} - ${activeSeries.description}, Kesit ${imageIndex + 1}/${activeSeries.instanceCount}`;
    } else {
      context = 'Henuz goruntu yuklenmemis';
    }

    const prompt = `${context}\n\nKullanici sorusu: ${userMsg}`;
    const history = buildConversationHistory([
      ...messages,
      { role: 'user', content: userMsg, timestamp: new Date() },
    ]);
    const result = await analyzeWithGemini({
      prompt,
      imageBase64,
      modality: activeSeries?.modality,
      history,
    });

    addAssistantMessage(result);
    setAnalyzing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const contextFieldStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    fontSize: 12,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    outline: 'none',
    boxSizing: 'border-box',
  };

  const contextLabelStyle: React.CSSProperties = {
    fontSize: 10,
    color: 'var(--text-muted)',
    fontWeight: 600,
    marginBottom: 2,
    display: 'block',
  };

  return (
    <div className="ai-panel">
      <div className="ai-panel-header">
        <h2>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
          </svg>
          AI Asistan
          <span style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 4,
            background: 'rgba(6,182,212,0.15)', color: '#06b6d4',
            fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
          }}>
            Gemini 2.5 Flash
          </span>
        </h2>
      </div>

      <div className="ai-panel-body">
        {/* Disclaimer */}
        <div style={{
          padding: '6px 10px',
          borderRadius: 8,
          background: 'rgba(245,158,11,0.1)',
          border: '1px solid rgba(245,158,11,0.2)',
          fontSize: 10,
          color: '#fbbf24',
          lineHeight: 1.4,
          marginBottom: 10,
        }}>
          {MEDICAL_DISCLAIMER}
        </div>

        {/* Clinical Context Toggle */}
        <button
          onClick={() => setShowContext(!showContext)}
          style={{
            width: '100%',
            padding: '7px 10px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: hasContext() ? 'rgba(34,197,94,0.1)' : 'var(--bg-tertiary)',
            color: hasContext() ? '#22c55e' : 'var(--text-secondary)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <span>
            {hasContext() ? 'Klinik Bilgi Girildi' : 'Klinik Bilgi Ekle'}
            {hasContext() && ' (aktif)'}
          </span>
          <span style={{ fontSize: 10 }}>{showContext ? '\u25B2' : '\u25BC'}</span>
        </button>

        {/* Clinical Context Form */}
        {showContext && (
          <div style={{
            padding: 10,
            borderRadius: 8,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            marginBottom: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={contextLabelStyle}>Yas</label>
                <input
                  type="text"
                  placeholder="ornek: 45"
                  value={clinicalContext.age}
                  onChange={(e) => setClinicalContext({ ...clinicalContext, age: e.target.value })}
                  style={contextFieldStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={contextLabelStyle}>Cinsiyet</label>
                <select
                  value={clinicalContext.gender}
                  onChange={(e) => setClinicalContext({ ...clinicalContext, gender: e.target.value as 'male' | 'female' | '' })}
                  style={contextFieldStyle}
                >
                  <option value="">Seciniz</option>
                  <option value="male">Erkek</option>
                  <option value="female">Kadin</option>
                </select>
              </div>
            </div>
            <div>
              <label style={contextLabelStyle}>Sikayet / Semptom</label>
              <input
                type="text"
                placeholder="ornek: bas agrisi, bulanti, 2 haftadir"
                value={clinicalContext.complaint}
                onChange={(e) => setClinicalContext({ ...clinicalContext, complaint: e.target.value })}
                style={contextFieldStyle}
              />
            </div>
            <div>
              <label style={contextLabelStyle}>Ozgecmis / Ek hastalik</label>
              <input
                type="text"
                placeholder="ornek: DM, HT, bilinen kitle"
                value={clinicalContext.history}
                onChange={(e) => setClinicalContext({ ...clinicalContext, history: e.target.value })}
                style={contextFieldStyle}
              />
            </div>
            <div>
              <label style={contextLabelStyle}>Klinik Soru (opsiyonel)</label>
              <input
                type="text"
                placeholder="ornek: metastaz var mi? lezyon karakteri?"
                value={clinicalContext.clinicalQuestion}
                onChange={(e) => setClinicalContext({ ...clinicalContext, clinicalQuestion: e.target.value })}
                style={contextFieldStyle}
              />
            </div>
            <button
              onClick={resetContext}
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-muted)',
                fontSize: 10,
                cursor: 'pointer',
                alignSelf: 'flex-end',
              }}
            >
              Temizle
            </button>
          </div>
        )}

        {/* Modality Badge */}
        {activeSeries?.modality && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            borderRadius: 4,
            background: 'rgba(139,92,246,0.15)',
            color: '#a78bfa',
            fontSize: 10,
            fontWeight: 600,
            fontFamily: "'JetBrains Mono', monospace",
            marginBottom: 8,
          }}>
            Modalite: {activeSeries.modality}
            {activeSeries.description && ` | ${activeSeries.description}`}
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
            'Goruntuyu Analiz Et'
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
                    Gemini 2.5 Flash
                  </div>
                  <div
                    className="ai-result-text ai-markdown"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                  />
                </div>
              )}
            </div>
          ))}
          <div ref={scrollRef} />
        </div>
      </div>

      {/* Chat input */}
      <div className="ai-chat-input">
        <input
          type="text"
          placeholder="Takip sorusu sor..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={analyzing}
        />
        <button onClick={handleSend} disabled={analyzing || !inputText.trim()}>
          Gonder
        </button>
      </div>
    </div>
  );
}
