// Shared type definitions for RadAssist
// Single source of truth — import from here, not from individual components

import type { RefObject } from 'react';

// ─── DICOM & Series ───────────────────────────────────────────────

export interface SeriesInfo {
  seriesUID: string;
  description: string;
  modality: string;
  imageIds: string[];
  instanceCount: number;
}

export interface PatientInfo {
  name: string;
  id: string;
  studyDate: string;
  studyDescription: string;
}

// ─── Chat / AI ────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

/** Gemini API conversation turn format */
export interface GeminiTurn {
  role: 'user' | 'model';
  parts: { text: string }[];
}

// ─── Annotation ───────────────────────────────────────────────────

export interface AnnotationData {
  organ: string;
  organLabel: string;
  drawingDataUrl: string | null;
  fullImageWithAnnotation: string | null;
  hasDrawing: boolean;
}

export type DrawMode = 'organ' | 'draw';

export type ViewMode = 'dicom' | 'photo' | 'video';

// ─── Media ────────────────────────────────────────────────────────

export interface MediaFile {
  url: string;
  name: string;
  file: File;
}

export interface CapturedFrame {
  id: string;
  thumbnailUrl: string;
  base64: string;
  timestamp: number;
  selected: boolean;
}

// ─── Component Props ──────────────────────────────────────────────

export interface AIPanelProps {
  hasImages: boolean;
  activeSeries: SeriesInfo | null;
  imageIndex: number;
  viewMode: ViewMode;
  activePhoto: MediaFile | null;
  activeVideo: MediaFile | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  annotationData: AnnotationData | null;
  onAnnotationConsumed: () => void;
}

export interface AnnotationOverlayProps {
  visible: boolean;
  onAnalyze: (data: AnnotationData) => void;
  onClose: () => void;
  captureBase: () => Promise<string | null>;
}
