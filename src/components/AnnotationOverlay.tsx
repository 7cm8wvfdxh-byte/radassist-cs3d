import { useState, useRef, useEffect, useCallback } from 'react';
import { ORGAN_PRESETS } from '../lib/organTree';
import { drawCanvasWithPaths, getCanvasPosition, initCanvasFromBase64 } from '../lib/canvasUtils';
import type { CanvasPath, AnnotationLayer } from '../lib/canvasUtils';
import type { AnnotationOverlayProps, AnnotationEntry } from '../types';

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
  const [paths, setPaths] = useState<CanvasPath[][]>([]);
  const [currentPath, setCurrentPath] = useState<CanvasPath[]>([]);
  const [brushSize, setBrushSize] = useState(3);
  const [canvasReady, setCanvasReady] = useState(false);
  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
  const [isMobile] = useState(() => window.innerWidth <= 768);

  // Multi-annotation state
  const [annotations, setAnnotations] = useState<AnnotationEntry[]>([]);

  const selectedOrganPreset = ORGAN_PRESETS.find((o) => o.id === selectedOrgan);
  const organColor = selectedOrganPreset?.color || '#ef4444';

  // Build annotation layers for rendering
  const annotationLayers: AnnotationLayer[] = annotations.map((a) => ({
    paths: a.paths,
    color: a.color,
  }));

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
    setAnnotations([]);
  }, [visible, captureBase]);

  // Redraw canvas
  const redraw = useCallback(() => {
    if (!canvasRef.current || !baseImage) return;
    drawCanvasWithPaths({
      canvas: canvasRef.current,
      baseImage,
      paths,
      currentPath,
      strokeColor: organColor,
      lineWidth: brushSize,
      layers: annotationLayers,
    });
  }, [baseImage, paths, currentPath, organColor, brushSize, annotationLayers]);

  useEffect(() => { redraw(); }, [redraw]);

  // Pointer handlers
  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (drawMode !== 'draw' || !canvasRef.current) return;
    setIsDrawing(true);
    setCurrentPath([getCanvasPosition(e, canvasRef.current)]);
  };
  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || drawMode !== 'draw' || !canvasRef.current) return;
    setCurrentPath((prev) => [...prev, getCanvasPosition(e, canvasRef.current!)]);
  };
  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentPath.length > 1) setPaths((prev) => [...prev, currentPath]);
    setCurrentPath([]);
  };

  // Clear current paths (not saved annotations)
  const handleClear = () => { setPaths([]); setCurrentPath([]); };
  const handleUndo = () => { setPaths((prev) => prev.slice(0, -1)); };

  // Save current drawing as an annotation entry
  const handleSaveAnnotation = () => {
    if (paths.length === 0 || !selectedOrganPreset) return;
    const entry: AnnotationEntry = {
      id: `ann_${Date.now()}`,
      organId: selectedOrgan,
      organLabel: selectedOrganPreset.label,
      organIcon: selectedOrganPreset.icon,
      color: organColor,
      paths: [...paths],
    };
    setAnnotations((prev) => [...prev, entry]);
    setPaths([]);
    setCurrentPath([]);
  };

  // Remove a saved annotation
  const handleRemoveAnnotation = (id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  };

  // Analyze — sends all annotations
  const handleAnalyze = () => {
    if (!canvasRef.current || !selectedOrganPreset) return;

    // Auto-save current paths if user hasn't clicked "Ekle" yet
    let allAnnotations = [...annotations];
    if (paths.length > 0) {
      allAnnotations.push({
        id: `ann_${Date.now()}`,
        organId: selectedOrgan,
        organLabel: selectedOrganPreset.label,
        organIcon: selectedOrganPreset.icon,
        color: organColor,
        paths: [...paths],
      });
    }

    const hasDrawing = allAnnotations.some((a) => a.paths.length > 0);

    // Get canvas image with all annotations rendered
    const fullImageWithAnnotation = canvasRef.current.toDataURL('image/png').split(',')[1];
    let drawingDataUrl: string | null = null;

    // Crop to drawn region (all annotations combined)
    if (hasDrawing) {
      const allPoints = allAnnotations.flatMap((a) => a.paths.flat());
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
          drawingDataUrl = cropCanvas.toDataURL('image/png').split(',')[1];
        }
      }
    }

    // Build combined organ label
    const uniqueLabels = [...new Set(allAnnotations.map((a) => a.organLabel))];
    const combinedLabel = uniqueLabels.length > 0
      ? uniqueLabels.join(', ')
      : selectedOrganPreset.label;
    const primaryOrgan = allAnnotations[0]?.organId || selectedOrgan;

    onAnalyze({
      organ: primaryOrgan,
      organLabel: combinedLabel,
      drawingDataUrl,
      fullImageWithAnnotation,
      hasDrawing,
      annotations: allAnnotations,
    });
  };

  if (!visible) return null;

  const totalAnnotations = annotations.length + (paths.length > 0 ? 1 : 0);

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
            Bolge Sec & Isaretle
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
              Cizim
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {drawMode === 'draw' && (
            <>
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
            </>
          )}
          <button onClick={onClose} style={{ ...toolBtnStyle, background: 'rgba(239,68,68,0.3)' }}>&times;</button>
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: 'hidden' }}>
        {/* Organ sidebar */}
        <div style={{
          ...(isMobile
            ? { height: 'auto', display: 'flex', flexDirection: 'row' as const, overflowX: 'auto', padding: '4px 6px', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)', gap: 4, alignItems: 'center', flexShrink: 0 }
            : { width: 140, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', overflowY: 'auto' as const, padding: 6, display: 'flex', flexDirection: 'column' as const }
          ),
        }}>
          {!isMobile && <div style={{
            fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.05em',
            padding: '6px 8px',
          }}>
            Bolge / Organ
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

          {/* Saved annotations list (desktop only) */}
          {!isMobile && annotations.length > 0 && (
            <>
              <div style={{
                fontSize: 10, fontWeight: 600, color: 'var(--text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.05em',
                padding: '10px 8px 4px',
                borderTop: '1px solid var(--border)',
                marginTop: 6,
              }}>
                Isaretlemeler ({annotations.length})
              </div>
              {annotations.map((ann) => (
                <div key={ann.id} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '5px 8px', borderRadius: 6, marginBottom: 2,
                  background: ann.color + '15',
                  fontSize: 11, color: ann.color,
                }}>
                  <span>{ann.organIcon}</span>
                  <span style={{ flex: 1, fontWeight: 500 }}>{ann.organLabel}</span>
                  <span style={{ fontSize: 9, opacity: 0.7 }}>{ann.paths.length}</span>
                  <button
                    onClick={() => handleRemoveAnnotation(ann.id)}
                    style={{
                      border: 'none', background: 'none', color: ann.color,
                      cursor: 'pointer', fontSize: 12, padding: '0 2px', opacity: 0.6,
                    }}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </>
          )}
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
          {drawMode === 'draw' && paths.length === 0 && annotations.length === 0 && canvasReady && (
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

          {/* Current organ badge */}
          <div style={{
            position: 'absolute', top: 12, left: 12,
            padding: '4px 10px', borderRadius: 6,
            background: organColor + '30', color: organColor,
            fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
          }}>
            {selectedOrganPreset?.icon}{' '}
            {selectedOrganPreset?.label}
            {paths.length > 0 && ` + ${paths.length} cizim`}
          </div>

          {/* Saved annotations badges (mobile) */}
          {isMobile && annotations.length > 0 && (
            <div style={{
              position: 'absolute', top: 12, right: 12,
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              {annotations.map((ann) => (
                <div key={ann.id} style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px', borderRadius: 6,
                  background: ann.color + '30', color: ann.color,
                  fontSize: 10, fontWeight: 600,
                }}>
                  {ann.organIcon} {ann.organLabel}
                  <button
                    onClick={() => handleRemoveAnnotation(ann.id)}
                    style={{ border: 'none', background: 'none', color: ann.color, cursor: 'pointer', fontSize: 11, padding: 0 }}
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom action bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 12px', background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border)', gap: 8,
      }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>
          {totalAnnotations > 0
            ? `${totalAnnotations} isaretleme`
            : selectedOrgan === 'general'
              ? 'Tum goruntu analiz edilecek'
              : 'Secili organ odakli analiz (cizim opsiyonel)'}
        </div>

        {/* Save annotation button — visible when there are unsaved paths */}
        {paths.length > 0 && (
          <button
            onClick={handleSaveAnnotation}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg-tertiary)', cursor: 'pointer',
              color: organColor, fontSize: 12, fontWeight: 600,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            + Ekle & Devam Et
          </button>
        )}

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
          {totalAnnotations > 1 ? `${totalAnnotations} Bolgeyi Analiz Et` : 'Analiz Et'}
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
