// Shared canvas drawing utilities
// Used by AnnotationOverlay and MobileApp for annotation rendering

export interface CanvasPath {
  x: number;
  y: number;
}

export interface DrawCanvasOptions {
  canvas: HTMLCanvasElement;
  baseImage: HTMLImageElement;
  paths: CanvasPath[][];
  currentPath?: CanvasPath[];
  strokeColor?: string;
  lineWidth?: number;
  fillClosedPath?: boolean;
}

/** Calculate image scaling and positioning within a canvas */
export function calcImageFit(
  canvasW: number,
  canvasH: number,
  imageW: number,
  imageH: number
): { scale: number; drawW: number; drawH: number; offsetX: number; offsetY: number } {
  const scale = Math.min(canvasW / imageW, canvasH / imageH);
  const drawW = imageW * scale;
  const drawH = imageH * scale;
  return {
    scale,
    drawW,
    drawH,
    offsetX: (canvasW - drawW) / 2,
    offsetY: (canvasH - drawH) / 2,
  };
}

/** Draw base image + annotation paths on canvas */
export function drawCanvasWithPaths(opts: DrawCanvasOptions): void {
  const { canvas, baseImage, paths, currentPath = [], strokeColor = '#ef4444', lineWidth = 3, fillClosedPath = true } = opts;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { drawW, drawH, offsetX, offsetY } = calcImageFit(
    canvas.width,
    canvas.height,
    baseImage.width,
    baseImage.height
  );

  // Clear and draw base image
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(baseImage, offsetX, offsetY, drawW, drawH);

  // Draw all paths
  const allPaths = [...paths, ...(currentPath.length > 1 ? [currentPath] : [])];
  for (const path of allPaths) {
    if (path.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x, path[i].y);
    }
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.85;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Fill last closed path with transparent overlay
  if (fillClosedPath && paths.length > 0) {
    const lastPath = paths[paths.length - 1];
    if (lastPath.length > 5) {
      ctx.beginPath();
      ctx.moveTo(lastPath[0].x, lastPath[0].y);
      for (let i = 1; i < lastPath.length; i++) {
        ctx.lineTo(lastPath[i].x, lastPath[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = strokeColor + '20';
      ctx.fill();
    }
  }
}

/** Get mouse/touch position relative to canvas */
export function getCanvasPosition(
  e: React.MouseEvent | React.TouchEvent,
  canvas: HTMLCanvasElement
): CanvasPath {
  const rect = canvas.getBoundingClientRect();
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

/** Initialize canvas with base image loaded from base64 */
export function initCanvasFromBase64(
  canvas: HTMLCanvasElement,
  base64: string,
  onReady: (img: HTMLImageElement) => void
): void {
  const img = new Image();
  img.onload = () => {
    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }
    onReady(img);
  };
  img.src = `data:image/png;base64,${base64}`;
}
