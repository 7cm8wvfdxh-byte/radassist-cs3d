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
  const [paths, setPaths] = useState<{ x: number; y: number }[][]>([]);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
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

  // ANNOTATION CANVAS
  const initAnnotationCanvas = useCallback(async () => {
    const base64 = await getBase64();
    if (!base64 || !canvasRef.current) return;
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current!;
      const parent = canvas.parentElement!;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      setBaseImage(img);
    };
    img.src = `data:image/png;base64,${base64}`;
  }, [mediaFile, mediaType]);

  // Redraw annotation canvas
  useEffect(() => {
    if (step !== 'annotate' || !baseImage || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width, h = canvas.height;
    const scale = Math.min(w / baseImage.width, h / baseImage.height);
    const dw = baseImage.width * scale, dh = baseImage.height * scale;
    const ox = (w - dw) / 2, oy = (h - dh) / 2;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(baseImage, ox, oy, dw, dh);

    const allPaths = [...paths, ...(currentPath.length > 1 ? [currentPath] : [])];
    for (const path of allPaths) {
      if (path.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) ctx.lineTo(path[i].x, path[i].y);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    if (paths.length > 0) {
      const last = paths[paths.length - 1];
      if (last.length > 5) {
        ctx.beginPath();
        ctx.moveTo(last[0].x, last[0].y);
        for (let i = 1; i < last.length; i++) ctx.lineTo(last[i].x, last[i].y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(239,68,68,0.15)';
        ctx.fill();
      }
    }
  }, [baseImage, paths, currentPath, step]);

  const getCanvasPos = (e: React.TouchEvent | React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const cy = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return { x: cx - rect.left, y: cy - rect.top };
  };
  const onDown = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault(); setAnnotating(true); setCurrentPath([getCanvasPos(e)]);
  };
  const onMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!annotating) return; e.preventDefault();
    setCurrentPath((p) => [...p, getCanvasPos(e)]);
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

    let prompt = 'Bu goruntuyu genel olarak analiz et. Tum yapilari degerlendir, sistematik rapor hazirla.';
    if (hasContext()) {
      prompt += buildClinicalContextString(clinicalContext);
    }

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
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#0a0a0c', color: '#e8e8ec', fontFamily: "'Plus Jakarta Sans',sans-serif", overflow: 'hidden' }}>

      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderBottom: '1px solid #1e1e24', background: '#111114', flexShrink: 0, zIndex: 5 }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#3b82f6,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', fontFamily: "'JetBrains Mono',monospace" }}>RA</div>
        <span style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>RadAssist</span>
        {step !== 'capture' && <button onClick={step === 'annotate' ? () => setStep('review') : handleReset} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid #2a2a35', background: 'transparent', color: '#9898a8', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>{step === 'annotate' ? 'Geri' : 'Yeni'}</button>}
        <span style={{ fontSize: 10, color: '#606070' }}>{getUser()}</span>
      </div>

      {/* CAPTURE */}
      {step === 'capture' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileSelect} />
          <input ref={galleryRef} type="file" accept="image/*,video/*,.dcm" style={{ display: 'none' }} onChange={handleFileSelect} />
          <div style={{ fontSize: 48, marginBottom: 16 }}>{'<_>'}</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, textAlign: 'center' }}>Goruntu veya Video Yukle</h2>
          <p style={{ fontSize: 14, color: '#9898a8', marginBottom: 32, textAlign: 'center' }}>Fotograf cekin, galeriden secin veya video yukleyin</p>
          <button onClick={() => cameraRef.current?.click()} style={{ ...btnP, marginBottom: 12 }}>Fotograf Cek</button>
          <button onClick={() => galleryRef.current?.click()} style={btnS}>Galeri / Video Sec</button>
          {/* Disclaimer */}
          <div style={{ marginTop: 32, padding: '10px 16px', borderRadius: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.15)', fontSize: 11, color: '#d97706', lineHeight: 1.5, maxWidth: 340, textAlign: 'center' }}>
            {MEDICAL_DISCLAIMER}
          </div>
        </div>
      )}

      {/* REVIEW */}
      {step === 'review' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {/* Media */}
          <div
            ref={videoContainerRef}
            style={{
              width: '100%',
              ...(isFullscreen
                ? { height: '100%', maxHeight: 'none' }
                : { aspectRatio: '16/10', maxHeight: '40vh' }),
              background: '#000', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative',
            }}
          >
            {mediaType === 'image'
              ? <img src={mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              : <video ref={videoRef} src={mediaUrl} controls playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            }

            {mediaType === 'video' && (
              <div style={{
                position: 'absolute', bottom: isFullscreen ? 60 : 8, left: 0, right: 0,
                display: 'flex', justifyContent: 'center', gap: 8,
                padding: '0 16px', zIndex: 10,
              }}>
                <button onClick={captureFrame} style={{
                  padding: '10px 20px', borderRadius: 12,
                  border: 'none', background: 'rgba(6,182,212,0.9)',
                  backdropFilter: 'blur(8px)',
                  color: '#fff', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 2px 12px rgba(6,182,212,0.4)',
                }}>
                  Kare Yakala {frames.length > 0 ? `(${frames.length})` : ''}
                </button>
                <button onClick={toggleFullscreen} style={{
                  padding: '10px 14px', borderRadius: 12,
                  border: 'none', background: 'rgba(255,255,255,0.15)',
                  backdropFilter: 'blur(8px)',
                  color: '#fff', fontSize: 14, cursor: 'pointer',
                }}>
                  {isFullscreen ? '[-]' : '[+]'}
                </button>
              </div>
            )}

            {mediaType === 'video' && isFullscreen && frames.length > 0 && (
              <div style={{
                position: 'absolute', top: 16, right: 16,
                padding: '6px 14px', borderRadius: 10,
                background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                color: '#06b6d4', fontSize: 13, fontWeight: 700, zIndex: 10,
              }}>
                {frames.length} kare yakalandi
              </div>
            )}
          </div>

          {/* Video frame thumbnails */}
          {mediaType === 'video' && frames.length > 0 && (
            <div style={{ padding: '8px 16px', borderBottom: '1px solid #1e1e24', background: '#111114', flexShrink: 0 }}>
              <div ref={framesRef} style={{ display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
                {frames.map((f) => (
                  <div key={f.id} onClick={() => setFrames((p) => p.map((x) => x.id === f.id ? { ...x, selected: !x.selected } : x))} style={{ position: 'relative', flexShrink: 0, width: 64, borderRadius: 8, overflow: 'hidden', border: `2px solid ${f.selected ? '#3b82f6' : '#1e1e24'}`, opacity: f.selected ? 1 : 0.4 }}>
                    <img src={f.thumbnailUrl} alt="" style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover', display: 'block' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, textAlign: 'center', background: 'rgba(0,0,0,0.7)', fontSize: 8, color: '#999', padding: 1 }}>{formatTime(f.timestamp)}</div>
                    {f.selected && <div style={{ position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: 8, background: '#3b82f6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>+</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clinical context (collapsible) */}
          <div style={{ padding: '8px 16px 0' }}>
            <button
              onClick={() => setShowContext(!showContext)}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 10,
                border: `1px solid ${hasContext() ? 'rgba(34,197,94,0.3)' : '#1e1e24'}`,
                background: hasContext() ? 'rgba(34,197,94,0.08)' : '#111114',
                color: hasContext() ? '#22c55e' : '#9898a8',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <span>{hasContext() ? 'Klinik Bilgi (aktif)' : 'Klinik Bilgi Ekle (opsiyonel)'}</span>
              <span style={{ fontSize: 10 }}>{showContext ? 'v' : '>'}</span>
            </button>

            {showContext && (
              <div style={{ marginTop: 8, padding: 12, borderRadius: 10, background: '#111114', border: '1px solid #1e1e24', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={mobileLabel}>Yas</div>
                    <input type="text" placeholder="45" value={clinicalContext.age} onChange={(e) => setClinicalContext({ ...clinicalContext, age: e.target.value })} style={mobileInput} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={mobileLabel}>Cinsiyet</div>
                    <select value={clinicalContext.gender} onChange={(e) => setClinicalContext({ ...clinicalContext, gender: e.target.value as 'male' | 'female' | '' })} style={mobileInput}>
                      <option value="">-</option>
                      <option value="male">Erkek</option>
                      <option value="female">Kadin</option>
                    </select>
                  </div>
                </div>
                <div>
                  <div style={mobileLabel}>Sikayet</div>
                  <input type="text" placeholder="bas agrisi, karin agrisi..." value={clinicalContext.complaint} onChange={(e) => setClinicalContext({ ...clinicalContext, complaint: e.target.value })} style={mobileInput} />
                </div>
                <div>
                  <div style={mobileLabel}>Ozgecmis</div>
                  <input type="text" placeholder="DM, HT, bilinen kitle..." value={clinicalContext.history} onChange={(e) => setClinicalContext({ ...clinicalContext, history: e.target.value })} style={mobileInput} />
                </div>
                <div>
                  <div style={mobileLabel}>Klinik Soru</div>
                  <input type="text" placeholder="metastaz? lezyon karakteri?" value={clinicalContext.clinicalQuestion} onChange={(e) => setClinicalContext({ ...clinicalContext, clinicalQuestion: e.target.value })} style={mobileInput} />
                </div>
              </div>
            )}
          </div>

          {/* Organ picker */}
          <div style={{ padding: '12px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9898a8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Bolge / Organ</div>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 8 }}>
              {ORGAN_TREE.map((cat) => (
                <button key={cat.id} onClick={() => { setSelectedCategory(selectedCategory?.id === cat.id ? null : cat); if (cat.id === 'general') setSelectedStructure('general_full'); }}
                  style={{ flexShrink: 0, padding: '8px 12px', borderRadius: 10, border: `1.5px solid ${selectedCategory?.id === cat.id || (cat.id === 'general' && selectedStructure === 'general_full') ? '#3b82f6' : '#1e1e24'}`, background: selectedCategory?.id === cat.id ? 'rgba(59,130,246,0.15)' : '#111114', color: selectedCategory?.id === cat.id ? '#60a5fa' : '#9898a8', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 16 }}>{cat.icon}</span>{cat.label}
                </button>
              ))}
            </div>
            {selectedCategory && selectedCategory.id !== 'general' && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                {selectedCategory.structures.map((s) => (
                  <button key={s.id} onClick={() => setSelectedStructure(s.id)}
                    style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${selectedStructure === s.id ? '#06b6d4' : '#1e1e24'}`, background: selectedStructure === s.id ? 'rgba(6,182,212,0.15)' : 'transparent', color: selectedStructure === s.id ? '#22d3ee' : '#9898a8', fontSize: 11, fontWeight: selectedStructure === s.id ? 700 : 400, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ padding: '10px 16px', marginTop: 'auto', borderTop: '1px solid #1e1e24', background: '#0a0a0c', position: 'sticky', bottom: 0, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={() => { setStep('annotate'); setPaths([]); setAnnotationLabel(''); setTimeout(initAnnotationCanvas, 100); }}
              style={{ width: '100%', padding: '13px 0', borderRadius: 12, border: '1.5px solid #f59e0b', background: 'rgba(245,158,11,0.1)', color: '#fbbf24', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Bolge Isaretle + Etiketle
            </button>
            <button onClick={selectedStructure === 'general_full' ? handleGeneralAnalyze : handleStructureAnalyze}
              style={{ width: '100%', padding: '13px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {selectedStructure === 'general_full' ? 'Genel Analiz' : `${structureLabel} Analiz Et`}
            </button>
            {mediaType === 'video' && selCount > 0 && (
              <button onClick={handleMultiFrameAnalyze}
                style={{ width: '100%', padding: '13px 0', borderRadius: 12, border: '1.5px solid #06b6d4', background: 'rgba(6,182,212,0.1)', color: '#06b6d4', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                {selCount} Kareyi Toplu Analiz
              </button>
            )}
          </div>
        </div>
      )}

      {/* ANNOTATE */}
      {step === 'annotate' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, position: 'relative', background: '#000', touchAction: 'none' }}>
            <canvas ref={canvasRef}
              style={{ width: '100%', height: '100%', cursor: 'crosshair', touchAction: 'none' }}
              onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
              onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
            />
            {paths.length === 0 && (
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', pointerEvents: 'none', color: '#606070', fontSize: 13 }}>
                Parmaginizla cizin
              </div>
            )}
            <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6 }}>
              {paths.length > 0 && <>
                <button onClick={() => setPaths((p) => p.slice(0, -1))} style={floatBtn}>{'<-'}</button>
                <button onClick={() => setPaths([])} style={floatBtn}>X</button>
              </>}
            </div>
            {paths.length > 0 && (
              <div style={{ position: 'absolute', top: 10, left: 10, padding: '4px 10px', borderRadius: 8, background: 'rgba(239,68,68,0.2)', color: '#f87171', fontSize: 11, fontWeight: 600 }}>
                {paths.length} cizim
              </div>
            )}
          </div>

          <div style={{ padding: '12px 16px', background: '#111114', borderTop: '1px solid #1e1e24', flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9898a8', marginBottom: 6 }}>
              Bu isaretli alan ne? (AI'a soyle)
            </div>
            <input
              value={annotationLabel}
              onChange={(e) => setAnnotationLabel(e.target.value)}
              placeholder="Orn: sol bobrek alt pol kisti, mezenterik LAP..."
              style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #2a2a35', background: '#19191e', color: '#e8e8ec', fontSize: 15, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 10 }}
            />
            <button
              onClick={handleAnnotatedAnalyze}
              disabled={paths.length === 0}
              style={{ width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', background: paths.length > 0 ? 'linear-gradient(135deg,#ef4444,#dc2626)' : '#333', color: '#fff', fontSize: 15, fontWeight: 700, cursor: paths.length > 0 ? 'pointer' : 'default', fontFamily: 'inherit', opacity: paths.length > 0 ? 1 : 0.4 }}>
              Isaretli Bolgeyi Analiz Et
            </button>
          </div>
        </div>
      )}

      {/* RESULT */}
      {step === 'result' && (<>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', background: '#111114', borderBottom: '1px solid #1e1e24', flexShrink: 0 }}>
          <div style={{ width: 38, height: 38, borderRadius: 8, overflow: 'hidden', background: '#19191e', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {mediaType === 'image'
              ? <img src={mediaUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 14, fontFamily: "'JetBrains Mono',monospace" }}>VID</span>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{structureLabel} Analizi</div>
            <div style={{ fontSize: 11, color: '#606070' }}>{analyzing ? 'Analiz ediliyor...' : 'Tamamlandi'}</div>
          </div>
          <div style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(6,182,212,0.15)', color: '#06b6d4', fontWeight: 600 }}>Gemini</div>
        </div>

        {/* Disclaimer in result */}
        <div style={{ padding: '6px 16px', background: '#0a0a0c', flexShrink: 0 }}>
          <div style={{ padding: '4px 10px', borderRadius: 6, background: 'rgba(245,158,11,0.06)', fontSize: 9, color: '#92400e', lineHeight: 1.4 }}>
            {MEDICAL_DISCLAIMER}
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 16, minHeight: 0 }}>
          {analyzing && messages.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 40, gap: 12, color: '#606070' }}>
              <div style={{ width: 24, height: 24, border: '2.5px solid #2a2a35', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <span style={{ fontSize: 13 }}>Gemini analiz ediyor...</span>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{ marginBottom: 12, ...(m.role === 'user' ? { marginLeft: 40, padding: '10px 14px', borderRadius: '14px 14px 4px 14px', background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)', color: '#60a5fa', fontSize: 14, fontWeight: 500 } : { padding: 14, borderRadius: 14, background: '#111114', border: '1px solid #1e1e24', fontSize: 14, lineHeight: 1.7 }) }}>
              {m.role === 'ai' && <div style={{ fontSize: 10, fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Gemini 2.5 Flash</div>}
              {m.role === 'ai'
                ? <div className="ai-markdown" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }} />
                : m.text.split('\n').map((l, j) => <p key={j} style={{ margin: '3px 0' }}>{l}</p>)
              }
            </div>
          ))}
          {analyzing && messages.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
              <div style={{ width: 20, height: 20, border: '2px solid #2a2a35', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          )}
          <div ref={resultEndRef} />
        </div>

        {/* Chat */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 16px', borderTop: '1px solid #1e1e24', background: '#111114', flexShrink: 0 }}>
          <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleChat()} placeholder="Takip sorusu sor..." disabled={analyzing}
            style={{ flex: 1, padding: '12px 14px', borderRadius: 12, border: '1px solid #1e1e24', background: '#19191e', color: '#e8e8ec', fontSize: 16, fontFamily: 'inherit', outline: 'none' }} />
          <button onClick={handleChat} disabled={analyzing || !chatInput.trim()}
            style={{ width: 46, height: 46, borderRadius: 12, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 20, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: analyzing || !chatInput.trim() ? 0.4 : 1 }}>{'>'}</button>
        </div>
      </>)}
    </div>
  );
}

const btnP: React.CSSProperties = { width: '100%', maxWidth: 320, padding: '15px 0', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#3b82f6,#2563eb)', color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif" };
const btnS: React.CSSProperties = { width: '100%', maxWidth: 320, padding: '15px 0', borderRadius: 12, border: '1px solid #2a2a35', background: '#19191e', color: '#e8e8ec', fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans',sans-serif" };
const floatBtn: React.CSSProperties = { width: 36, height: 36, borderRadius: 10, border: 'none', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const mobileLabel: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: '#9898a8', marginBottom: 3 };
const mobileInput: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #2a2a35', background: '#19191e', color: '#e8e8ec', fontSize: 14, fontFamily: "'Plus Jakarta Sans',sans-serif", outline: 'none', boxSizing: 'border-box' };
