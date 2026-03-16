import { useState, useRef, useEffect, useCallback } from 'react';
import { getUser } from '../lib/logger';
import { ORGAN_TREE, findStructure } from '../lib/organTree';
import type { OrganCategory } from '../lib/organTree';
import type { CapturedFrame } from '../types';
import {
  getSystemPrompt,
  getScoringHint,
  getResponseTypeInstruction,
  RESPONSE_TYPES,
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

  // Multi-annotation: saved annotation entries
  interface MobileAnnotation {
    id: string;
    label: string;
    paths: CanvasPath[][];
    color: string;
  }
  const [savedAnnotations, setSavedAnnotations] = useState<MobileAnnotation[]>([]);

  // Video frames
  const [frames, setFrames] = useState<CapturedFrame[]>([]);

  // Modality selection (fixes missing modality awareness)
  const [selectedModality, setSelectedModality] = useState('');
  // Response type selection
  const [selectedResponseType, setSelectedResponseType] = useState('report');

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

  // Colors for multiple annotations
  const ANNOTATION_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#f97316', '#ec4899'];
  const currentAnnotationColor = ANNOTATION_COLORS[savedAnnotations.length % ANNOTATION_COLORS.length];

  // Redraw annotation canvas — using shared drawCanvasWithPaths
  useEffect(() => {
    if (step !== 'annotate' || !baseImage || !canvasRef.current) return;
    drawCanvasWithPaths({
      canvas: canvasRef.current,
      baseImage,
      paths,
      currentPath,
      strokeColor: currentAnnotationColor,
      lineWidth: 3,
      layers: savedAnnotations.map((a) => ({ paths: a.paths, color: a.color })),
    });
  }, [baseImage, paths, currentPath, step, savedAnnotations, currentAnnotationColor]);

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

  // Save current drawing as annotation and continue drawing more
  const handleSaveAndContinue = () => {
    if (paths.length === 0) return;
    const label = annotationLabel.trim() || structureLabel;
    setSavedAnnotations((prev) => [...prev, {
      id: `ma_${Date.now()}`,
      label,
      paths: [...paths],
      color: currentAnnotationColor,
    }]);
    setPaths([]);
    setCurrentPath([]);
    setAnnotationLabel('');
  };

  // Remove a saved annotation
  const handleRemoveSavedAnnotation = (id: string) => {
    setSavedAnnotations((prev) => prev.filter((a) => a.id !== id));
  };

  // AI CALL — using shared geminiClient with modality-aware system prompt
  const callAI = async (prompt: string, base64: string | null): Promise<string> => {
    const systemPrompt = getSystemPrompt(selectedModality || undefined);
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

    const scoringHint = selectedCategory ? getScoringHint(selectedCategory.id, selectedModality || undefined) : null;
    if (scoringHint) prompt += `\n\n${scoringHint}`;
    if (selectedModality) prompt += `\nModalite: ${selectedModality}`;
    prompt += getResponseTypeInstruction(selectedResponseType);

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

    const scoringHint = getScoringHint(selectedStructure, selectedModality || undefined);
    if (scoringHint) prompt += `\n\n${scoringHint}`;
    if (selectedModality) prompt += `\nModalite: ${selectedModality}`;
    prompt += getResponseTypeInstruction(selectedResponseType);

    const text = await callAI(prompt, base64);
    setMessages([{ role: 'ai', text }]);
    setAnalyzing(false);
  };

  const handleAnnotatedAnalyze = async () => {
    setAnalyzing(true); setStep('result');

    // Auto-save current paths if not saved yet
    let allAnnotations = [...savedAnnotations];
    if (paths.length > 0) {
      const label = annotationLabel.trim() || structureLabel;
      allAnnotations.push({
        id: `ma_${Date.now()}`,
        label,
        paths: [...paths],
        color: currentAnnotationColor,
      });
    }

    const base64 = getAnnotatedBase64();

    let prompt: string;
    let userMsg: string;

    if (allAnnotations.length > 1) {
      // Multiple annotated regions
      const regionList = allAnnotations.map((a, i) =>
        `${i + 1}. "${a.label}" (${a.color} renk ile isaretli)`
      ).join('\n');
      prompt = `Bu goruntude ${allAnnotations.length} farkli bolge isaretlenmistir:\n${regionList}\n\nHer isaretli bolgeyi ayri ayri degerlendir. Her bolge icin bulgularini ve yorumunu ayri basliklar altinda yaz.`;
      userMsg = `${allAnnotations.length} isaretli bolge: ${allAnnotations.map((a) => a.label).join(', ')}`;
    } else {
      const label = allAnnotations[0]?.label || annotationLabel.trim() || structureLabel;
      prompt = `Bu goruntude isaretlenmis bolgeyi analiz et. Kullanici bu alanin "${label}" oldugunu belirtiyor. Isaretli bolgedeki bulgulari detayli degerlendir. Patoloji varsa tanimla.`;
      userMsg = `Isaretli bolge: "${label}"`;
    }

    if (hasContext()) {
      prompt += buildClinicalContextString(clinicalContext);
    }

    const scoringHint = getScoringHint(selectedStructure, selectedModality || undefined);
    if (scoringHint) prompt += `\n\n${scoringHint}`;
    if (selectedModality) prompt += `\nModalite: ${selectedModality}`;
    prompt += getResponseTypeInstruction(selectedResponseType);

    const text = await callAI(prompt, base64);
    setMessages([{ role: 'user', text: userMsg }, { role: 'ai', text }]);
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
    if (selectedModality) prompt += `\nModalite: ${selectedModality}`;
    prompt += getResponseTypeInstruction(selectedResponseType);

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
    setSelectedModality(''); setSelectedResponseType('report');
    setAnnotationLabel(''); setBaseImage(null);
    setSavedAnnotations([]);
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

          {/* Modality selector */}
          <div style={{ padding: '4px 16px 0' }}>
            <div className="mobile-section-label">Modalite</div>
            <div className="mobile-organ-scroll">
              {[
                { id: '', label: 'Otomatik' },
                { id: 'CT', label: 'BT' },
                { id: 'MR', label: 'MR' },
                { id: 'CR', label: 'Röntgen' },
                { id: 'US', label: 'US' },
                { id: 'MG', label: 'Mamografi' },
                { id: 'NM', label: 'Nükleer' },
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedModality(m.id)}
                  className={`mobile-organ-btn ${selectedModality === m.id ? 'selected' : 'unselected'}`}
                  style={{ minWidth: 'auto', padding: '6px 10px' }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Response type selector */}
          <div style={{ padding: '4px 16px 0' }}>
            <div className="mobile-section-label">Yanit Tipi</div>
            <div className="mobile-organ-scroll">
              {RESPONSE_TYPES.map((rt) => (
                <button
                  key={rt.id}
                  onClick={() => setSelectedResponseType(rt.id)}
                  className={`mobile-organ-btn ${selectedResponseType === rt.id ? 'selected' : 'unselected'}`}
                  style={{ minWidth: 'auto', padding: '6px 10px' }}
                >
                  <span style={{ marginRight: 3 }}>{rt.icon}</span>{rt.label}
                </button>
              ))}
            </div>
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
              onClick={() => { setStep('annotate'); setPaths([]); setAnnotationLabel(''); setSavedAnnotations([]); setTimeout(initAnnotationCanvas, 100); }}
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
            {paths.length === 0 && savedAnnotations.length === 0 && (
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
            {/* Saved annotations badges */}
            {savedAnnotations.length > 0 && (
              <div style={{
                position: 'absolute', top: 8, right: 8,
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                {savedAnnotations.map((ann) => (
                  <div key={ann.id} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '3px 8px', borderRadius: 12,
                    background: 'rgba(0,0,0,0.7)',
                    border: `1px solid ${ann.color}`,
                    fontSize: 10, color: ann.color, fontWeight: 600,
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: ann.color, flexShrink: 0,
                    }} />
                    {ann.label}
                    <button
                      onClick={() => handleRemoveSavedAnnotation(ann.id)}
                      style={{
                        border: 'none', background: 'none', color: ann.color,
                        cursor: 'pointer', fontSize: 12, padding: 0, lineHeight: 1,
                      }}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
            {(paths.length > 0 || savedAnnotations.length > 0) && (
              <div className="mobile-path-count" style={{ background: currentAnnotationColor + 'CC' }}>
                {savedAnnotations.length > 0 ? `${savedAnnotations.length + (paths.length > 0 ? 1 : 0)} bolge` : `${paths.length} cizim`}
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
            <div style={{ display: 'flex', gap: 8 }}>
              {/* Save & Continue — for adding multiple annotations */}
              <button
                onClick={handleSaveAndContinue}
                disabled={paths.length === 0}
                style={{
                  flex: 1,
                  padding: '10px 12px', borderRadius: 10,
                  border: `1px solid ${paths.length > 0 ? currentAnnotationColor : 'var(--border)'}`,
                  background: paths.length > 0 ? currentAnnotationColor + '15' : 'var(--bg-tertiary)',
                  color: paths.length > 0 ? currentAnnotationColor : 'var(--text-muted)',
                  fontSize: 13, fontWeight: 600, cursor: paths.length > 0 ? 'pointer' : 'default',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  opacity: paths.length > 0 ? 1 : 0.5,
                }}
              >
                + Ekle & Devam Et
              </button>
              {/* Analyze all */}
              <button
                onClick={handleAnnotatedAnalyze}
                disabled={paths.length === 0 && savedAnnotations.length === 0}
                className={`mobile-btn-analyze-annotated ${(paths.length > 0 || savedAnnotations.length > 0) ? 'enabled' : 'disabled'}`}
                style={{ flex: 1 }}
              >
                {(savedAnnotations.length + (paths.length > 0 ? 1 : 0)) > 1
                  ? `${savedAnnotations.length + (paths.length > 0 ? 1 : 0)} Bolgeyi Analiz Et`
                  : 'Analiz Et'}
              </button>
            </div>
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
