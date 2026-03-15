interface ToolRailProps {
  activeTool: string;
  onToolChange: (tool: string) => void;
  onReset: () => void;
  onToggleSidebar: () => void;
  onToggleAI: () => void;
  hasImages: boolean;
}

const tools = [
  {
    name: 'WindowLevel',
    label: 'W/L',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v18" />
        <path d="M12 3a9 9 0 010 18" fill="currentColor" opacity="0.3" />
      </svg>
    ),
  },
  {
    name: 'Pan',
    label: 'Pan',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 11l-4 4m0 0l4 4m-4-4h18M17 13l4-4m0 0l-4-4m4 4H3" />
      </svg>
    ),
  },
  {
    name: 'Zoom',
    label: 'Zoom',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="11" cy="11" r="7" />
        <path strokeLinecap="round" d="M21 21l-4.35-4.35M11 8v6M8 11h6" />
      </svg>
    ),
  },
  {
    name: 'Length',
    label: 'Uzunluk',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" d="M4 4l16 16M4 4v4M4 4h4M20 20v-4M20 20h-4" />
      </svg>
    ),
  },
  {
    name: 'Angle',
    label: 'Açı',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 19h14M5 19l7-14M5 19l3-6" />
        <path d="M8 13a5 5 0 013.5-1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: 'RectangleROI',
    label: 'ROI',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="3 2" />
      </svg>
    ),
  },
  {
    name: 'EllipticalROI',
    label: 'Elips ROI',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <ellipse cx="12" cy="12" rx="9" ry="6" strokeDasharray="3 2" />
      </svg>
    ),
  },
];

export default function ToolRail({
  activeTool,
  onToolChange,
  onReset,
  onToggleSidebar,
  onToggleAI,
  hasImages,
}: ToolRailProps) {
  return (
    <div className="tool-rail">
      <div className="tool-rail-logo">RA</div>

      {/* Toggle buttons */}
      <button className="tool-btn" onClick={onToggleSidebar} title="Seri Paneli">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      <div className="tool-rail-divider" />

      {/* Imaging tools */}
      {tools.map((t) => (
        <button
          key={t.name}
          className={`tool-btn ${activeTool === t.name ? 'active' : ''}`}
          onClick={() => onToolChange(t.name)}
          title={t.label}
          disabled={!hasImages}
        >
          {t.icon}
        </button>
      ))}

      <div className="tool-rail-divider" />

      {/* Reset */}
      <button className="tool-btn" onClick={onReset} title="Sıfırla" disabled={!hasImages}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
        </svg>
      </button>

      <div style={{ flex: 1 }} />

      {/* AI Panel toggle */}
      <button className="tool-btn" onClick={onToggleAI} title="AI Panel">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
        </svg>
      </button>
    </div>
  );
}
