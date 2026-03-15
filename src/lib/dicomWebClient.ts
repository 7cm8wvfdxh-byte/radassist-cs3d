// DICOMweb WADO-RS client for RadAssist
// Connects to any DICOMweb-compatible server (Orthanc, dcm4chee, Google Cloud Healthcare, etc.)

export interface DICOMwebConfig {
  name: string;
  baseUrl: string; // e.g. https://my-orthanc.com/dicom-web
  authType: 'none' | 'basic' | 'bearer';
  username?: string;
  password?: string;
  token?: string;
}

export interface StudyResult {
  studyInstanceUID: string;
  patientName: string;
  patientId: string;
  studyDate: string;
  studyDescription: string;
  modality: string;
  numberOfSeries: number;
  numberOfInstances: number;
}

export interface SeriesResult {
  seriesInstanceUID: string;
  seriesDescription: string;
  seriesNumber: number;
  modality: string;
  numberOfInstances: number;
}

function getHeaders(config: DICOMwebConfig): HeadersInit {
  const headers: HeadersInit = {
    Accept: 'application/dicom+json',
  };

  if (config.authType === 'basic' && config.username && config.password) {
    headers['Authorization'] =
      'Basic ' + btoa(`${config.username}:${config.password}`);
  } else if (config.authType === 'bearer' && config.token) {
    headers['Authorization'] = `Bearer ${config.token}`;
  }

  return headers;
}

// Clean tag value from DICOM JSON
function tagValue(dataset: any, tag: string): string {
  const entry = dataset?.[tag];
  if (!entry) return '';
  if (entry.Value) {
    const val = entry.Value[0];
    if (typeof val === 'object' && val.Alphabetic) return val.Alphabetic;
    return String(val ?? '');
  }
  return '';
}

function tagNumber(dataset: any, tag: string): number {
  const entry = dataset?.[tag];
  if (!entry?.Value) return 0;
  return Number(entry.Value[0]) || 0;
}

// Test connection to DICOMweb server
export async function testConnection(config: DICOMwebConfig): Promise<boolean> {
  try {
    const url = `${config.baseUrl}/studies?limit=1`;
    const res = await fetch(url, {
      headers: getHeaders(config),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Search studies (QIDO-RS)
export async function searchStudies(
  config: DICOMwebConfig,
  params?: {
    patientName?: string;
    patientId?: string;
    studyDate?: string;
    modality?: string;
    limit?: number;
  }
): Promise<StudyResult[]> {
  const query = new URLSearchParams();
  if (params?.patientName) query.set('PatientName', `*${params.patientName}*`);
  if (params?.patientId) query.set('PatientID', params.patientId);
  if (params?.studyDate) query.set('StudyDate', params.studyDate);
  if (params?.modality) query.set('ModalitiesInStudy', params.modality);
  query.set('limit', String(params?.limit || 50));
  query.set('includefield', 'all');

  const url = `${config.baseUrl}/studies?${query}`;
  const res = await fetch(url, { headers: getHeaders(config) });

  if (!res.ok) throw new Error(`QIDO-RS error: ${res.status}`);

  const data = await res.json();

  return data.map((d: any) => ({
    studyInstanceUID: tagValue(d, '0020000D'),
    patientName: tagValue(d, '00100010'),
    patientId: tagValue(d, '00100020'),
    studyDate: tagValue(d, '00080020'),
    studyDescription: tagValue(d, '00081030'),
    modality: tagValue(d, '00080061'),
    numberOfSeries: tagNumber(d, '00201206'),
    numberOfInstances: tagNumber(d, '00201208'),
  }));
}

// Get series for a study (QIDO-RS)
export async function getStudySeries(
  config: DICOMwebConfig,
  studyInstanceUID: string
): Promise<SeriesResult[]> {
  const url = `${config.baseUrl}/studies/${studyInstanceUID}/series?includefield=all`;
  const res = await fetch(url, { headers: getHeaders(config) });

  if (!res.ok) throw new Error(`QIDO-RS series error: ${res.status}`);

  const data = await res.json();

  return data.map((d: any) => ({
    seriesInstanceUID: tagValue(d, '0020000E'),
    seriesDescription: tagValue(d, '0008103E'),
    seriesNumber: tagNumber(d, '00200011'),
    modality: tagValue(d, '00080060'),
    numberOfInstances: tagNumber(d, '00201209'),
  }));
}

// Generate WADO-RS imageIds for Cornerstone3D
export async function getWadoRsImageIds(
  config: DICOMwebConfig,
  studyInstanceUID: string,
  seriesInstanceUID: string
): Promise<string[]> {
  // Get instance list
  const url = `${config.baseUrl}/studies/${studyInstanceUID}/series/${seriesInstanceUID}/instances?includefield=all`;
  const res = await fetch(url, { headers: getHeaders(config) });

  if (!res.ok) throw new Error(`Instance list error: ${res.status}`);

  const data = await res.json();

  const imageIds = data.map((instance: any) => {
    const sopInstanceUID = tagValue(instance, '00080018');
    return `wadors:${config.baseUrl}/studies/${studyInstanceUID}/series/${seriesInstanceUID}/instances/${sopInstanceUID}/frames/1`;
  });

  return imageIds;
}

// Saved server configs (localStorage)
const STORAGE_KEY = 'radassist_dicomweb_servers';

export function getSavedServers(): DICOMwebConfig[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveServer(config: DICOMwebConfig): void {
  const servers = getSavedServers();
  const existing = servers.findIndex((s) => s.name === config.name);
  if (existing >= 0) {
    servers[existing] = config;
  } else {
    servers.push(config);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
}

export function removeServer(name: string): void {
  const servers = getSavedServers().filter((s) => s.name !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(servers));
}
