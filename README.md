# RadAssist v2.0 — DICOM Viewer & AI Assistant

Cornerstone3D tabanlı profesyonel DICOM görüntüleyici ve AI destekli radyoloji asistanı.

## Özellikler

- **Cornerstone3D v4** — DICOM görüntüleme (Stack Viewport)
- **Görüntüleme Araçları** — W/L, Pan, Zoom, Scroll, Uzunluk, Açı, ROI ölçümleri
- **Çoklu Seri** — DICOM serilerini otomatik gruplama ve geçiş
- **DICOM Overlay** — Hasta bilgisi, modalite, pencere değerleri
- **AI Analiz** — Gemini 2.5 Flash ile görüntü analizi
- **Drag & Drop** — Dosya ve klasör yükleme desteği

## Kurulum

```bash
npm install
npm run dev
```

## Deploy

Vercel'e deploy için `vercel.json` ile SharedArrayBuffer header'ları otomatik eklenir.

## Teknolojiler

- React + TypeScript + Vite
- Cornerstone3D v4.19
- Cornerstone Tools (W/L, Pan, Zoom, Length, Angle, ROI)
- Cornerstone DICOM Image Loader
