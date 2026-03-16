// File upload and classification hook
// Handles: file type detection, DICOM/photo/video classification
// Extracted from App.tsx to reduce monolith size

import { useState, useRef, useCallback } from 'react';
import { loadDicomFiles, parseDicomMetadata, cornerstone } from '../lib/initCornerstone';
import { logFileUpload } from '../lib/logger';
import type { SeriesInfo, PatientInfo, ViewMode, MediaFile } from '../types';

// File type detection constants
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff'];
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v', '.ogv'];
const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska', 'video/ogg'];

const ACCEPTED_FILES = '.dcm,.DCM,application/dicom,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tiff,.tif,.mp4,.mov,.webm,.avi,.mkv,.m4v,image/*,video/*';

function isImage(f: File): boolean {
  return IMAGE_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext)) || IMAGE_TYPES.includes(f.type);
}

function isVideo(f: File): boolean {
  return VIDEO_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext)) || VIDEO_TYPES.includes(f.type);
}

function isDicom(f: File): boolean {
  return f.name.endsWith('.dcm') || f.name.endsWith('.DCM') || !f.name.includes('.') || f.type === 'application/dicom';
}

interface UseFileUploadOptions {
  csReady: boolean;
  groupBySeries: (imageIds: string[]) => Map<string, string[]>;
  buildSeriesList: (groups: Map<string, string[]>) => SeriesInfo[];
  displaySeries: (imageIds: string[]) => Promise<void>;
  viewportReady: boolean;
}

