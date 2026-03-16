// Shared media capture utilities
// Single place for all base64 capture logic — used by App, AIPanel, MobileApp

import type { ViewMode, MediaFile } from '../types';

/** Capture a video frame as base64 PNG (without data: prefix) */
export function captureVideoFrame(video: HTMLVideoElement): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  } catch {
    return null;
  }
}

/** Read a File as base64 (without data: prefix) */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Capture the DICOM viewport canvas as base64 */
export function captureDicomViewport(): string | null {
  try {
    const canvas = document.querySelector('.viewport-element canvas') as HTMLCanvasElement;
    if (!canvas) return null;
    return canvas.toDataURL('image/png').split(',')[1];
  } catch {
    return null;
  }
}

/** Universal capture: returns base64 based on current view mode */
export async function captureCurrentView(opts: {
  viewMode: ViewMode;
  videoRef?: HTMLVideoElement | null;
  activePhoto?: MediaFile | null;
}): Promise<string | null> {
  try {
    if (opts.viewMode === 'video' && opts.videoRef) {
      return captureVideoFrame(opts.videoRef);
    }
    if (opts.viewMode === 'photo' && opts.activePhoto?.file) {
      return fileToBase64(opts.activePhoto.file);
    }
    return captureDicomViewport();
  } catch {
    return null;
  }
}

/** Build a grid image from multiple captured frames */
export function buildFrameGrid(
  selectedFrames: { base64: string; timestamp: number }[],
  fmtTime: (s: number) => string
): Promise<string> {
  return new Promise((resolve) => {
    const count = selectedFrames.length;
    if (count === 0) { resolve(''); return; }
    if (count === 1) { resolve(selectedFrames[0].base64); return; }

    const cols = count <= 2 ? 2 : count <= 4 ? 2 : 3;
    const rows = Math.ceil(count / cols);

    const images: HTMLImageElement[] = [];
    let loaded = 0;

    selectedFrames.forEach((f, i) => {
      const img = new Image();
      img.onload = () => {
        images[i] = img;
        loaded++;
        if (loaded === count) {
          const cellW = 512;
          const cellH = Math.round(cellW * 0.75);
          const padding = 4;
          const labelH = 24;
          const gridW = cols * cellW + (cols - 1) * padding;
          const gridH = rows * (cellH + labelH) + (rows - 1) * padding;

          const canvas = document.createElement('canvas');
          canvas.width = gridW;
          canvas.height = gridH;
          const ctx = canvas.getContext('2d')!;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, gridW, gridH);

          selectedFrames.forEach((frame, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const x = col * (cellW + padding);
            const y = row * (cellH + labelH + padding);

            if (images[idx]) ctx.drawImage(images[idx], x, y, cellW, cellH);

            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(x, y + cellH, cellW, labelH);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`Kare ${idx + 1} - ${fmtTime(frame.timestamp)}`, x + cellW / 2, y + cellH + 17);
          });

          resolve(canvas.toDataURL('image/png').split(',')[1]);
        }
      };
      img.src = `data:image/png;base64,${f.base64}`;
    });
  });
}

/** Format seconds as M:SS */
export function formatTime(s: number): string {
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}
