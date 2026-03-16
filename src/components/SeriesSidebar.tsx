import type { SeriesInfo, PatientInfo } from '../types';

interface SeriesSidebarProps {
  patient: PatientInfo | null;
  series: SeriesInfo[];
  activeSeries: number;
  onSeriesChange: (index: number) => void;
}

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.length < 8) return dateStr;
  // DICOM date format: YYYYMMDD
  const y = dateStr.substring(0, 4);
  const m = dateStr.substring(4, 6);
  const d = dateStr.substring(6, 8);
  return `${d}.${m}.${y}`;
}

export default function SeriesSidebar({
  patient,
  series,
  activeSeries,
  onSeriesChange,
}: SeriesSidebarProps) {
  return (
    <>
      {/* Patient info */}
      {patient && (
        <div className="patient-info">
          <div className="patient-name">{patient.name}</div>
          {patient.id && <div className="patient-detail">ID: {patient.id}</div>}
          {patient.studyDate && (
            <div className="patient-detail">Tarih: {formatDate(patient.studyDate)}</div>
          )}
          {patient.studyDescription && (
            <div className="patient-detail">{patient.studyDescription}</div>
          )}
        </div>
      )}

      <div className="series-header">
        <h2>Seriler {series.length > 0 && `(${series.length})`}</h2>
      </div>

      <div className="series-list">
        {series.length === 0 ? (
          <div style={{ padding: '16px 12px', color: 'var(--text-muted)', fontSize: '12px' }}>
            DICOM dosyası yüklendiğinde seriler burada listelenir.
          </div>
        ) : (
          series.map((s, i) => (
            <div
              key={s.seriesUID}
              className={`series-item ${i === activeSeries ? 'active' : ''}`}
              onClick={() => onSeriesChange(i)}
            >
              <div className="series-item-modality">{s.modality}</div>
              <div className="series-item-desc">{s.description}</div>
              <div className="series-item-info">{s.instanceCount} kesit</div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
