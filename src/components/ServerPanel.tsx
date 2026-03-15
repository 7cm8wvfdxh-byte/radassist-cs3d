import { useState, useEffect } from 'react';
import type {
  DICOMwebConfig,
  StudyResult,
  SeriesResult,
} from '../lib/dicomWebClient';
import {
  testConnection,
  searchStudies,
  getStudySeries,
  getWadoRsImageIds,
  getSavedServers,
  saveServer,
  removeServer,
} from '../lib/dicomWebClient';

interface ServerPanelProps {
  onLoadSeries: (imageIds: string[], meta: {
    patientName: string;
    patientId: string;
    studyDate: string;
    studyDescription: string;
    seriesDescription: string;
    modality: string;
    seriesUID: string;
    instanceCount: number;
  }) => void;
}

type View = 'servers' | 'add' | 'studies' | 'series';

export default function ServerPanel({ onLoadSeries }: ServerPanelProps) {
  const [view, setView] = useState<View>('servers');
  const [servers, setServers] = useState<DICOMwebConfig[]>([]);
  const [activeServer, setActiveServer] = useState<DICOMwebConfig | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'ok' | 'fail'>('idle');

  // Add server form
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formAuth, setFormAuth] = useState<'none' | 'basic' | 'bearer'>('none');
  const [formUser, setFormUser] = useState('');
  const [formPass, setFormPass] = useState('');
  const [formToken, setFormToken] = useState('');

  // Studies & series
  const [studies, setStudies] = useState<StudyResult[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesResult[]>([]);
  const [selectedStudy, setSelectedStudy] = useState<StudyResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setServers(getSavedServers());
  }, []);

  // Connect to server
  const handleConnect = async (server: DICOMwebConfig) => {
    setConnecting(true);
    setConnectionStatus('idle');
    const ok = await testConnection(server);
    setConnecting(false);

    if (ok) {
      setConnectionStatus('ok');
      setActiveServer(server);
      setView('studies');
      // Auto-load recent studies
      await handleSearchStudies(server);
    } else {
      setConnectionStatus('fail');
    }
  };

  // Save new server
  const handleSaveServer = () => {
    if (!formName.trim() || !formUrl.trim()) return;
    const config: DICOMwebConfig = {
      name: formName.trim(),
      baseUrl: formUrl.trim().replace(/\/$/, ''),
      authType: formAuth,
      username: formUser || undefined,
      password: formPass || undefined,
      token: formToken || undefined,
    };
    saveServer(config);
    setServers(getSavedServers());
    resetForm();
    setView('servers');
  };

  const resetForm = () => {
    setFormName('');
    setFormUrl('');
    setFormAuth('none');
    setFormUser('');
    setFormPass('');
    setFormToken('');
  };

  // Search studies
  const handleSearchStudies = async (server?: DICOMwebConfig) => {
    const srv = server || activeServer;
    if (!srv) return;
    setLoading(true);
    try {
      const results = await searchStudies(srv, {
        patientName: searchQuery || undefined,
        limit: 50,
      });
      setStudies(results);
    } catch (err) {
      console.error('Study search failed:', err);
    } finally {
      setLoading(false);
    }
  };

  // Get series for study
  const handleSelectStudy = async (study: StudyResult) => {
    if (!activeServer) return;
    setSelectedStudy(study);
    setLoading(true);
    try {
      const results = await getStudySeries(activeServer, study.studyInstanceUID);
      setSeriesList(results);
      setView('series');
    } catch (err) {
      console.error('Series fetch failed:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load series into viewport
  const handleLoadSeries = async (series: SeriesResult) => {
    if (!activeServer || !selectedStudy) return;
    setLoading(true);
    try {
      const imageIds = await getWadoRsImageIds(
        activeServer,
        selectedStudy.studyInstanceUID,
        series.seriesInstanceUID
      );
      onLoadSeries(imageIds, {
        patientName: selectedStudy.patientName,
        patientId: selectedStudy.patientId,
        studyDate: selectedStudy.studyDate,
        studyDescription: selectedStudy.studyDescription,
        seriesDescription: series.seriesDescription,
        modality: series.modality,
        seriesUID: series.seriesInstanceUID,
        instanceCount: series.numberOfInstances,
      });
    } catch (err) {
      console.error('Load series failed:', err);
      alert('Seri yükleme hatası: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteServer = (name: string) => {
    removeServer(name);
    setServers(getSavedServers());
  };

  const formatDate = (d: string) => {
    if (!d || d.length < 8) return d;
    return `${d.substring(6, 8)}.${d.substring(4, 6)}.${d.substring(0, 4)}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div className="series-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {view === 'servers' && (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path d="M9 12h6M12 9v6" strokeLinecap="round" />
              </svg>
              Sunucular
            </>
          )}
          {view === 'add' && 'Sunucu Ekle'}
          {view === 'studies' && (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
              </svg>
              Çalışmalar
            </>
          )}
          {view === 'series' && 'Seriler'}
        </h2>

        {view !== 'servers' && (
          <button
            className="tool-btn"
            style={{ width: 28, height: 28 }}
            onClick={() => {
              if (view === 'series') setView('studies');
              else if (view === 'studies') { setView('servers'); setActiveServer(null); }
              else setView('servers');
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 8 }}>
        {/* SERVER LIST */}
        {view === 'servers' && (
          <>
            {servers.length === 0 && (
              <div style={{ padding: '16px 12px', color: 'var(--text-muted)', fontSize: 12 }}>
                Henüz sunucu eklenmemiş. DICOMweb sunucusu ekleyerek uzaktan görüntülere erişin.
              </div>
            )}

            {servers.map((s) => (
              <div key={s.name} className="series-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => handleConnect(s)}>
                  <div className="series-item-desc">{s.name}</div>
                  <div className="series-item-info" style={{ fontSize: 10, wordBreak: 'break-all' }}>
                    {s.baseUrl}
                  </div>
                </div>
                <button
                  className="tool-btn"
                  style={{ width: 24, height: 24, flexShrink: 0 }}
                  onClick={(e) => { e.stopPropagation(); handleDeleteServer(s.name); }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}

            {connecting && (
              <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                Bağlanılıyor...
              </div>
            )}
            {connectionStatus === 'fail' && (
              <div style={{ padding: 12, color: 'var(--danger)', fontSize: 12 }}>
                Bağlantı başarısız. URL ve kimlik bilgilerini kontrol edin.
              </div>
            )}

            <button
              style={{
                width: '100%', padding: '10px', marginTop: 8, borderRadius: 8,
                border: '1px dashed var(--border-bright)', background: 'transparent',
                color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
              onClick={() => { resetForm(); setView('add'); }}
            >
              + Sunucu Ekle
            </button>

            {/* Preset Orthanc demo */}
            <div style={{ marginTop: 16, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Hızlı Test</div>
              <button
                style={{
                  width: '100%', padding: 8, borderRadius: 6,
                  border: 'none', background: 'var(--bg-hover)',
                  color: 'var(--cyan)', fontSize: 12, cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
                onClick={() => {
                  const demo: DICOMwebConfig = {
                    name: 'Orthanc Demo',
                    baseUrl: 'https://demo.orthanc-server.com/dicom-web',
                    authType: 'none',
                  };
                  saveServer(demo);
                  setServers(getSavedServers());
                  handleConnect(demo);
                }}
              >
                Orthanc Demo Sunucusuna Bağlan
              </button>
            </div>
          </>
        )}

        {/* ADD SERVER FORM */}
        {view === 'add' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={labelStyle}>
              Sunucu Adı
              <input style={inputStyle} value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Örn: Hastane Orthanc" />
            </label>

            <label style={labelStyle}>
              DICOMweb URL
              <input style={inputStyle} value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://sunucu.com/dicom-web" />
            </label>

            <label style={labelStyle}>
              Kimlik Doğrulama
              <select style={inputStyle} value={formAuth} onChange={(e) => setFormAuth(e.target.value as any)}>
                <option value="none">Yok</option>
                <option value="basic">Basic Auth</option>
                <option value="bearer">Bearer Token</option>
              </select>
            </label>

            {formAuth === 'basic' && (
              <>
                <label style={labelStyle}>
                  Kullanıcı Adı
                  <input style={inputStyle} value={formUser} onChange={(e) => setFormUser(e.target.value)} />
                </label>
                <label style={labelStyle}>
                  Şifre
                  <input style={inputStyle} type="password" value={formPass} onChange={(e) => setFormPass(e.target.value)} />
                </label>
              </>
            )}

            {formAuth === 'bearer' && (
              <label style={labelStyle}>
                Token
                <input style={inputStyle} value={formToken} onChange={(e) => setFormToken(e.target.value)} />
              </label>
            )}

            <button className="ai-analyze-btn" style={{ marginTop: 8 }} onClick={handleSaveServer}>
              Kaydet
            </button>
          </div>
        )}

        {/* STUDIES LIST */}
        {view === 'studies' && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                placeholder="Hasta adı ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchStudies()}
              />
              <button
                className="tool-btn"
                style={{ width: 32, height: 32, flexShrink: 0, background: 'var(--accent)', color: 'white', borderRadius: 6 }}
                onClick={() => handleSearchStudies()}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4.35-4.35" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {loading && (
              <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                Yükleniyor...
              </div>
            )}

            <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 4px 8px', fontFamily: "'JetBrains Mono', monospace" }}>
              {activeServer?.name} • {studies.length} çalışma
            </div>

            {studies.map((s) => (
              <div
                key={s.studyInstanceUID}
                className="series-item"
                onClick={() => handleSelectStudy(s)}
              >
                <div className="series-item-modality">{s.modality || 'OT'}</div>
                <div className="series-item-desc">{s.patientName || 'Anonim'}</div>
                <div className="series-item-info">
                  {formatDate(s.studyDate)} • {s.studyDescription || 'Açıklama yok'}
                </div>
                <div className="series-item-info">
                  {s.numberOfSeries} seri • {s.numberOfInstances} kesit
                </div>
              </div>
            ))}
          </>
        )}

        {/* SERIES LIST */}
        {view === 'series' && selectedStudy && (
          <>
            {/* Study info */}
            <div style={{ padding: '8px 12px', marginBottom: 8, borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                {selectedStudy.patientName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                {formatDate(selectedStudy.studyDate)} • {selectedStudy.studyDescription}
              </div>
            </div>

            {loading && (
              <div style={{ padding: 12, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                Yükleniyor...
              </div>
            )}

            {seriesList.map((s) => (
              <div
                key={s.seriesInstanceUID}
                className="series-item"
                onClick={() => handleLoadSeries(s)}
                style={{ cursor: 'pointer' }}
              >
                <div className="series-item-modality">{s.modality}</div>
                <div className="series-item-desc">
                  {s.seriesDescription || `Seri #${s.seriesNumber}`}
                </div>
                <div className="series-item-info">
                  {s.numberOfInstances} kesit • #{s.seriesNumber}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 11,
  color: 'var(--text-secondary)',
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg-tertiary)',
  color: 'var(--text-primary)',
  fontSize: 12,
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  outline: 'none',
};
