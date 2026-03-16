// Shared canvas drawing utilities
// Used by AnnotationOverlay and MobileApp for annotation rendering

export interface CanvasPath {
  x: number;
  y: number;
}

/** A group of paths sharing the same color (for multi-annotation) */
export interface AnnotationLayer {
  paths: CanvasPath[][];
  color: string;
}

export interface DrawCanvasOptions {
  canvas: HTMLCanvasElement;
  baseImage: HTMLImageElement;
  paths: CanvasPath[][];
  currentPath?: CanvasPath[];
  strokeColor?: string;
  lineWidth?: number;
  fillClosedPath?: boolean;
  /** Additional annotation layers drawn with their own colors */
  layers?: AnnotationLayer[];
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

/** Draw a set of paths with a given color */
function drawPaths(ctx: CanvasRenderingContext2D, pathList: CanvasPath[][], color: string, width: number): void {
  for (const path of pathList) {
    if (path.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x, path[i].y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.85;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/** Fill the last closed path with a transparent overlay */
function fillLastPath(ctx: CanvasRenderingContext2D, pathList: CanvasPath[][], color: string): void {
  if (pathList.length === 0) return;
  const lastPath = pathList[pathList.length - 1];
  if (lastPath.length > 5) {
    ctx.beginPath();
    ctx.moveTo(lastPath[0].x, lastPath[0].y);
    for (let i = 1; i < lastPath.length; i++) {
      ctx.lineTo(lastPath[i].x, lastPath[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = color + '20';
    ctx.fill();
  }
}

/** Draw base image + annotation paths on canvas */
export function drawCanvasWithPaths(opts: DrawCanvasOptions): void {
  const { canvas, baseImage, paths, currentPath = [], strokeColor = '#ef4444', lineWidth = 3, fillClosedPath = true, layers = [] } = opts;
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

  // Draw saved annotation layers (from multi-annotation)
  for (const layer of layers) {
    drawPaths(ctx, layer.paths, layer.color, lineWidth);
    if (fillClosedPath) fillLastPath(ctx, layer.paths, layer.color);
  }

  // Draw current active paths
  const allPaths = [...paths, ...(currentPath.length > 1 ? [currentPath] : [])];
  drawPaths(ctx, allPaths, strokeColor, lineWidth);

  // Fill last closed path with transparent overlay
  if (fillClosedPath && paths.length > 0) {
    fillLastPath(ctx, paths, strokeColor);
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
