import { useState, useRef, useEffect, useCallback } from 'react';
import { getUser } from '../lib/logger';
import { ORGAN_TREE, findStructure } from '../lib/organTree';
import type { OrganCategory } from '../lib/organTree';
import type { CapturedFrame } from '../types';
import {
  getSystemPrompt,
  getScoringHint,
  MEDICAL_DISCLAIMER,
  buildClinicalContextString,
} from '../lib/promptTemplates';
import { renderMarkdown } from '../lib/markdownRenderer';
import {
  captureVideoFrame,
  fileToBase64,
  buildFrameGrid,
  formatTime,
} from '../lib/mediaCapture';
import { analyzeWithGemini, buildConversationHistorySimple } from '../lib/geminiClient';
import { useClinicalContext } from '../hooks/useClinicalContext';
import { drawCanvasWithPaths, getCanvasPosition, initCanvasFromBase64 } from '../lib/canvasUtils';
import type { CanvasPath } from '../lib/canvasUtils';

interface MobileAppProps { onSwitchToDesktop: () => void; }

type Step = 'capture' | 'review' | 'annotate' | 'result';

export default function MobileApp(_props: MobileAppProps) {
  const [step, setStep] = useState<Step>('capture');
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);

  // Organ selection
  const [selectedCategory, setSelectedCategory] = useState<OrganCategory | null>(null);
  const [selectedStructure, setSelectedStructure] = useState('general_full');

  // Annotation
  const [annotating, setAnnotating] = useState(false);
  const [paths, setPaths] = useState<CanvasPath[][]>([]);
  const [currentPath, setCurrentPath] = useState<CanvasPath[]>([]);
  const [annotationLabel, setAnnotationLabel] = useState('');
  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);

  // Video frames
  const [frames, setFrames] = useState<CapturedFrame[]>([]);

  // AI
  const [analyzing, setAnalyzing] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);

  // Clinical context — shared hook
  const { showContext, setShowContext, clinicalContext, setClinicalContext, hasContext } = useClinicalContext();

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const resultEndRef = useRef<HTMLDivElement>(null);
  const framesRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    resultEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    document.addEventListener('webkitfullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      document.removeEventListener('webkitfullscreenchange', handler);
    };
  }, []);

  const toggleFullscreen = () => {
    const el = videoContainerRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      (el.requestFullscreen || (el as any).webkitRequestFullscreen)?.call(el);
    }
  };

  // BASE64 HELPERS — using shared utilities
  const getBase64 = async (): Promise<string | null> => {
    try {
      if (mediaType === 'video' && videoRef.current) {
        return captureVideoFrame(videoRef.current);
      }
      if (mediaFile) return fileToBase64(mediaFile);
      return null;
    } catch { return null; }
  };

  // VIDEO FRAME CAPTURE — using shared captureVideoFrame
  const captureFrame = () => {
    const v = videoRef.current;
    if (!v) return;
    const base64 = captureVideoFrame(v);
    if (!base64) return;
    const c = document.createElement('canvas');
    c.width = v.videoWidth || 640;
    c.height = v.videoHeight || 480;
    c.getContext('2d')!.drawImage(v, 0, 0);
    setFrames((prev) => [...prev, {
      id: `f_${Date.now()}`,
      thumbnailUrl: c.toDataURL('image/jpeg', 0.6),
      base64,
      timestamp: v.currentTime, selected: true,
    }]);
    setTimeout(() => framesRef.current?.scrollTo({ left: 99999, behavior: 'smooth' }), 100);
  };

  // FILE HANDLING
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
    setPaths([]);
    setAnnotationLabel('');
    e.target.value = '';
  };

  // ANNOTATION CANVAS — using shared canvas utils
  const initAnnotationCanvas = useCallback(async () => {
    const base64 = await getBase64();
    if (!base64 || !canvasRef.current) return;
    initCanvasFromBase64(canvasRef.current, base64, (img) => {
      setBaseImage(img);
    });
  }, [mediaFile, mediaType]);

  // Redraw annotation canvas — using shared drawCanvasWithPaths
  useEffect(() => {
    if (step !== 'annotate' || !baseImage || !canvasRef.current) return;
    drawCanvasWithPaths({
      canvas: canvasRef.current,
      baseImage,
      paths,
      currentPath,
      strokeColor: '#ef4444',
      lineWidth: 3,
    });
  }, [baseImage, paths, currentPath, step]);

  const onDown = (e: React.TouchEvent | React.MouseEvent) => {
    if (!canvasRef.current) return;
    e.preventDefault(); setAnnotating(true);
    setCurrentPath([getCanvasPosition(e, canvasRef.current)]);
  };
  const onMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!annotating || !canvasRef.current) return; e.preventDefault();
    setCurrentPath((p) => [...p, getCanvasPosition(e, canvasRef.current!)]);
  };
  const onUp = () => {
    if (!annotating) return; setAnnotating(false);
    if (currentPath.length > 1) setPaths((p) => [...p, currentPath]);
    setCurrentPath([]);
  };

  const getAnnotatedBase64 = (): string | null => {
    if (!canvasRef.current) return null;
    return canvasRef.current.toDataURL('image/png').split(',')[1];
  };

  // AI CALL — using shared geminiClient
  const callAI = async (prompt: string, base64: string | null): Promise<string> => {
    const systemPrompt = getSystemPrompt();
    const history = buildConversationHistorySimple(messages);
    return analyzeWithGemini({
      prompt,
      imageBase64: base64,
      systemPrompt,
      history,
    });
  };

  // ANALYZE ACTIONS
  const structureLabel = findStructure(selectedStructure)?.structure.label || 'Genel';

  const handleGeneralAnalyze = async () => {
    setAnalyzing(true); setStep('result');
    const base64 = await getBase64();

    // If a category is selected (e.g. "Karaciger") but no specific structure,
    // include the category in the prompt for focused analysis
    let prompt: string;
    if (selectedCategory && selectedCategory.id !== 'general') {
      prompt = `Bu goruntude "${selectedCategory.label}" bolgesine odaklanarak analiz et. Bu alana ozgu bulgulari detayli degerlendir, sistematik rapor hazirla.`;
    } else {
      prompt = 'Bu goruntuyu genel olarak analiz et. Tum yapilari degerlendir, sistematik rapor hazirla.';
    }
    if (hasContext()) {
      prompt += buildClinicalContextString(clinicalContext);
    }

    const scoringHint = selectedCategory ? getScoringHint(selectedCategory.id) : null;
    if (scoringHint) prompt += `\n\n${scoringHint}`;

    const text = await callAI(prompt, base64);
    setMessages([{ role: 'ai', text }]);
    setAnalyzing(false);
  };

  const handleStructureAnalyze = async () => {
    setAnalyzing(true); setStep('result');
    const base64 = await getBase64();

    let prompt = `Bu goruntude "${structureLabel}" yapisina/bolgesine odaklanarak analiz et. Bu alana ozgu bulgulari detayli degerlendir.`;
    if (hasContext()) {
      prompt += buildClinicalContextString(clinicalContext);
    }

    const scoringHint = getScoringHint(selectedStructure);
    if (scoringHint) prompt += `\n\n${scoringHint}`;

    const text = await callAI(prompt, base64);
    setMessages([{ role: 'ai', text }]);
    setAnalyzing(false);
  };

  const handleAnnotatedAnalyze = async () => {
    setAnalyzing(true); setStep('result');
    const base64 = getAnnotatedBase64();
    const label = annotationLabel.trim() || structureLabel;

    let prompt = `Bu goruntude kirmizi ile isaretlenmis bolgeyi analiz et. Kullanici bu alanin "${label}" oldugunu belirtiyor. Isaretli bolgedeki bulgulari detayli degerlendir. Patoloji varsa tanimla.`;
    if (hasContext()) {
      prompt += buildClinicalContextString(clinicalContext);
    }

    const scoringHint = getScoringHint(selectedStructure);
    if (scoringHint) prompt += `\n\n${scoringHint}`;

    const text = await callAI(prompt, base64);
    setMessages([{ role: 'user', text: `Isaretli bolge: "${label}"` }, { role: 'ai', text }]);
    setAnalyzing(false);
  };

  const handleMultiFrameAnalyze = async () => {
    const sel = frames.filter((f) => f.selected);
    if (sel.length === 0) return;
    setAnalyzing(true); setStep('result');

    const gridBase64 = await buildFrameGrid(sel, formatTime);
    const timeLabels = sel.map((f, i) => `Kare ${i + 1}: ${formatTime(f.timestamp)}`).join(', ');

    let prompt = sel.length === 1
      ? (selectedStructure === 'general_full'
          ? 'Bu video karesini analiz et. Sistematik rapor hazirla.'
          : `Bu video karesinde ${structureLabel} bolgesine odaklanarak analiz et.`)
      : `Bu goruntude ${sel.length} adet video karesi grid halinde gosterilmektedir (${timeLabels}). ${selectedStructure === 'general_full' ? 'Her bir kareyi' : `${structureLabel} bolgesine odaklanarak her kareyi`} degerlendir. Bulgularini kare numaralarina gore raporla.`;

    if (hasContext()) {
      prompt += buildClinicalContextString(clinicalContext);
    }

    setMessages([{
      role: 'user',
      text: `${sel.length} kare analizi (${timeLabels})`,
    }]);

    const text = await callAI(prompt, gridBase64);
    setMessages((p) => [...p, { role: 'ai', text }]);
    setAnalyzing(false);
  };

  const handleChat = async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim(); setChatInput('');
    setMessages((p) => [...p, { role: 'user', text: msg }]);
    setAnalyzing(true);
    const sel = frames.filter((f) => f.selected);
    const base64 = sel.length > 0 ? sel[0].base64 : await getBase64();
    const text = await callAI(msg, base64);
    setMessages((p) => [...p, { role: 'ai', text }]);
    setAnalyzing(false);
  };

  const handleReset = () => {
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
    setMediaUrl(''); setMediaFile(null); setStep('capture');
    setMessages([]); setFrames([]); setPaths([]);
    setSelectedCategory(null); setSelectedStructure('general_full');
    setAnnotationLabel(''); setBaseImage(null);
  };

  const selCount = frames.filter((f) => f.selected).length;

  // RENDER
  return (
    <div className="mobile-app">

      {/* HEADER */}
      <div className="mobile-header">
        <div className="mobile-logo">RA</div>
        <span className="mobile-title">RadAssist</span>
        {step !== 'capture' && (
          <button onClick={step === 'annotate' ? () => setStep('review') : handleReset} className="mobile-btn-back">
            {step === 'annotate' ? 'Geri' : 'Yeni'}
          </button>
        )}
        <span className="mobile-user">{getUser()}</span>
      </div>

      {/* CAPTURE */}
      {step === 'capture' && (
        <div className="mobile-capture">
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileSelect} />
          <input ref={galleryRef} type="file" accept="image/*,video/*,.dcm" style={{ display: 'none' }} onChange={handleFileSelect} />
          <div className="mobile-capture-icon">{'<_>'}</div>
          <h2>Goruntu veya Video Yukle</h2>
          <p>Fotograf cekin, galeriden secin veya video yukleyin</p>
          <button onClick={() => cameraRef.current?.click()} className="mobile-btn-primary" style={{ marginBottom: 12 }}>Fotograf Cek</button>
          <button onClick={() => galleryRef.current?.click()} className="mobile-btn-secondary">Galeri / Video Sec</button>
          <div className="mobile-disclaimer">{MEDICAL_DISCLAIMER}</div>
        </div>
      )}

      {/* REVIEW */}
      {step === 'review' && (
        <div className="mobile-review">
          {/* Media */}
          <div
            ref={videoContainerRef}
            className={`mobile-media-container ${isFullscreen ? 'fullscreen' : ''}`}
          >
            {mediaType === 'image'
              ? <img src={mediaUrl} alt="" />
              : <video ref={videoRef} src={mediaUrl} controls playsInline />
            }

            {mediaType === 'video' && (
              <div className={`mobile-video-controls ${isFullscreen ? 'fullscreen' : ''}`}>
                <button onClick={captureFrame} className="mobile-btn-capture-frame">
                  Kare Yakala {frames.length > 0 ? `(${frames.length})` : ''}
                </button>
                <button onClick={toggleFullscreen} className="mobile-btn-fullscreen">
                  {isFullscreen ? '[-]' : '[+]'}
                </button>
              </div>
            )}

            {mediaType === 'video' && isFullscreen && frames.length > 0 && (
              <div className="mobile-frame-badge">
                {frames.length} kare yakalandi
              </div>
            )}
          </div>

          {/* Video frame thumbnails */}
          {mediaType === 'video' && frames.length > 0 && (
            <div className="mobile-frames-strip">
              <div ref={framesRef} className="mobile-frames-scroll">
                {frames.map((f) => (
                  <div
                    key={f.id}
                    onClick={() => setFrames((p) => p.map((x) => x.id === f.id ? { ...x, selected: !x.selected } : x))}
                    className={`mobile-frame-thumb ${f.selected ? 'selected' : 'unselected'}`}
                  >
                    <img src={f.thumbnailUrl} alt="" />
                    <div className="mobile-frame-time">{formatTime(f.timestamp)}</div>
                    {f.selected && <div className="mobile-frame-check">+</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clinical context (collapsible) */}
          <div style={{ padding: '8px 16px 0' }}>
            <button
              onClick={() => setShowContext(!showContext)}
              className={`mobile-context-toggle ${hasContext() ? 'active' : 'inactive'}`}
            >
              <span>{hasContext() ? 'Klinik Bilgi (aktif)' : 'Klinik Bilgi Ekle (opsiyonel)'}</span>
              <span style={{ fontSize: 10 }}>{showContext ? 'v' : '>'}</span>
            </button>

            {showContext && (
              <div className="mobile-context-form">
                <div className="mobile-context-row">
                  <div style={{ flex: 1 }}>
                    <div className="mobile-label">Yas</div>
                    <input type="text" placeholder="45" value={clinicalContext.age} onChange={(e) => setClinicalContext({ ...clinicalContext, age: e.target.value })} className="mobile-input" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="mobile-label">Cinsiyet</div>
                    <select value={clinicalContext.gender} onChange={(e) => setClinicalContext({ ...clinicalContext, gender: e.target.value as 'male' | 'female' | '' })} className="mobile-input">
                      <option value="">-</option>
                      <option value="male">Erkek</option>
                      <option value="female">Kadin</option>
                    </select>
                  </div>
                </div>
                <div>
                  <div className="mobile-label">Sikayet</div>
                  <input type="text" placeholder="bas agrisi, karin agrisi..." value={clinicalContext.complaint} onChange={(e) => setClinicalContext({ ...clinicalContext, complaint: e.target.value })} className="mobile-input" />
                </div>
                <div>
                  <div className="mobile-label">Ozgecmis</div>
                  <input type="text" placeholder="DM, HT, bilinen kitle..." value={clinicalContext.history} onChange={(e) => setClinicalContext({ ...clinicalContext, history: e.target.value })} className="mobile-input" />
                </div>
                <div>
                  <div className="mobile-label">Klinik Soru</div>
                  <input type="text" placeholder="metastaz? lezyon karakteri?" value={clinicalContext.clinicalQuestion} onChange={(e) => setClinicalContext({ ...clinicalContext, clinicalQuestion: e.target.value })} className="mobile-input" />
                </div>
              </div>
            )}
          </div>

          {/* Organ picker */}
          <div className="mobile-organ-section">
            <div className="mobile-section-label">Bolge / Organ</div>
            <div className="mobile-organ-scroll">
              {ORGAN_TREE.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => { setSelectedCategory(selectedCategory?.id === cat.id ? null : cat); if (cat.id === 'general') setSelectedStructure('general_full'); }}
                  className={`mobile-organ-btn ${selectedCategory?.id === cat.id || (cat.id === 'general' && selectedStructure === 'general_full') ? 'selected' : 'unselected'}`}
                >
                  <span className="mobile-organ-icon">{cat.icon}</span>{cat.label}
                </button>
              ))}
            </div>
            {selectedCategory && selectedCategory.id !== 'general' && (
              <div className="mobile-structure-wrap">
                {selectedCategory.structures.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStructure(s.id)}
                    className={`mobile-structure-btn ${selectedStructure === s.id ? 'selected' : 'unselected'}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="mobile-actions">
            <button
              onClick={() => { setStep('annotate'); setPaths([]); setAnnotationLabel(''); setTimeout(initAnnotationCanvas, 100); }}
              className="mobile-btn-annotate"
            >
              Bolge Isaretle + Etiketle
            </button>
            <button
              onClick={selectedStructure === 'general_full' ? handleGeneralAnalyze : handleStructureAnalyze}
              className="mobile-btn-analyze"
            >
              {selectedStructure !== 'general_full'
                ? `${structureLabel} Analiz Et`
                : selectedCategory && selectedCategory.id !== 'general'
                  ? `${selectedCategory.label} Analiz Et`
                  : 'Genel Analiz'}
            </button>
            {mediaType === 'video' && selCount > 0 && (
              <button onClick={handleMultiFrameAnalyze} className="mobile-btn-multiframe">
                {selCount} Kareyi Toplu Analiz
              </button>
            )}
          </div>
        </div>
      )}

      {/* ANNOTATE */}
      {step === 'annotate' && (
        <div className="mobile-annotate">
          <div className="mobile-canvas-area">
            <canvas ref={canvasRef}
              onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
              onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
            />
            {paths.length === 0 && (
              <div className="mobile-canvas-hint">
                Parmaginizla cizin
              </div>
            )}
            <div className="mobile-canvas-tools">
              {paths.length > 0 && <>
                <button onClick={() => setPaths((p) => p.slice(0, -1))} className="mobile-float-btn">{'<-'}</button>
                <button onClick={() => setPaths([])} className="mobile-float-btn">X</button>
              </>}
            </div>
            {paths.length > 0 && (
              <div className="mobile-path-count">
                {paths.length} cizim
              </div>
            )}
          </div>

          <div className="mobile-annotate-footer">
            <label>
              Bu isaretli alan ne? (AI'a soyle)
            </label>
            <input
              value={annotationLabel}
              onChange={(e) => setAnnotationLabel(e.target.value)}
              placeholder="Orn: sol bobrek alt pol kisti, mezenterik LAP..."
              className="mobile-annotate-input"
            />
            <button
              onClick={handleAnnotatedAnalyze}
              disabled={paths.length === 0}
              className={`mobile-btn-analyze-annotated ${paths.length > 0 ? 'enabled' : 'disabled'}`}
            >
              Isaretli Bolgeyi Analiz Et
            </button>
          </div>
        </div>
      )}

      {/* RESULT */}
      {step === 'result' && (<>
        <div className="mobile-result-header">
          <div className="mobile-result-thumb">
            {mediaType === 'image'
              ? <img src={mediaUrl} alt="" />
              : <span style={{ fontSize: 14, fontFamily: "'JetBrains Mono',monospace" }}>VID</span>}
          </div>
          <div className="mobile-result-info">
            <div className="mobile-result-title">{structureLabel} Analizi</div>
            <div className="mobile-result-status">{analyzing ? 'Analiz ediliyor...' : 'Tamamlandi'}</div>
          </div>
          <div className="mobile-gemini-badge">Gemini</div>
        </div>

        {/* Disclaimer in result */}
        <div className="mobile-result-disclaimer">
          <div className="mobile-result-disclaimer-text">
            {MEDICAL_DISCLAIMER}
          </div>
        </div>

        {/* Messages */}
        <div className="mobile-messages">
          {analyzing && messages.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 40, gap: 12, color: '#606070' }}>
              <div className="mobile-loading-spinner" />
              <span style={{ fontSize: 13 }}>Gemini analiz ediyor...</span>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'mobile-msg-user' : 'mobile-msg-ai'}>
              {m.role === 'ai' && <div className="mobile-msg-ai-label">Gemini 2.5 Flash</div>}
              {m.role === 'ai'
                ? <div className="ai-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }} />
                : m.text.split('\n').map((l, j) => <p key={j} style={{ margin: '3px 0' }}>{l}</p>)
              }
            </div>
          ))}
          {analyzing && messages.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
              <div className="mobile-loading-small" />
            </div>
          )}
          <div ref={resultEndRef} />
        </div>

        {/* Chat */}
        <div className="mobile-chat-bar">
          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleChat()}
            placeholder="Takip sorusu sor..."
            disabled={analyzing}
            className="mobile-chat-input"
          />
          <button
            onClick={handleChat}
            disabled={analyzing || !chatInput.trim()}
            className="mobile-chat-send"
          >
            {'>'}
          </button>
        </div>
      </>)}
    </div>
  );
}
