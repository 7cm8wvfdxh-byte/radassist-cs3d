import { useState, useEffect, useCallback } from 'react';
import { setUser } from './lib/logger';
import { captureCurrentView } from './lib/mediaCapture';
import type { AnnotationData } from './types';
import { useDicomViewer } from './hooks/useDicomViewer';
import { useFileUpload } from './hooks/useFileUpload';
import ToolRail from './components/ToolRail';
import SeriesSidebar from './components/SeriesSidebar';
import ServerPanel from './components/ServerPanel';
import AnnotationOverlay from './components/AnnotationOverlay';
import AIPanel from './components/AIPanel';
import PasswordGate from './components/PasswordGate';
import BugReport from './components/BugReport';
import MobileApp from './components/MobileApp';

export default function App() {
  const [authenticated, setAuthenticated] = useState(() => {
    if (sessionStorage.getItem('ra_auth') === '1') {
      const savedUser = sessionStorage.getItem('ra_user') || '';
      if (savedUser) setUser(savedUser);
      return true;
    }
    return false;
  });
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 768);
  const [aiOpen, setAiOpen] = useState(() => window.innerWidth > 768);
  const [sidebarMode, setSidebarMode] = useState<'local' | 'server'>('local');
  const [annotationOpen, setAnnotationOpen] = useState(false);
  const [lastAnnotation, setLastAnnotation] = useState<AnnotationData | null>(null);

  // DICOM viewer hook — Cornerstone3D init, viewport, tools
  const viewer = useDicomViewer();

  // File upload hook — file classification, drag-drop, series management
  const upload = useFileUpload({
    csReady: viewer.csReady,
    groupBySeries: viewer.groupBySeries,
    buildSeriesList: viewer.buildSeriesList,
    displaySeries: viewer.displaySeries,
    viewportReady: !!viewer.viewportRef.current,
  });

  // Mobile detection
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sync totalImages when series changes
  useEffect(() => {
    const s = upload.series[upload.activeSeries];
    if (s) {
      viewer.setTotalImages(s.imageIds.length);
    }
  }, [upload.series, upload.activeSeries]);

  // Capture current viewport/photo/video frame as base64 for annotation
  const captureBase = useCallback(async (): Promise<string | null> => {
    return captureCurrentView({
      viewMode: upload.viewMode,
      videoRef: upload.videoRef.current,
      activePhoto: upload.photos[upload.activePhoto] || null,
    });
  }, [upload.viewMode, upload.photos, upload.activePhoto]);

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

  // Password gate
  if (!authenticated) {
    return <PasswordGate onAuthenticated={() => setAuthenticated(true)} />;
  }

  // Mobile: simplified UI
  if (isMobile) {
    return <MobileApp onSwitchToDesktop={() => setIsMobile(false)} />;
  }

  return (
    <div className={layoutClass}>
      {/* Bug Report Modal */}
      <BugReport visible={bugReportOpen} onClose={() => setBugReportOpen(false)} />

      {/* Hidden file input with webkitdirectory for folder upload (desktop) */}
      <input
        ref={upload.fileInputRef}
        type="file"
        multiple
        accept={upload.acceptedFiles}
        style={{ display: 'none' }}
        onChange={upload.handleFileInput}
        {...({ webkitdirectory: '', directory: '' } as any)}
      />
      {/* Mobile file input — no webkitdirectory so individual files can be picked */}
      <input
        ref={upload.mobileFileInputRef}
        type="file"
        multiple
        accept={upload.acceptedFiles}
        style={{ display: 'none' }}
        onChange={upload.handleFileInput}
      />

      {/* Tool Rail */}
      <ToolRail
        activeTool={viewer.activeTool}
        onToolChange={viewer.handleToolChange}
        onReset={viewer.handleReset}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onToggleAI={() => setAiOpen(!aiOpen)}
        hasImages={upload.hasImages}
      />

      {/* Sidebar: Local files or Server connection */}
      {sidebarOpen && isMobile && (
        <div className="mobile-backdrop" onClick={() => setSidebarOpen(false)} />
      )}
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
              patient={upload.patient}
              series={upload.series}
              activeSeries={upload.activeSeries}
              onSeriesChange={upload.handleSeriesChange}
            />
          ) : (
            <ServerPanel onLoadSeries={upload.handleServerLoadSeries} />
          )}
        </div>
      )}

      {/* Viewport */}
      <div
        className="viewport-area"
        onDragOver={upload.handleDragOver}
        onDragLeave={upload.handleDragLeave}
        onDrop={upload.handleDrop}
      >
        <div className="viewport-container">
          {!upload.hasImages && (
            <div className={`drop-zone ${upload.dragging ? 'dragging' : ''}`}>
              <div className="drop-zone-content">
                <div className="drop-zone-icon">
                  <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                  </svg>
                </div>
                <h3>Goruntu Yukle</h3>
                <p>DICOM, fotograf veya video surukleyip birakin</p>
                <button className="browse-btn" onClick={() => upload.handleBrowse(isMobile)}>
                  Dosya / Klasor Sec
                </button>
              </div>
            </div>
          )}

          {/* DICOM Viewport */}
          <div
            ref={viewer.viewportRef}
            className="viewport-element"
            style={{ visibility: upload.viewMode === 'dicom' && upload.hasDicom ? 'visible' : 'hidden' }}
          />

          {/* Photo Viewer */}
          {upload.viewMode === 'photo' && upload.hasPhotos && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#000',
            }}>
              <img
                src={upload.photos[upload.activePhoto]?.url}
                alt={upload.photos[upload.activePhoto]?.name}
                style={{
                  maxWidth: '100%', maxHeight: '100%',
                  objectFit: 'contain',
                }}
              />
              {/* Photo navigation */}
              {upload.photos.length > 1 && (
                <>
                  <button
                    onClick={() => upload.setActivePhoto(Math.max(0, upload.activePhoto - 1))}
                    disabled={upload.activePhoto === 0}
                    style={{
                      position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                      width: 36, height: 36, borderRadius: '50%',
                      border: 'none', background: 'rgba(255,255,255,0.15)',
                      color: 'white', cursor: 'pointer', fontSize: 18,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: upload.activePhoto === 0 ? 0.3 : 1,
                    }}
                  >
                    &lsaquo;
                  </button>
                  <button
                    onClick={() => upload.setActivePhoto(Math.min(upload.photos.length - 1, upload.activePhoto + 1))}
                    disabled={upload.activePhoto === upload.photos.length - 1}
                    style={{
                      position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                      width: 36, height: 36, borderRadius: '50%',
                      border: 'none', background: 'rgba(255,255,255,0.15)',
                      color: 'white', cursor: 'pointer', fontSize: 18,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: upload.activePhoto === upload.photos.length - 1 ? 0.3 : 1,
                    }}
                  >
                    &rsaquo;
                  </button>
                </>
              )}
              {/* Delete photo button */}
              <button
                onClick={() => upload.deletePhoto(upload.activePhoto)}
                style={{
                  position: 'absolute', top: 12, right: 12,
                  width: 32, height: 32, borderRadius: 8,
                  border: 'none', background: 'rgba(239,68,68,0.8)',
                  color: 'white', cursor: 'pointer', fontSize: 14,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                title="Fotografu kaldir"
              >
                &times;
              </button>
            </div>
          )}

          {/* Video Player */}
          {upload.viewMode === 'video' && upload.hasVideos && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column',
              background: '#000',
            }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                <video
                  ref={upload.videoRef}
                  src={upload.videos[upload.activeVideo]?.url}
                  controls
                  style={{
                    maxWidth: '100%', maxHeight: '100%',
                    objectFit: 'contain',
                  }}
                />
                {/* Video navigation */}
                {upload.videos.length > 1 && (
                  <>
                    <button
                      onClick={() => upload.setActiveVideo(Math.max(0, upload.activeVideo - 1))}
                      disabled={upload.activeVideo === 0}
                      style={{
                        position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                        width: 36, height: 36, borderRadius: '50%',
                        border: 'none', background: 'rgba(255,255,255,0.15)',
                        color: 'white', cursor: 'pointer', fontSize: 18,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: upload.activeVideo === 0 ? 0.3 : 1,
                      }}
                    >
                      &lsaquo;
                    </button>
                    <button
                      onClick={() => upload.setActiveVideo(Math.min(upload.videos.length - 1, upload.activeVideo + 1))}
                      disabled={upload.activeVideo === upload.videos.length - 1}
                      style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        width: 36, height: 36, borderRadius: '50%',
                        border: 'none', background: 'rgba(255,255,255,0.15)',
                        color: 'white', cursor: 'pointer', fontSize: 18,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: upload.activeVideo === upload.videos.length - 1 ? 0.3 : 1,
                      }}
                    >
                      &rsaquo;
                    </button>
                  </>
                )}
                {/* Delete & frame capture buttons */}
                <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => upload.captureFrameAsPhoto()}
                    style={{
                      height: 32, padding: '0 12px', borderRadius: 8,
                      border: 'none', background: 'rgba(6,182,212,0.8)',
                      color: 'white', cursor: 'pointer', fontSize: 11,
                      fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                    title="Mevcut kareyi fotograf olarak kaydet"
                  >
                    Kare Yakala
                  </button>
                  <button
                    onClick={() => upload.deleteVideo(upload.activeVideo)}
                    style={{
                      width: 32, height: 32, borderRadius: 8,
                      border: 'none', background: 'rgba(239,68,68,0.8)',
                      color: 'white', cursor: 'pointer', fontSize: 14,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    title="Videoyu kaldir"
                  >
                    &times;
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Mode switcher when multiple content types exist */}
          {((upload.hasDicom ? 1 : 0) + (upload.hasPhotos ? 1 : 0) + (upload.hasVideos ? 1 : 0)) > 1 && (
            <div style={{
              position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
              display: 'flex', gap: 2, background: 'rgba(0,0,0,0.6)',
              borderRadius: 8, padding: 3, zIndex: 10,
            }}>
              {upload.hasDicom && (
                <button
                  onClick={() => upload.setViewMode('dicom')}
                  style={{
                    padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
                    background: upload.viewMode === 'dicom' ? 'var(--accent)' : 'transparent',
                    color: upload.viewMode === 'dicom' ? 'white' : 'var(--text-muted)',
                  }}
                >
                  DICOM
                </button>
              )}
              {upload.hasPhotos && (
                <button
                  onClick={() => upload.setViewMode('photo')}
                  style={{
                    padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
                    background: upload.viewMode === 'photo' ? 'var(--cyan)' : 'transparent',
                    color: upload.viewMode === 'photo' ? 'white' : 'var(--text-muted)',
                  }}
                >
                  Fotograf ({upload.photos.length})
                </button>
              )}
              {upload.hasVideos && (
                <button
                  onClick={() => upload.setViewMode('video')}
                  style={{
                    padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
                    background: upload.viewMode === 'video' ? 'var(--purple)' : 'transparent',
                    color: upload.viewMode === 'video' ? 'white' : 'var(--text-muted)',
                  }}
                >
                  Video ({upload.videos.length})
                </button>
              )}
            </div>
          )}

          {/* Viewport overlays */}
          {upload.viewMode === 'dicom' && upload.hasDicom && (
            <>
              <div className="viewport-overlay top-left">
                <div>{upload.patient?.name}</div>
                <div className="label">ID: {upload.patient?.id}</div>
                <div className="label">{upload.patient?.studyDate}</div>
              </div>
              <div className="viewport-overlay top-right">
                <div>{upload.series[upload.activeSeries]?.modality}</div>
                <div>{upload.series[upload.activeSeries]?.description}</div>
              </div>
              <div className="viewport-overlay bottom-left">
                <div>WW: {viewer.wwwl.ww} / WL: {viewer.wwwl.wl}</div>
                <div>Zoom: {viewer.zoom}x</div>
              </div>
              <div className="viewport-overlay bottom-right">
                <div>
                  Img: {viewer.imageIndex + 1} / {viewer.totalImages}
                </div>
              </div>
            </>
          )}

          {/* Photo overlay info */}
          {upload.viewMode === 'photo' && upload.hasPhotos && (
            <>
              <div className="viewport-overlay top-left">
                <div>{upload.photos[upload.activePhoto]?.name}</div>
              </div>
              <div className="viewport-overlay bottom-right">
                <div>
                  {upload.activePhoto + 1} / {upload.photos.length}
                </div>
              </div>
            </>
          )}

          {/* Video overlay info */}
          {upload.viewMode === 'video' && upload.hasVideos && (
            <>
              <div className="viewport-overlay top-left">
                <div>{upload.videos[upload.activeVideo]?.name}</div>
              </div>
              <div className="viewport-overlay bottom-right">
                <div>
                  {upload.activeVideo + 1} / {upload.videos.length}
                </div>
              </div>
            </>
          )}

          {upload.loading && (
            <div className="loading-overlay">
              <div className="spinner" />
            </div>
          )}

          {/* Annotate button */}
          {upload.hasImages && !annotationOpen && (
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
              Bolge Sec & Isaretle
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
            <div className={`status-dot ${viewer.csReady ? '' : 'warning'}`} />
            <span>{viewer.csReady ? 'Cornerstone3D Hazir' : 'Baslatiliyor...'}</span>
          </div>
          {upload.hasDicom && (
            <>
              <div className="status-item">
                <span>{upload.series.length} seri</span>
              </div>
              <div className="status-item">
                <span>{viewer.totalImages} kesit</span>
              </div>
            </>
          )}
          {upload.hasPhotos && (
            <div className="status-item">
              <span>{upload.photos.length} fotograf</span>
            </div>
          )}
          {upload.hasVideos && (
            <div className="status-item">
              <span>{upload.videos.length} video</span>
            </div>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setBugReportOpen(true)}
            style={{
              padding: '2px 8px', borderRadius: 4, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-muted)', fontSize: 10,
              cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Hata Bildir
          </button>
          <div className="status-item">
            <span>RadAssist v2.0</span>
          </div>
        </div>
      </div>

      {/* AI Panel */}
      {aiOpen && isMobile && (
        <div className="mobile-backdrop" onClick={() => setAiOpen(false)} />
      )}
      {aiOpen && (
        <AIPanel
          hasImages={upload.hasImages}
          activeSeries={upload.series[upload.activeSeries] || null}
          imageIndex={viewer.imageIndex}
          viewMode={upload.viewMode}
          activePhoto={upload.photos[upload.activePhoto] || null}
          activeVideo={upload.videos[upload.activeVideo] || null}
          videoRef={upload.videoRef}
          annotationData={lastAnnotation}
          onAnnotationConsumed={() => setLastAnnotation(null)}
        />
      )}
    </div>
  );
}
