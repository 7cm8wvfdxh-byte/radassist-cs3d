import { useState, useEffect, useRef, useCallback } from 'react';
import {
  initCornerstone,
  createToolGroup,
  setActiveTool,
  loadDicomFiles,
  parseDicomMetadata,
  cornerstone,
  cornerstoneTools,
  TOOL_GROUP_ID,
  RENDERING_ENGINE_ID,
} from './lib/initCornerstone';
import ToolRail from './components/ToolRail';
import SeriesSidebar from './components/SeriesSidebar';
import AIPanel from './components/AIPanel';

interface SeriesInfo {
  seriesUID: string;
  description: string;
  modality: string;
  imageIds: string[];
  instanceCount: number;
}

interface PatientInfo {
  name: string;
  id: string;
  studyDate: string;
  studyDescription: string;
}

export default function App() {
  const [csReady, setCsReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTool, setActiveToolState] = useState('WindowLevel');
  const [series, setSeries] = useState<SeriesInfo[]>([]);
  const [activeSeries, setActiveSeries] = useState<number>(0);
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [imageIndex, setImageIndex] = useState(0);
  const [totalImages, setTotalImages] = useState(0);
  const [wwwl, setWwwl] = useState({ ww: 0, wl: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [aiOpen, setAiOpen] = useState(true);

  const viewportRef = useRef<HTMLDivElement>(null);
  const renderingEngineRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize Cornerstone3D
  useEffect(() => {
    (async () => {
      try {
        await initCornerstone();
        setCsReady(true);
      } catch (err) {
        console.error('Cornerstone init failed:', err);
      }
    })();
  }, []);

  // Group DICOM files by series
  const groupBySeries = useCallback(
    (imageIds: string[]): Map<string, string[]> => {
      const groups = new Map<string, string[]>();
      for (const id of imageIds) {
        const meta = cornerstone.metaData.get('generalSeriesModule', id);
        const uid = meta?.seriesInstanceUID || 'unknown';
        if (!groups.has(uid)) groups.set(uid, []);
        groups.get(uid)!.push(id);
      }
      return groups;
    },
    []
  );

  // Load files handler
  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!csReady) return;
      setLoading(true);

      try {
        const dcmFiles = Array.from(files).filter(
          (f) =>
            f.name.endsWith('.dcm') ||
            f.name.endsWith('.DCM') ||
            !f.name.includes('.') ||
            f.type === 'application/dicom'
        );

        if (dcmFiles.length === 0) {
          alert('DICOM dosyası bulunamadı (.dcm)');
          setLoading(false);
          return;
        }

        const imageIds = await loadDicomFiles(dcmFiles);

        // Force load first image to populate metadata
        await cornerstone.imageLoader.loadAndCacheImage(imageIds[0]);

        // Get patient info
        const meta = parseDicomMetadata(imageIds[0]);
        setPatient({
          name: meta.patientName || 'Anonim',
          id: meta.patientId || '',
          studyDate: meta.studyDate || '',
          studyDescription: meta.studyDescription || '',
        });

        // Group by series
        const seriesGroups = groupBySeries(imageIds);
        const seriesList: SeriesInfo[] = [];

        for (const [uid, ids] of seriesGroups) {
          const sMeta = cornerstone.metaData.get('generalSeriesModule', ids[0]);
          seriesList.push({
            seriesUID: uid,
            description: sMeta?.seriesDescription || `Seri ${seriesList.length + 1}`,
            modality: sMeta?.modality || 'OT',
            imageIds: ids,
            instanceCount: ids.length,
          });
        }

        setSeries(seriesList);
        setActiveSeries(0);
        setTotalImages(seriesList[0]?.imageIds.length || 0);
        setImageIndex(0);

        // Display first series
        if (seriesList.length > 0 && viewportRef.current) {
          await displaySeries(seriesList[0].imageIds);
        }
      } catch (err) {
        console.error('DICOM load error:', err);
        alert('DICOM yükleme hatası: ' + (err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [csReady, groupBySeries]
  );

  // Display a series in the viewport
  const displaySeries = async (imageIds: string[]) => {
    if (!viewportRef.current) return;

    // Destroy existing rendering engine
    if (renderingEngineRef.current) {
      renderingEngineRef.current.destroy();
    }

    const renderingEngine = new cornerstone.RenderingEngine(RENDERING_ENGINE_ID);
    renderingEngineRef.current = renderingEngine;

    const viewportId = 'STACK_VIEWPORT';

    renderingEngine.enableElement({
      viewportId,
      type: cornerstone.Enums.ViewportType.STACK,
      element: viewportRef.current,
    });

    // Setup tool group
    const toolGroup = createToolGroup();
    if (toolGroup) {
      toolGroup.addViewport(viewportId, RENDERING_ENGINE_ID);
    }

    // Set the stack
    const viewport = renderingEngine.getViewport(viewportId) as any;
    await viewport.setStack(imageIds, 0);
    viewport.render();

    // Listen for events
    const element = viewportRef.current;

    element.addEventListener(cornerstone.Enums.Events.STACK_NEW_IMAGE, ((
      evt: any
    ) => {
      const { imageIdIndex } = evt.detail;
      setImageIndex(imageIdIndex);
    }) as EventListener);

    element.addEventListener(cornerstone.Enums.Events.VOI_MODIFIED, ((
      evt: any
    ) => {
      const { range } = evt.detail;
      if (range) {
        const ww = Math.round(range.upper - range.lower);
        const wl = Math.round((range.upper + range.lower) / 2);
        setWwwl({ ww, wl });
      }
    }) as EventListener);

    element.addEventListener(cornerstone.Enums.Events.CAMERA_MODIFIED, (() => {
      try {
        const cam = viewport.getCamera();
        if (cam?.parallelScale) {
          const initialScale = viewport.getCamera()?.parallelScale || 1;
          setZoom(Number((1).toFixed(2)));
        }
      } catch {}
    }) as EventListener);
  };

  // Series change
  const handleSeriesChange = async (index: number) => {
    setActiveSeries(index);
    const s = series[index];
    if (s) {
      setTotalImages(s.imageIds.length);
      setImageIndex(0);
      await displaySeries(s.imageIds);
    }
  };

  // Tool change
  const handleToolChange = (tool: string) => {
    setActiveToolState(tool);
    setActiveTool(tool);
  };

  // Reset viewport
  const handleReset = () => {
    if (!renderingEngineRef.current) return;
    const viewport = renderingEngineRef.current.getViewport('STACK_VIEWPORT');
    if (viewport) {
      viewport.resetCamera();
      viewport.resetProperties();
      viewport.render();
    }
  };

  // Drag & drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };
  const handleDragLeave = () => setDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  // Folder upload support
  const handleBrowse = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  };

  const layoutClass = [
    'app-layout',
    !sidebarOpen && 'sidebar-collapsed',
    !aiOpen && 'ai-collapsed',
  ]
    .filter(Boolean)
    .join(' ');

  const hasImages = series.length > 0;

  return (
    <div className={layoutClass}>
      {/* Hidden file input with webkitdirectory for folder upload */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".dcm,.DCM,application/dicom"
        style={{ display: 'none' }}
        onChange={handleFileInput}
        {...({ webkitdirectory: '', directory: '' } as any)}
      />

      {/* Tool Rail */}
      <ToolRail
        activeTool={activeTool}
        onToolChange={handleToolChange}
        onReset={handleReset}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onToggleAI={() => setAiOpen(!aiOpen)}
        hasImages={hasImages}
      />

      {/* Series Sidebar */}
      {sidebarOpen && (
        <SeriesSidebar
          patient={patient}
          series={series}
          activeSeries={activeSeries}
          onSeriesChange={handleSeriesChange}
        />
      )}

      {/* Viewport */}
      <div
        className="viewport-area"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="viewport-container">
          {!hasImages && (
            <div className={`drop-zone ${dragging ? 'dragging' : ''}`}>
              <div className="drop-zone-content">
                <div className="drop-zone-icon">
                  <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                  </svg>
                </div>
                <h3>DICOM Dosyalarını Yükle</h3>
                <p>Dosyaları sürükleyip bırakın veya klasör seçin</p>
                <button className="browse-btn" onClick={handleBrowse}>
                  Dosya / Klasör Seç
                </button>
              </div>
            </div>
          )}

          <div
            ref={viewportRef}
            className="viewport-element"
            style={{ visibility: hasImages ? 'visible' : 'hidden' }}
          />

          {/* Viewport overlays */}
          {hasImages && (
            <>
              <div className="viewport-overlay top-left">
                <div>{patient?.name}</div>
                <div className="label">ID: {patient?.id}</div>
                <div className="label">{patient?.studyDate}</div>
              </div>
              <div className="viewport-overlay top-right">
                <div>{series[activeSeries]?.modality}</div>
                <div>{series[activeSeries]?.description}</div>
              </div>
              <div className="viewport-overlay bottom-left">
                <div>WW: {wwwl.ww} / WL: {wwwl.wl}</div>
                <div>Zoom: {zoom}x</div>
              </div>
              <div className="viewport-overlay bottom-right">
                <div>
                  Img: {imageIndex + 1} / {totalImages}
                </div>
              </div>
            </>
          )}

          {loading && (
            <div className="loading-overlay">
              <div className="spinner" />
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div className="status-bar">
          <div className="status-item">
            <div className={`status-dot ${csReady ? '' : 'warning'}`} />
            <span>{csReady ? 'Cornerstone3D Hazır' : 'Başlatılıyor...'}</span>
          </div>
          {hasImages && (
            <>
              <div className="status-item">
                <span>{series.length} seri</span>
              </div>
              <div className="status-item">
                <span>{totalImages} kesit</span>
              </div>
            </>
          )}
          <div style={{ flex: 1 }} />
          <div className="status-item">
            <span>RadAssist v2.0</span>
          </div>
        </div>
      </div>

      {/* AI Panel */}
      {aiOpen && (
        <AIPanel
          hasImages={hasImages}
          activeSeries={series[activeSeries] || null}
          imageIndex={imageIndex}
        />
      )}
    </div>
  );
}