export function useFileUpload(opts: UseFileUploadOptions) {
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('dicom');
  const [series, setSeries] = useState<SeriesInfo[]>([]);
  const [activeSeries, setActiveSeries] = useState(0);
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [photos, setPhotos] = useState<MediaFile[]>([]);
  const [activePhoto, setActivePhoto] = useState(0);
  const [videos, setVideos] = useState<MediaFile[]>([]);
  const [activeVideo, setActiveVideo] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileFileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!opts.csReady) return;
      setLoading(true);

      try {
        const allFiles = Array.from(files);
        const regularImages = allFiles.filter(isImage);
        const videoFiles = allFiles.filter(isVideo);
        const dcmFiles = allFiles.filter((f) => !regularImages.includes(f) && !videoFiles.includes(f) && isDicom(f));

        // Handle videos
        if (videoFiles.length > 0) {
          const videoList = videoFiles.map((f) => ({ url: URL.createObjectURL(f), name: f.name, file: f }));
          setVideos((prev) => [...prev, ...videoList]);
          setActiveVideo((prev) => prev === 0 ? 0 : prev);
          setViewMode('video');
          setLoading(false);
          logFileUpload('video', videoFiles.length);

          if (!patient) {
            setPatient({
              name: 'Video Yuklendi',
              id: '',
              studyDate: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
              studyDescription: `${videoFiles.length} video`,
            });
          }
          if (regularImages.length > 0) {
            const photoList = regularImages.map((f) => ({ url: URL.createObjectURL(f), name: f.name, file: f }));
            setPhotos((prev) => [...prev, ...photoList]);
          }
          return;
        }

        // Handle regular images
        if (regularImages.length > 0) {
          const photoList = regularImages.map((f) => ({ url: URL.createObjectURL(f), name: f.name, file: f }));
          setPhotos((prev) => [...prev, ...photoList]);
          setActivePhoto(0);
          setViewMode('photo');
          setLoading(false);
          logFileUpload('photo', regularImages.length);
          if (!patient) {
            setPatient({
              name: 'Goruntu Yuklendi',
              id: '',
              studyDate: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
              studyDescription: `${regularImages.length} fotograf`,
            });
          }
          return;
        }

        // Handle DICOM
        if (dcmFiles.length === 0) {
          alert('Desteklenen dosya bulunamadi (.dcm, .jpg, .png, .mp4 vb.)');
          setLoading(false);
          return;
        }

        setViewMode('dicom');
        const imageIds = await loadDicomFiles(dcmFiles);
        await cornerstone.imageLoader.loadAndCacheImage(imageIds[0]);

        const meta = parseDicomMetadata(imageIds[0]);
        setPatient({
          name: meta.patientName || 'Anonim',
          id: meta.patientId || '',
          studyDate: meta.studyDate || '',
          studyDescription: meta.studyDescription || '',
        });

        const seriesGroups = opts.groupBySeries(imageIds);
        const seriesList = opts.buildSeriesList(seriesGroups);

        setSeries(seriesList);
        setActiveSeries(0);

        if (seriesList.length > 0 && opts.viewportReady) {
          await opts.displaySeries(seriesList[0].imageIds);
        }
      } catch (err) {
        console.error('File load error:', err);
        alert('Dosya yukleme hatasi: ' + (err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [opts.csReady, opts.groupBySeries, opts.buildSeriesList, opts.displaySeries, opts.viewportReady, patient]
  );

  // Series change
  const handleSeriesChange = async (index: number) => {
    setActiveSeries(index);
    const s = series[index];
    if (s) {
      await opts.displaySeries(s.imageIds);
    }
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true); };
  const handleDragLeave = () => setDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  };

  // Browse button — always use mobileFileInputRef (individual file picker)
  // fileInputRef has webkitdirectory which only opens folder dialogs
  const handleBrowse = (_isMobile?: boolean) => {
    if (mobileFileInputRef.current) {
      mobileFileInputRef.current.click();
    }
  };

  // Browse folder — uses fileInputRef with webkitdirectory for folder selection
  const handleBrowseFolder = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
  };

  // Server load
  const handleServerLoadSeries = async (
    imageIds: string[],
    meta: {
      patientName: string; patientId: string; studyDate: string;
      studyDescription: string; seriesDescription: string;
      modality: string; seriesUID: string; instanceCount: number;
    }
  ) => {
    if (!opts.csReady || !opts.viewportReady) return;
    setLoading(true);
    try {
      setPatient({ name: meta.patientName || 'Anonim', id: meta.patientId || '', studyDate: meta.studyDate || '', studyDescription: meta.studyDescription || '' });
      const newSeries: SeriesInfo = {
        seriesUID: meta.seriesUID, description: meta.seriesDescription || 'Uzak Seri',
        modality: meta.modality || 'OT', imageIds, instanceCount: meta.instanceCount || imageIds.length,
      };
      setSeries([newSeries]);
      setActiveSeries(0);
      await opts.displaySeries(imageIds);
    } catch (err) {
      console.error('Server load error:', err);
      alert('Sunucu yukleme hatasi: ' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Delete photo — revoke objectURL to prevent memory leak
  const deletePhoto = (index: number) => {
    const removed = photos[index];
    if (removed) URL.revokeObjectURL(removed.url);
    const newPhotos = photos.filter((_, i) => i !== index);
    setPhotos(newPhotos);
    if (newPhotos.length === 0) {
      setViewMode('dicom');
    } else {
      setActivePhoto(Math.min(index, newPhotos.length - 1));
    }
  };

  // Delete video — revoke objectURL to prevent memory leak
  const deleteVideo = (index: number) => {
    const removed = videos[index];
    if (removed) URL.revokeObjectURL(removed.url);
    const newVideos = videos.filter((_, i) => i !== index);
    setVideos(newVideos);
    if (newVideos.length === 0) {
      setViewMode(series.length > 0 ? 'dicom' : photos.length > 0 ? 'photo' : 'dicom');
    } else {
      setActiveVideo(Math.min(index, newVideos.length - 1));
    }
  };

  // Cleanup all objectURLs (call on unmount or full reset)
  const revokeAllUrls = useCallback(() => {
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    videos.forEach((v) => URL.revokeObjectURL(v.url));
  }, [photos, videos]);

  // Capture frame from video as photo
  const captureFrameAsPhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `frame_${Date.now()}.png`, { type: 'image/png' });
      setPhotos((prev) => [...prev, { url: URL.createObjectURL(blob), name: file.name, file }]);
    }, 'image/png');
  };

  return {
    // State
    loading, dragging, viewMode, setViewMode,
    series, activeSeries,
    patient,
    photos, activePhoto, setActivePhoto,
    videos, activeVideo, setActiveVideo,
    // Refs
    fileInputRef, mobileFileInputRef, videoRef,
    // Computed
    hasImages: series.length > 0 || photos.length > 0 || videos.length > 0,
    hasDicom: series.length > 0,
    hasPhotos: photos.length > 0,
    hasVideos: videos.length > 0,
    acceptedFiles: ACCEPTED_FILES,
    // Handlers
    handleFiles, handleSeriesChange, handleDragOver, handleDragLeave, handleDrop,
    handleBrowse, handleBrowseFolder, handleFileInput, handleServerLoadSeries,
    deletePhoto, deleteVideo, captureFrameAsPhoto, revokeAllUrls,
  };
}
