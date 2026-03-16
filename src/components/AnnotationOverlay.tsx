import { useState, useRef, useEffect, useCallback } from 'react';

// Common radiology organ/region presets
const ORGAN_PRESETS = [
  { id: 'general', label: 'Genel Analiz', icon: '🔍', color: '#3b82f6' },
  { id: 'brain', label: 'Beyin', icon: '🧠', color: '#a855f7' },
  { id: 'spine', label: 'Omurga', icon: '🦴', color: '#f59e0b' },
  { id: 'chest', label: 'Göğüs', icon: '🫁', color: '#22c55e' },
  { id: 'heart', label: 'Kalp', icon: '❤️', color: '#ef4444' },
  { id: 'abdomen', label: 'Abdomen', icon: '🫃', color: '#06b6d4' },
  { id: 'liver', label: 'Karaciğer', icon: '🟤', color: '#92400e' },
  { id: 'kidney', label: 'Böbrek', icon: '🫘', color: '#dc2626' },
  { id: 'pelvis', label: 'Pelvis', icon: '🦴', color: '#7c3aed' },
  { id: 'extremity', label: 'Ekstremite', icon: '🦵', color: '#0891b2' },
  { id: 'neck', label: 'Boyun', icon: '🔵', color: '#2563eb' },
  { id: 'eye', label: 'Göz', icon: '👁️', color: '#4f46e5' },
];

export interface AnnotationData {
  organ: string;
  organLabel: string;
  drawingDataUrl: string | null; // cropped region as base64
  fullImageWithAnnotation: string | null; // full image with drawing overlay
  hasDrawing: boolean;
}

interface AnnotationOverlayProps {
  visible: boolean;
  onAnalyze: (data: AnnotationData) => void;
  onClose: () => void;
  captureBase: () => Promise<string | null>; // base image capture function
}

