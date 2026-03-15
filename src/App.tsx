import { useState, useEffect, useRef, useCallback } from 'react';
import {
  initCornerstone,
  createToolGroup,
  setActiveTool,
  loadDicomFiles,
  parseDicomMetadata,
  cornerstone,
  RENDERING_ENGINE_ID,
} from './lib/initCornerstone';
import ToolRail from './components/ToolRail';
import SeriesSidebar from './components/SeriesSidebar';
import ServerPanel from './components/ServerPanel';
import AnnotationOverlay from './components/AnnotationOverlay';
import type { AnnotationData } from './components/AnnotationOverlay';
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
  const [sidebarMode, setSidebarMode] = useState<'local' | 'server'>('local');
  const [viewMode, setViewMode] = useState<'dicom' | 'photo' | 'video'>('dicom');
  const [photos, setPhotos] = useState<{ url: string; name: string; file: File }[]>([]);
  const [activePhoto, setActivePhoto] = useState(0);
  const [videos, setVideos] = useState<{ url: string; name: string; file: File }[]>([]);
  const [activeVideo, setActiveVideo] = useState(0);
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [lastAnnotation, setLastAnnotation] = useState<AnnotationData | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);
  const renderingEngineRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

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
        const allFiles = Array.from(files);

        // Separate DICOM files from regular images and videos
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif'];
        const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff'];
        const videoExtensions = ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v', '.ogv'];
        const videoTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska', 'video/ogg'];

        const regularImages = allFiles.filter(
          (f) =>
            imageExtensions.some((ext) => f.name.toLowerCase().endsWith(ext)) ||
            imageTypes.includes(f.type)
        );

        const videoFiles = allFiles.filter(
          (f) =>
            videoExtensions.some((ext) => f.name.toLowerCase().endsWith(ext)) ||
            videoTypes.includes(f.type)
        );

        const dcmFiles = allFiles.filter(
          (f) =>
            !regularImages.includes(f) &&
            !videoFiles.includes(f) &&
            (f.name.endsWith('.dcm') ||
              f.name.endsWith('.DCM') ||
              !f.name.includes('.') ||
              f.type === 'application/dicom')
        );

        // Handle videos
        if (videoFiles.length > 0) {
          const videoList = videoFiles.map((f) => ({
            url: URL.createObjectURL(f),
            name: f.name,
            file: f,
          }));
          setVideos((prev) => [...prev, ...videoList]);
          setActiveVideo(videos.length);
          setViewMode('video');
          setLoading(false);

          if (!patient) {
            setPatient({
              name: 'Video Yüklendi',
              id: '',
              studyDate: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
              studyDescription: `${videoFiles.length} video`,
            });
          }
          // Also process any images that came with the videos
          if (regularImages.length > 0) {
            const photoList = regularImages.map((f) => ({
              url: URL.createObjectURL(f),
              name: f.name,
              file: f,
            }));
            setPhotos((prev) => [...prev, ...photoList]);
          }
          return;
        }

        // Handle regular images (screenshots, phone photos)
        if (regularImages.length > 0) {
          const photoList = regularImages.map((f) => ({
            url: URL.createObjectURL(f),
            name: f.name,
            file: f,
          }));
          setPhotos((prev) => [...prev, ...photoList]);
          setActivePhoto(photos.length); // Jump to first new photo
          setViewMode('photo');
          setLoading(false);

          // Set patient info for photos
          if (!patient) {
            setPatient({
              name: 'Görüntü Yüklendi',
              id: '',
              studyDate: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
              studyDescription: `${regularImages.length} fotoğraf`,
            });
          }
          return;
        }

        // Handle DICOM files
        if (dcmFiles.length === 0) {
          alert('Desteklenen dosya bulunamadı (.dcm, .jpg, .png, .mp4 vb.)');
          setLoading(false);
          return;
        }

        setViewMode('dicom');
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
          setZoom(1);
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

  // WADO-RS: Load series from remote DICOMweb server
  const handleServerLoadSeries = async (
    imageIds: string[],
    meta: {
      patientName: string;
      patientId: string;
      studyDate: string;
      studyDescription: string;
      seriesDescription: string;
      modality: string;
      seriesUID: string;
      instanceCount: number;
    }
  ) => {
    if (!csReady || !viewportRef.current) return;
    setLoading(true);

    try {
      setPatient({
        name: meta.patientName || 'Anonim',
        id: meta.patientId || '',
        studyDate: meta.studyDate || '',
        studyDescription: meta.studyDescription || '',
      });

      const newSeries: SeriesInfo = {
        seriesUID: meta.seriesUID,
        description: meta.seriesDescription || 'Uzak Seri',
        modality: meta.modality || 'OT',
        imageIds,
        instanceCount: meta.instanceCount || imageIds.length,
      };

      setSeries([newSeries]);
      setActiveSeries(0);
      setTotalImages(imageIds.length);
      setImageIndex(0);

      await displaySeries(imageIds);
    } catch (err) {
      console.error('Server load error:', err);
      alert('Sunucu yükleme hatası: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Capture current viewport/photo/video frame as base64 for annotation
  const captureBase = useCallback(async (): Promise<string | null> => {
    try {
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
      if (viewMode === 'photo' && photos[activePhoto]?.file) {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(photos[activePhoto].file);
        });
      }
      // DICOM canvas
      const canvas = document.querySelector('.viewport-element canvas') as HTMLCanvasElement;
      if (!canvas) return null;
      return canvas.toDataURL('image/png').split(',')[1];
    } catch {
      return null;
    }
  }, [viewMode, photos, activePhoto]);

  // Handle annotation analysis result
  const handleAnnotationAnalyze = (data: AnnotationData) => {
    setLastAnnotation(data);
    setAnnotationOpen(false);
  };

  const layoutClass = [
    'app-layout',
    !sidebarOpen && 'sidebar-collapsed',
    !aiOpen && 'ai-collapsed',
  ]
    .filter(Boolean)
    .join(' ');

  const hasImages = series.length > 0 || photos.length > 0 || videos.length > 0;
  const hasDicom = series.length > 0;
  const hasPhotos = photos.length > 0;
  const hasVideos = videos.length > 0;

  return (
    <div className={layoutClass}>
      {/* Hidden file input with webkitdirectory for folder upload */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".dcm,.DCM,application/dicom,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tiff,.tif,.mp4,.mov,.webm,.avi,.mkv,.m4v,image/*,video/*"
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

      {/* Sidebar: Local files or Server connection */}
      {sidebarOpen && (
        <div className="series-sidebar">
          {/* Mode tabs */}
          <div style={{
            display: 'flex', borderBottom: '1px solid var(--border)',
          }}>
            <button
              onClick={() => setSidebarMode('local')}
              style={{
                flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
                background: sidebarMode === 'local' ? 'var(--bg-tertiary)' : 'transparent',
                color: sidebarMode === 'local' ? 'var(--accent)' : 'var(--text-muted)',
                fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                borderBottom: sidebarMode === 'local' ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              Lokal
            </button>
            <button
              onClick={() => setSidebarMode('server')}
              style={{
                flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
                background: sidebarMode === 'server' ? 'var(--bg-tertiary)' : 'transparent',
                color: sidebarMode === 'server' ? 'var(--cyan)' : 'var(--text-muted)',
                fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                borderBottom: sidebarMode === 'server' ? '2px solid var(--cyan)' : '2px solid transparent',
              }}
            >
              Sunucu
            </button>
          </div>

          {sidebarMode === 'local' ? (
            <SeriesSidebar
              patient={patient}
              series={series}
              activeSeries={activeSeries}
              onSeriesChange={handleSeriesChange}
            />
          ) : (
            <ServerPanel onLoadSeries={handleServerLoadSeries} />
          )}
        </div>
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
                <h3>Görüntü Yükle</h3>
                <p>DICOM, fotoğraf veya video sürükleyip bırakın</p>
                <button className="browse-btn" onClick={handleBrowse}>
                  Dosya / Klasör Seç
                </button>
              </div>
            </div>
          )}

          {/* DICOM Viewport */}
          <div
            ref={viewportRef}
            className="viewport-element"
            style={{ visibility: viewMode === 'dicom' && hasDicom ? 'visible' : 'hidden' }}
          />

          {/* Photo Viewer */}
          {viewMode === 'photo' && hasPhotos && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#000',
            }}>
              <img
                src={photos[activePhoto]?.url}
                alt={photos[activePhoto]?.name}
                style={{
                  maxWidth: '100%', maxHeight: '100%',
                  objectFit: 'contain',
                }}
              />
              {/* Photo navigation */}
              {photos.length > 1 && (
                <>
                  <button
                    onClick={() => setActivePhoto(Math.max(0, activePhoto - 1))}
                    disabled={activePhoto === 0}
                    style={{
                      position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                      width: 36, height: 36, borderRadius: '50%',
                      border: 'none', background: 'rgba(255,255,255,0.15)',
                      color: 'white', cursor: 'pointer', fontSize: 18,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: activePhoto === 0 ? 0.3 : 1,
                    }}
                  >
                    ‹
                  </button>
                  <button
                    onClick={() => setActivePhoto(Math.min(photos.length - 1, activePhoto + 1))}
                    disabled={activePhoto === photos.length - 1}
                    style={{
                      position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                      width: 36, height: 36, borderRadius: '50%',
                      border: 'none', background: 'rgba(255,255,255,0.15)',
                      color: 'white', cursor: 'pointer', fontSize: 18,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: activePhoto === photos.length - 1 ? 0.3 : 1,
                    }}
                  >
                    ›
                  </button>
                </>
              )}
              {/* Delete photo button */}
              <button
                onClick={() => {
                  const newPhotos = photos.filter((_, i) => i !== activePhoto);
                  setPhotos(newPhotos);
                  if (newPhotos.length === 0) {
                    setViewMode('dicom');
                  } else {
                    setActivePhoto(Math.min(activePhoto, newPhotos.length - 1));
                  }
                }}
                style={{
                  position: 'absolute', top: 12, right: 12,
                  width: 32, height: 32, borderRadius: 8,
                  border: 'none', background: 'rgba(239,68,68,0.8)',
                  color: 'white', cursor: 'pointer', fontSize: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                title="Fotoğrafı kaldır"
              >
                ✕
              </button>
            </div>
          )}

          {/* Video Player */}
          {viewMode === 'video' && hasVideos && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              background: '#000',
            }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <video
                  ref={videoRef}
                  src={videos[activeVideo]?.url}
                  controls
                  style={{
                    maxWidth: '100%', maxHeight: '100%',
                    objectFit: 'contain',
                  }}
                />
                {/* Video navigation */}
                {videos.length > 1 && (
                  <>
                    <button
                      onClick={() => setActiveVideo(Math.max(0, activeVideo - 1))}
                      disabled={activeVideo === 0}
                      style={{
                        position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                        width: 36, height: 36, borderRadius: '50%',
                        border: 'none', background: 'rgba(255,255,255,0.15)',
                        color: 'white', cursor: 'pointer', fontSize: 18,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: activeVideo === 0 ? 0.3 : 1,
                      }}
                    >
                      ‹
                    </button>
                    <button
                      onClick={() => setActiveVideo(Math.min(videos.length - 1, activeVideo + 1))}
                      disabled={activeVideo === videos.length - 1}
                      style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        width: 36, height: 36, borderRadius: '50%',
                        border: 'none', background: 'rgba(255,255,255,0.15)',
                        color: 'white', cursor: 'pointer', fontSize: 18,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: activeVideo === videos.length - 1 ? 0.3 : 1,
                      }}
                    >
                      ›
                    </button>
                  </>
                )}
                {/* Delete & frame capture buttons */}
                <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => {
                      // Capture current frame as photo
                      const video = videoRef.current;
                      if (!video) return;
                      const canvas = document.createElement('canvas');
                      canvas.width = video.videoWidth;
                      canvas.height = video.videoHeight;
                      const ctx = canvas.getContext('2d');
                      if (!ctx) return;
                      ctx.drawImage(video, 0, 0);
                      canvas.toBlob((blob) => {
                        if (!blob) return;
                        const file = new File([blob], `frame_${Date.now()}.png`, { type: 'image/png' });
                        setPhotos((prev) => [...prev, {
                          url: URL.createObjectURL(blob),
                          name: file.name,
                          file,
                        }]);
                      }, 'image/png');
                    }}
                    style={{
                      height: 32, padding: '0 12px', borderRadius: 8,
                      border: 'none', background: 'rgba(6,182,212,0.8)',
                      color: 'white', cursor: 'pointer', fontSize: 11,
                      fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                    title="Mevcut kareyi fotoğraf olarak kaydet"
                  >
                    📸 Kare Yakala
                  </button>
                  <button
                    onClick={() => {
                      const newVideos = videos.filter((_, i) => i !== activeVideo);
                      setVideos(newVideos);
                      if (newVideos.length === 0) {
                        setViewMode(hasDicom ? 'dicom' : hasPhotos ? 'photo' : 'dicom');
                      } else {
                        setActiveVideo(Math.min(activeVideo, newVideos.length - 1));
                      }
                    }}
                    style={{
                      width: 32, height: 32, borderRadius: 8,
                      border: 'none', background: 'rgba(239,68,68,0.8)',
                      color: 'white', cursor: 'pointer', fontSize: 14,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    title="Videoyu kaldır"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Mode switcher when multiple content types exist */}
          {((hasDicom ? 1 : 0) + (hasPhotos ? 1 : 0) + (hasVideos ? 1 : 0)) > 1 && (
            <div style={{
              position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', gap: 2, background: 'rgba(0,0,0,0.6)',
              borderRadius: 8, padding: 3, zIndex: 10,
            }}>
              {hasDicom && (
                <button
                  onClick={() => setViewMode('dicom')}
                  style={{
                    padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
                    background: viewMode === 'dicom' ? 'var(--accent)' : 'transparent',
                    color: viewMode === 'dicom' ? 'white' : 'var(--text-muted)',
                  }}
                >
                  DICOM
                </button>
              )}
              {hasPhotos && (
                <button
                  onClick={() => setViewMode('photo')}
                  style={{
                    padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
                    background: viewMode === 'photo' ? 'var(--cyan)' : 'transparent',
                    color: viewMode === 'photo' ? 'white' : 'var(--text-muted)',
                  }}
                >
                  Fotoğraf ({photos.length})
                </button>
              )}
              {hasVideos && (
                <button
                  onClick={() => setViewMode('video')}
                  style={{
                    padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
                    background: viewMode === 'video' ? 'var(--purple)' : 'transparent',
                    color: viewMode === 'video' ? 'white' : 'var(--text-muted)',
                  }}
                >
                  Video ({videos.length})
                </button>
              )}
            </div>
          )}

          {/* Viewport overlays */}
          {viewMode === 'dicom' && hasDicom && (
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

          {/* Photo overlay info */}
          {viewMode === 'photo' && hasPhotos && (
            <>
              <div className="viewport-overlay top-left">
                <div>{photos[activePhoto]?.name}</div>
              </div>
              <div className="viewport-overlay bottom-right">
                <div>
                  {activePhoto + 1} / {photos.length}
                </div>
              </div>
            </>
          )}

          {/* Video overlay info */}
          {viewMode === 'video' && hasVideos && (
            <>
              <div className="viewport-overlay top-left">
                <div>{videos[activeVideo]?.name}</div>
              </div>
              <div className="viewport-overlay bottom-right">
                <div>
                  {activeVideo + 1} / {videos.length}
                </div>
              </div>
            </>
          )}

          {loading && (
            <div className="loading-overlay">
              <div className="spinner" />
            </div>
          )}

          {/* Annotate button */}
          {hasImages && !annotationOpen && (
            <button
              onClick={() => setAnnotationOpen(true)}
              style={{
                position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
                padding: '6px 16px', borderRadius: 8, border: '1px solid var(--border-bright)',
                background: 'rgba(0,0,0,0.7)', color: 'var(--text-primary)',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                display: 'flex', alignItems: 'center', gap: 6,
                zIndex: 8, backdropFilter: 'blur(8px)',
              }}
            >
              ✏️ Bölge Seç & İşaretle
            </button>
          )}

          {/* Annotation Overlay */}
          <AnnotationOverlay
            visible={annotationOpen}
            onAnalyze={handleAnnotationAnalyze}
            onClose={() => setAnnotationOpen(false)}
            captureBase={captureBase}
          />
        </div>

        {/* Status Bar */}
        <div className="status-bar">
          <div className="status-item">
            <div className={`status-dot ${csReady ? '' : 'warning'}`} />
            <span>{csReady ? 'Cornerstone3D Hazır' : 'Başlatılıyor...'}</span>
          </div>
          {hasDicom && (
            <>
              <div className="status-item">
                <span>{series.length} seri</span>
              </div>
              <div className="status-item">
                <span>{totalImages} kesit</span>
              </div>
            </>
          )}
          {hasPhotos && (
            <div className="status-item">
              <span>{photos.length} fotoğraf</span>
            </div>
          )}
          {hasVideos && (
            <div className="status-item">
              <span>{videos.length} video</span>
            </div>
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
          viewMode={viewMode}
          activePhoto={photos[activePhoto] || null}
          activeVideo={videos[activeVideo] || null}
          videoRef={videoRef}
          annotationData={lastAnnotation}
          onAnnotationConsumed={() => setLastAnnotation(null)}
        />
      )}
    </div>
  );
}
