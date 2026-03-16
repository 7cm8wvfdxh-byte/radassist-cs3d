// DICOM viewport management hook
// Handles: Cornerstone3D init, rendering engine, viewport display, event listeners
// Extracted from App.tsx to reduce monolith size

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  initCornerstone,
  createToolGroup,
  setActiveTool as csSetActiveTool,
  cornerstone,
  RENDERING_ENGINE_ID,
} from '../lib/initCornerstone';
import { logToolUse } from '../lib/logger';
import type { SeriesInfo } from '../types';

export function useDicomViewer() {
  const [csReady, setCsReady] = useState(false);
  const [activeTool, setActiveToolState] = useState('WindowLevel');
  const [imageIndex, setImageIndex] = useState(0);
  const [totalImages, setTotalImages] = useState(0);
  const [wwwl, setWwwl] = useState({ ww: 0, wl: 0 });
  const [zoom, setZoom] = useState(1);

  const viewportRef = useRef<HTMLDivElement>(null);
  const renderingEngineRef = useRef<any>(null);
  const cleanupListenersRef = useRef<(() => void) | null>(null);

  // Initialize Cornerstone3D on mount
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

  // Group DICOM imageIds by series UID
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

  // Build SeriesInfo list from grouped imageIds
  const buildSeriesList = useCallback(
    (seriesGroups: Map<string, string[]>): SeriesInfo[] => {
      const list: SeriesInfo[] = [];
      for (const [uid, ids] of seriesGroups) {
        const sMeta = cornerstone.metaData.get('generalSeriesModule', ids[0]);
        list.push({
          seriesUID: uid,
          description: sMeta?.seriesDescription || `Seri ${list.length + 1}`,
          modality: sMeta?.modality || 'OT',
          imageIds: ids,
          instanceCount: ids.length,
        });
      }
      return list;
    },
    []
  );

  // Display a series in the viewport
  const displaySeries = async (imageIds: string[]) => {
    if (!viewportRef.current) return;

    // Clean up previous event listeners
    if (cleanupListenersRef.current) {
      cleanupListenersRef.current();
      cleanupListenersRef.current = null;
    }

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

    const toolGroup = createToolGroup();
    if (toolGroup) {
      toolGroup.addViewport(viewportId, RENDERING_ENGINE_ID);
    }

    const viewport = renderingEngine.getViewport(viewportId) as any;
    await viewport.setStack(imageIds, 0);
    viewport.render();

    // Event listeners with cleanup
    const element = viewportRef.current;

    const onStackNewImage = ((evt: any) => {
      setImageIndex(evt.detail.imageIdIndex);
    }) as EventListener;

    const onVoiModified = ((evt: any) => {
      const { range } = evt.detail;
      if (range) {
        setWwwl({
          ww: Math.round(range.upper - range.lower),
          wl: Math.round((range.upper + range.lower) / 2),
        });
      }
    }) as EventListener;

    const onCameraModified = (() => {
      try {
        const cam = viewport.getCamera();
        if (cam?.parallelScale) setZoom(1);
      } catch {}
    }) as EventListener;

    element.addEventListener(cornerstone.Enums.Events.STACK_NEW_IMAGE, onStackNewImage);
    element.addEventListener(cornerstone.Enums.Events.VOI_MODIFIED, onVoiModified);
    element.addEventListener(cornerstone.Enums.Events.CAMERA_MODIFIED, onCameraModified);

    cleanupListenersRef.current = () => {
      element.removeEventListener(cornerstone.Enums.Events.STACK_NEW_IMAGE, onStackNewImage);
      element.removeEventListener(cornerstone.Enums.Events.VOI_MODIFIED, onVoiModified);
      element.removeEventListener(cornerstone.Enums.Events.CAMERA_MODIFIED, onCameraModified);
    };
  };

  // Change tool
  const handleToolChange = (tool: string) => {
    setActiveToolState(tool);
    csSetActiveTool(tool);
    logToolUse(tool);
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

  return {
    csReady,
    activeTool,
    imageIndex,
    setImageIndex,
    totalImages,
    setTotalImages,
    wwwl,
    zoom,
    viewportRef,
    groupBySeries,
    buildSeriesList,
    displaySeries,
    handleToolChange,
    handleReset,
  };
}