export default function AnnotationOverlay({
  visible,
  onAnalyze,
  onClose,
  captureBase,
}: AnnotationOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedOrgan, setSelectedOrgan] = useState('general');
  const [drawMode, setDrawMode] = useState<'organ' | 'draw'>('organ');
  const [paths, setPaths] = useState<{ x: number; y: number }[][]>([]);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [brushSize, setBrushSize] = useState(3);
  const [canvasReady, setCanvasReady] = useState(false);
  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
  const [isMobile] = useState(() => window.innerWidth <= 768);

  // Initialize canvas with base image
  useEffect(() => {
    if (!visible) return;

    const initCanvas = async () => {
      const base64 = await captureBase();
      if (!base64 || !canvasRef.current) return;

      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current!;
        const container = canvas.parentElement!;
        const containerW = container.clientWidth;
        const containerH = container.clientHeight;

        // Fit image to container
        const scale = Math.min(containerW / img.width, containerH / img.height);
        canvas.width = containerW;
        canvas.height = containerH;

        const ctx = canvas.getContext('2d')!;
        const drawW = img.width * scale;
        const drawH = img.height * scale;
        const offsetX = (containerW - drawW) / 2;
        const offsetY = (containerH - drawH) / 2;

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, containerW, containerH);
        ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

        setBaseImage(img);
        setCanvasReady(true);
      };
      img.src = `data:image/png;base64,${base64}`;
    };

    initCanvas();
    setPaths([]);
    setCurrentPath([]);
  }, [visible, captureBase]);

  // Redraw canvas with all paths
  const redraw = useCallback(() => {
    if (!canvasRef.current || !baseImage) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const containerW = canvas.width;
    const containerH = canvas.height;

    const scale = Math.min(containerW / baseImage.width, containerH / baseImage.height);
    const drawW = baseImage.width * scale;
    const drawH = baseImage.height * scale;
    const offsetX = (containerW - drawW) / 2;
    const offsetY = (containerH - drawH) / 2;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, containerW, containerH);
    ctx.drawImage(baseImage, offsetX, offsetY, drawW, drawH);

    // Draw all saved paths
    const organColor = ORGAN_PRESETS.find((o) => o.id === selectedOrgan)?.color || '#ef4444';
    const allPaths = [...paths, ...(currentPath.length > 0 ? [currentPath] : [])];

    for (const path of allPaths) {
      if (path.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x, path[i].y);
      }
      ctx.strokeStyle = organColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.85;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // If paths form a closed region, fill with transparent overlay
    if (paths.length > 0) {
      const lastPath = paths[paths.length - 1];
      if (lastPath.length > 10) {
        ctx.beginPath();
        ctx.moveTo(lastPath[0].x, lastPath[0].y);
        for (let i = 1; i < lastPath.length; i++) {
          ctx.lineTo(lastPath[i].x, lastPath[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = organColor + '20';
        ctx.fill();
      }
    }
  }, [baseImage, paths, currentPath, selectedOrgan, brushSize]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  // Mouse/touch handlers
  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (drawMode !== 'draw') return;
    setIsDrawing(true);
    const pos = getPos(e);
    setCurrentPath([pos]);
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || drawMode !== 'draw') return;
    const pos = getPos(e);
    setCurrentPath((prev) => [...prev, pos]);
  };

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentPath.length > 1) {
      setPaths((prev) => [...prev, currentPath]);
    }
    setCurrentPath([]);
  };

  // Clear drawings
  const handleClear = () => {
    setPaths([]);
    setCurrentPath([]);
    redraw();
  };

  // Undo last path
  const handleUndo = () => {
    setPaths((prev) => prev.slice(0, -1));
  };

  // Analyze
  const handleAnalyze = () => {
    if (!canvasRef.current) return;

    const hasDrawing = paths.length > 0;
    let fullImageWithAnnotation: string | null = null;
    let drawingDataUrl: string | null = null;

    if (hasDrawing) {
      // Full image with annotation overlay
      fullImageWithAnnotation = canvasRef.current.toDataURL('image/png').split(',')[1];

      // Try to crop to drawn region
      const allPoints = paths.flat();
      if (allPoints.length > 0) {
        const minX = Math.max(0, Math.min(...allPoints.map((p) => p.x)) - 20);
        const minY = Math.max(0, Math.min(...allPoints.map((p) => p.y)) - 20);
        const maxX = Math.min(canvasRef.current.width, Math.max(...allPoints.map((p) => p.x)) + 20);
        const maxY = Math.min(canvasRef.current.height, Math.max(...allPoints.map((p) => p.y)) + 20);

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = maxX - minX;
        cropCanvas.height = maxY - minY;
        const cropCtx = cropCanvas.getContext('2d')!;
        cropCtx.drawImage(
          canvasRef.current,
          minX, minY, maxX - minX, maxY - minY,
          0, 0, maxX - minX, maxY - minY
        );
        drawingDataUrl = cropCanvas.toDataURL('image/png').split(',')[1];
      }
    } else {
      // No drawing — send full image
      fullImageWithAnnotation = canvasRef.current.toDataURL('image/png').split(',')[1];
    }

    const organ = ORGAN_PRESETS.find((o) => o.id === selectedOrgan)!;
    onAnalyze({
      organ: selectedOrgan,
      organLabel: organ.label,
      drawingDataUrl,
      fullImageWithAnnotation,
      hasDrawing,
    });
  };

  if (!visible) return null;

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 30,
      display: 'flex', flexDirection: 'column',
      background: 'rgba(0,0,0,0.95)',
    }}>
      {/* Top toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 12px', background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 13, fontWeight: 600, color: 'var(--text-primary)',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}>
            Bölge Seç & İşaretle
          </span>

          {/* Mode toggle */}
          <div style={{
            display: 'flex', gap: 2, background: 'var(--bg-tertiary)',
            borderRadius: 6, padding: 2,
          }}>
            <button
              onClick={() => setDrawMode('organ')}
              style={{
                padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 600,
                background: drawMode === 'organ' ? 'var(--accent)' : 'transparent',
                color: drawMode === 'organ' ? 'white' : 'var(--text-muted)',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              Organ
            </button>
            <button
              onClick={() => setDrawMode('draw')}
              style={{
                padding: '4px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
                fontSize: 11, fontWeight: 600,
                background: drawMode === 'draw' ? 'var(--cyan)' : 'transparent',
                color: drawMode === 'draw' ? 'white' : 'var(--text-muted)',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              Çizim
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {drawMode === 'draw' && (
            <>
              {/* Brush size */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                Kalınlık
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  style={{ width: 60, accentColor: 'var(--cyan)' }}
                />
              </label>
              <button onClick={handleUndo} style={toolBtnStyle} title="Geri Al">
                ↩
              </button>
              <button onClick={handleClear} style={toolBtnStyle} title="Temizle">
                🗑
              </button>
            </>
          )}
          <button onClick={onClose} style={{ ...toolBtnStyle, background: 'rgba(239,68,68,0.3)' }}>
            ✕
          </button>
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: 'hidden' }}>
        {/* Organ sidebar / mobile horizontal strip */}
        <div style={{
          ...(isMobile
            ? { height: 'auto', display: 'flex', flexDirection: 'row', overflowX: 'auto', padding: '4px 6px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', gap: 4, alignItems: 'center', flexShrink: 0 }
            : { width: 140, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', overflowY: 'auto', padding: 6 }
          ),
        }}>
          {!isMobile && <div style={{
            fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.05em',
            padding: '6px 8px',
          }}>
            Bölge / Organ
          </div>}
          {ORGAN_PRESETS.map((organ) => (
            <button
              key={organ.id}
              onClick={() => setSelectedOrgan(organ.id)}
              style={{
                ...(isMobile
                  ? { display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 20, whiteSpace: 'nowrap' as const, flexShrink: 0 }
                  : { width: '100%', display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px', borderRadius: 6, marginBottom: 2, textAlign: 'left' as const }
                ),
                border: 'none', cursor: 'pointer',
                background: selectedOrgan === organ.id ? organ.color + '25' : 'transparent',
                color: selectedOrgan === organ.id ? organ.color : 'var(--text-secondary)',
                fontSize: isMobile ? 11 : 12, fontWeight: selectedOrgan === organ.id ? 600 : 400,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                transition: 'all 0.1s ease',
              }}
            >
              <span style={{ fontSize: isMobile ? 12 : 14 }}>{organ.icon}</span>
              {organ.label}
            </button>
          ))}
        </div>

        {/* Canvas */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <canvas
            ref={canvasRef}
            style={{
              width: '100%', height: '100%',
              cursor: drawMode === 'draw' ? 'crosshair' : 'default',
              touchAction: 'none',
            }}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
          />

          {/* Drawing hint */}
          {drawMode === 'draw' && paths.length === 0 && canvasReady && (
            <div style={{
              position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
              padding: '6px 14px', borderRadius: 8,
              background: 'rgba(0,0,0,0.7)', border: '1px solid var(--border)',
              fontSize: 12, color: 'var(--text-secondary)',
              pointerEvents: 'none', whiteSpace: 'nowrap',
            }}>
              Lezyonu veya ilgilendiğiniz bölgeyi çizin
            </div>
          )}

          {/* Selected organ badge */}
          <div style={{
            position: 'absolute', top: 12, left: 12,
            padding: '4px 10px', borderRadius: 6,
            background: (ORGAN_PRESETS.find((o) => o.id === selectedOrgan)?.color || '#3b82f6') + '30',
            color: ORGAN_PRESETS.find((o) => o.id === selectedOrgan)?.color || '#3b82f6',
            fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
          }}>
            {ORGAN_PRESETS.find((o) => o.id === selectedOrgan)?.icon}{' '}
            {ORGAN_PRESETS.find((o) => o.id === selectedOrgan)?.label}
            {paths.length > 0 && ` + ${paths.length} çizim`}
          </div>
        </div>
      </div>

      {/* Bottom action bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px', background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {selectedOrgan === 'general'
            ? 'Tüm görüntü analiz edilecek'
            : paths.length > 0
              ? 'İşaretli bölge + organ bilgisi ile analiz'
              : 'Seçili organ odaklı analiz (çizim opsiyonel)'}
        </div>
        <button
          onClick={handleAnalyze}
          disabled={!canvasReady}
          style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, var(--accent), var(--accent-dim))',
            color: 'white', fontSize: 13, fontWeight: 600,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            opacity: canvasReady ? 1 : 0.5,
          }}
        >
          🔬 Analiz Et
        </button>
      </div>
    </div>
  );
}

const toolBtnStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 6, border: 'none',
  background: 'var(--bg-hover)', color: 'var(--text-primary)',
  cursor: 'pointer', display: 'flex', alignItems: 'center',
  justifyContent: 'center', fontSize: 13,
};
