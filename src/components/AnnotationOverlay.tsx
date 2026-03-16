import { useState, useRef, useEffect, useCallback } from 'react';
import { drawCanvasWithPaths, getCanvasPosition, initCanvasFromBase64 } from '../lib/canvasUtils';
import type { CanvasPath } from '../lib/canvasUtils';
import type { AnnotationOverlayProps } from '../types';

export default function AnnotationOverlay({
  visible,
  onAnalyze,
  onClose,
  captureBase,
}: AnnotationOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [paths, setPaths] = useState<CanvasPath[][]>([]);
  const [currentPath, setCurrentPath] = useState<CanvasPath[]>([]);
  const [brushSize, setBrushSize] = useState(3);
  const [canvasReady, setCanvasReady] = useState(false);
  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);

  const drawColor = '#06b6d4'; // cyan

  // Initialize canvas
  useEffect(() => {
    if (!visible) return;
    const initCanvas = async () => {
      const base64 = await captureBase();
      if (!base64 || !canvasRef.current) return;
      initCanvasFromBase64(canvasRef.current, base64, (img) => {
        if (!canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        if (!ctx) return;
        const container = canvasRef.current.parentElement;
        if (!container) return;
        const cW = container.clientWidth;
        const cH = container.clientHeight;
        const scale = Math.min(cW / img.width, cH / img.height);
        const dW = img.width * scale;
        const dH = img.height * scale;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, cW, cH);
        ctx.drawImage(img, (cW - dW) / 2, (cH - dH) / 2, dW, dH);
        setBaseImage(img);
        setCanvasReady(true);
      });
    };
    initCanvas();
    setPaths([]);
    setCurrentPath([]);
  }, [visible, captureBase]);

  // Redraw canvas
  const redraw = useCallback(() => {
    if (!canvasRef.current || !baseImage) return;
    drawCanvasWithPaths({
      canvas: canvasRef.current,
      baseImage,
      paths,
      currentPath,
      strokeColor: drawColor,
      lineWidth: brushSize,
    });
  }, [baseImage, paths, currentPath, brushSize]);

  useEffect(() => { redraw(); }, [redraw]);

  // Pointer handlers — always active (drawing mode only)
  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return;
    setIsDrawing(true);
    setCurrentPath([getCanvasPosition(e, canvasRef.current)]);
  };
  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !canvasRef.current) return;
    setCurrentPath((prev) => [...prev, getCanvasPosition(e, canvasRef.current!)]);
  };
  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentPath.length > 1) setPaths((prev) => [...prev, currentPath]);
    setCurrentPath([]);
  };

  const handleClear = () => { setPaths([]); setCurrentPath([]); };
  const handleUndo = () => { setPaths((prev) => prev.slice(0, -1)); };

  // Analyze — sends drawing with compressed image
  const handleAnalyze = () => {
    if (!canvasRef.current) return;

    const hasDrawing = paths.length > 0;

    // Compress canvas to JPEG and resize if too large
    const compressCanvas = (srcCanvas: HTMLCanvasElement): string => {
      const MAX_DIM = 1536;
      let { width, height } = srcCanvas;
      if (width > MAX_DIM || height > MAX_DIM) {
        const scale = MAX_DIM / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = width;
        tmpCanvas.height = height;
        const tmpCtx = tmpCanvas.getContext('2d');
        if (tmpCtx) {
          tmpCtx.drawImage(srcCanvas, 0, 0, width, height);
          return tmpCanvas.toDataURL('image/jpeg', 0.82).split(',')[1];
        }
      }
      return srcCanvas.toDataURL('image/jpeg', 0.82).split(',')[1];
    };

    const fullImageWithAnnotation = compressCanvas(canvasRef.current);
    let drawingDataUrl: string | null = null;

    // Crop to drawn region
    if (hasDrawing) {
      const allPoints = paths.flat();
      if (allPoints.length > 0) {
        const minX = Math.max(0, Math.min(...allPoints.map((p) => p.x)) - 20);
        const minY = Math.max(0, Math.min(...allPoints.map((p) => p.y)) - 20);
        const maxX = Math.min(canvasRef.current.width, Math.max(...allPoints.map((p) => p.x)) + 20);
        const maxY = Math.min(canvasRef.current.height, Math.max(...allPoints.map((p) => p.y)) + 20);
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = maxX - minX;
        cropCanvas.height = maxY - minY;
        const cropCtx = cropCanvas.getContext('2d');
        if (cropCtx) {
          cropCtx.drawImage(canvasRef.current, minX, minY, maxX - minX, maxY - minY, 0, 0, maxX - minX, maxY - minY);
          drawingDataUrl = compressCanvas(cropCanvas);
        }
      }
    }

    onAnalyze({
      organ: 'general',
      organLabel: hasDrawing ? 'Isaretli bolge' : 'Genel',
      drawingDataUrl,
      fullImageWithAnnotation,
      hasDrawing,
      annotations: [],
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
            Bolge Isaretle & Ciz
          </span>
          <span style={{
            fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic',
          }}>
            (Organ secimi sag panelde)
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)' }}>
            Kalinlik
            <input
              type="range" min="1" max="10" value={brushSize}
              onChange={(e) => setBrushSize(Number(e.target.value))}
              style={{ width: 60, accentColor: 'var(--cyan)' }}
            />
          </label>
          <button onClick={handleUndo} style={toolBtnStyle} title="Geri Al">{'<-'}</button>
          <button onClick={handleClear} style={toolBtnStyle} title="Temizle">X</button>
          <button onClick={onClose} style={{ ...toolBtnStyle, background: 'rgba(239,68,68,0.3)' }}>&times;</button>
        </div>
      </div>

      {/* Canvas — full area, no sidebar */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          style={{
            width: '100%', height: '100%',
            cursor: 'crosshair',
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
        {paths.length === 0 && canvasReady && (
          <div style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            padding: '6px 14px', borderRadius: 8,
            background: 'rgba(0,0,0,0.7)', border: '1px solid var(--border)',
            fontSize: 12, color: 'var(--text-secondary)',
            pointerEvents: 'none', whiteSpace: 'nowrap',
          }}>
            Lezyonu veya ilgilendiginiz bolgeyi cizin
          </div>
        )}

        {/* Drawing count badge */}
        {paths.length > 0 && (
          <div style={{
            position: 'absolute', top: 12, left: 12,
            padding: '4px 10px', borderRadius: 6,
            background: 'rgba(6,182,212,0.3)', color: '#06b6d4',
            fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
          }}>
            {paths.length} cizim
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px', background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border)', gap: 8,
      }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>
          {paths.length > 0
            ? `${paths.length} cizim yapildi — Analiz Et ile AI'a gonder`
            : 'Cizim yapmadan dogrudan analiz de yapabilirsiniz'}
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
          Analiz Et
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
