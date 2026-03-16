// Hierarchical organ & structure list for radiology
// Category → specific structures

export interface Structure {
  id: string;
  label: string;
}

export interface OrganCategory {
  id: string;
  label: string;
  icon: string;
  structures: Structure[];
}

export const ORGAN_TREE: OrganCategory[] = [
  {
    id: 'general', label: 'Genel', icon: '🔍',
    structures: [
      { id: 'general_full', label: 'Tüm görüntü analizi' },
    ],
  },
  {
    id: 'brain', label: 'Beyin', icon: '🧠',
    structures: [
      { id: 'brain_general', label: 'Beyin (genel)' },
      { id: 'brain_frontal', label: 'Frontal lob' },
      { id: 'brain_temporal', label: 'Temporal lob' },
      { id: 'brain_parietal', label: 'Parietal lob' },
      { id: 'brain_occipital', label: 'Oksipital lob' },
      { id: 'brain_hippocampus', label: 'Hipokampüs' },
      { id: 'brain_thalamus', label: 'Talamus' },
      { id: 'brain_basal_ganglia', label: 'Bazal ganglionlar' },
      { id: 'brain_cerebellum', label: 'Serebellum' },
      { id: 'brain_brainstem', label: 'Beyin sapı' },
      { id: 'brain_ventricles', label: 'Ventriküller' },
      { id: 'brain_corpus_callosum', label: 'Korpus kallozum' },
      { id: 'brain_meninges', label: 'Meninksler' },
      { id: 'brain_sella', label: 'Sella / Hipofiz' },
      { id: 'brain_white_matter', label: 'Beyaz cevher' },
      { id: 'brain_vessels', label: 'Serebral damarlar' },
    ],
  },
  {
    id: 'spine', label: 'Omurga', icon: '🦴',
    structures: [
      { id: 'spine_general', label: 'Omurga (genel)' },
      { id: 'spine_cervical', label: 'Servikal' },
      { id: 'spine_thoracic', label: 'Torakal' },
      { id: 'spine_lumbar', label: 'Lomber' },
      { id: 'spine_sacral', label: 'Sakral' },
      { id: 'spine_disc', label: 'Disk' },
      { id: 'spine_cord', label: 'Spinal kord' },
      { id: 'spine_neural_foramen', label: 'Nöral foramen' },
      { id: 'spine_facet', label: 'Faset eklem' },
      { id: 'spine_ligament', label: 'Ligamentler' },
      { id: 'spine_paravertebral', label: 'Paravertebral' },
    ],
  },
  {
    id: 'chest', label: 'Göğüs', icon: '🫁',
    structures: [
      { id: 'chest_general', label: 'Göğüs (genel)' },
      { id: 'chest_lung_right', label: 'Sağ akciğer' },
      { id: 'chest_lung_left', label: 'Sol akciğer' },
      { id: 'chest_mediastinum', label: 'Mediasten' },
      { id: 'chest_hilum', label: 'Hilus' },
      { id: 'chest_pleura', label: 'Plevra' },
      { id: 'chest_trachea', label: 'Trakea / Bronşlar' },
      { id: 'chest_aorta', label: 'Torasik aorta' },
      { id: 'chest_esophagus', label: 'Özofagus' },
      { id: 'chest_chest_wall', label: 'Göğüs duvarı' },
      { id: 'chest_diaphragm', label: 'Diyafragma' },
      { id: 'chest_lymph', label: 'Lenf nodları' },
    ],
  },
  {
    id: 'heart', label: 'Kalp', icon: '❤️',
    structures: [
      { id: 'heart_general', label: 'Kalp (genel)' },
      { id: 'heart_lv', label: 'Sol ventrikül' },
      { id: 'heart_rv', label: 'Sağ ventrikül' },
      { id: 'heart_la', label: 'Sol atriyum' },
      { id: 'heart_ra', label: 'Sağ atriyum' },
      { id: 'heart_valve', label: 'Kapaklar' },
      { id: 'heart_coronary', label: 'Koroner arterler' },
      { id: 'heart_pericardium', label: 'Perikard' },
      { id: 'heart_septum', label: 'Septum' },
      { id: 'heart_aortic_root', label: 'Aort kökü' },
    ],
  },
  {
    id: 'abdomen', label: 'Abdomen', icon: '🫃',
    structures: [
      { id: 'abd_general', label: 'Abdomen (genel)' },
      { id: 'abd_liver', label: 'Karaciğer' },
      { id: 'abd_gallbladder', label: 'Safra kesesi' },
      { id: 'abd_bile_ducts', label: 'Safra yolları' },
      { id: 'abd_pancreas', label: 'Pankreas' },
      { id: 'abd_spleen', label: 'Dalak' },
      { id: 'abd_stomach', label: 'Mide' },
      { id: 'abd_duodenum', label: 'Duodenum' },
      { id: 'abd_small_bowel', label: 'İnce barsak' },
      { id: 'abd_colon', label: 'Kolon' },
      { id: 'abd_appendix', label: 'Apendiks' },
      { id: 'abd_mesentery', label: 'Mezenter' },
      { id: 'abd_peritoneum', label: 'Periton' },
      { id: 'abd_omentum', label: 'Omentum' },
      { id: 'abd_retroperitoneum', label: 'Retroperiton' },
      { id: 'abd_lymph', label: 'Abdominal lenf nodları' },
    ],
  },
  {
    id: 'kidney', label: 'Üriner', icon: '🫘',
    structures: [
      { id: 'kidney_general', label: 'Üriner (genel)' },
      { id: 'kidney_right', label: 'Sağ böbrek' },
      { id: 'kidney_left', label: 'Sol böbrek' },
      { id: 'kidney_adrenal_r', label: 'Sağ adrenal' },
      { id: 'kidney_adrenal_l', label: 'Sol adrenal' },
      { id: 'kidney_ureter', label: 'Üreterler' },
      { id: 'kidney_bladder', label: 'Mesane' },
      { id: 'kidney_collecting', label: 'Toplayıcı sistem' },
    ],
  },
  {
    id: 'vascular', label: 'Vasküler', icon: '🔴',
    structures: [
      { id: 'vasc_general', label: 'Vasküler (genel)' },
      { id: 'vasc_aorta', label: 'Aorta' },
      { id: 'vasc_ivc', label: 'VCI' },
      { id: 'vasc_portal', label: 'Portal ven' },
      { id: 'vasc_smv', label: 'SMV' },
      { id: 'vasc_sma', label: 'SMA' },
      { id: 'vasc_celiac', label: 'Çölyak trunkus' },
      { id: 'vasc_renal', label: 'Renal arterler/venler' },
      { id: 'vasc_iliac', label: 'İliak damarlar' },
      { id: 'vasc_carotid', label: 'Karotis' },
      { id: 'vasc_vertebral', label: 'Vertebral arterler' },
      { id: 'vasc_pulmonary', label: 'Pulmoner arterler' },
    ],
  },
  {
    id: 'pelvis', label: 'Pelvis', icon: '🦴',
    structures: [
      { id: 'pelvis_general', label: 'Pelvis (genel)' },
      { id: 'pelvis_uterus', label: 'Uterus' },
      { id: 'pelvis_ovary', label: 'Overler' },
      { id: 'pelvis_prostate', label: 'Prostat' },
      { id: 'pelvis_rectum', label: 'Rektum' },
      { id: 'pelvis_bone', label: 'Pelvik kemik' },
      { id: 'pelvis_muscle', label: 'Pelvik kas' },
      { id: 'pelvis_lymph', label: 'Pelvik lenf nodları' },
    ],
  },
  {
    id: 'neck', label: 'Boyun', icon: '🔵',
    structures: [
      { id: 'neck_general', label: 'Boyun (genel)' },
      { id: 'neck_thyroid', label: 'Tiroid' },
      { id: 'neck_parotid', label: 'Parotis' },
      { id: 'neck_submandibular', label: 'Submandibüler' },
      { id: 'neck_larynx', label: 'Larinks' },
      { id: 'neck_pharynx', label: 'Farinks' },
      { id: 'neck_lymph', label: 'Servikal lenf nodları' },
      { id: 'neck_spaces', label: 'Boyun boşlukları' },
    ],
  },
  {
    id: 'extremity', label: 'Ekstremite', icon: '🦵',
    structures: [
      { id: 'ext_general', label: 'Ekstremite (genel)' },
      { id: 'ext_bone', label: 'Kemik' },
      { id: 'ext_joint', label: 'Eklem' },
      { id: 'ext_muscle', label: 'Kas / Tendon' },
      { id: 'ext_ligament', label: 'Ligament' },
      { id: 'ext_meniscus', label: 'Menisküs' },
      { id: 'ext_cartilage', label: 'Kıkırdak' },
      { id: 'ext_soft_tissue', label: 'Yumuşak doku' },
    ],
  },
  {
    id: 'eye', label: 'Göz / Orbita', icon: '👁️',
    structures: [
      { id: 'eye_general', label: 'Orbita (genel)' },
      { id: 'eye_globe', label: 'Glob' },
      { id: 'eye_optic_nerve', label: 'Optik sinir' },
      { id: 'eye_extraocular', label: 'Ekstraoküler kaslar' },
      { id: 'eye_lacrimal', label: 'Lakrimal bez' },
    ],
  },
];

// Flat lookup
export function findStructure(id: string): { category: OrganCategory; structure: Structure } | null {
  for (const cat of ORGAN_TREE) {
    const s = cat.structures.find((s) => s.id === id);
    if (s) return { category: cat, structure: s };
  }
  return null;
}

// ─── Organ Presets for AnnotationOverlay ───────────────────────────
// Flat list with colors, derived from ORGAN_TREE categories
// Single source of truth — AnnotationOverlay imports from here

export interface OrganPreset {
  id: string;
  label: string;
  icon: string;
  color: string;
}

const ORGAN_COLORS: Record<string, string> = {
  general: '#3b82f6',
  brain: '#a855f7',
  spine: '#f59e0b',
  chest: '#22c55e',
  heart: '#ef4444',
  abdomen: '#06b6d4',
  kidney: '#dc2626',
  vascular: '#f97316',
  pelvis: '#7c3aed',
  neck: '#2563eb',
  extremity: '#0891b2',
  eye: '#4f46e5',
};

/** Flat organ presets for overlay/annotation components */
export const ORGAN_PRESETS: OrganPreset[] = ORGAN_TREE.map((cat) => ({
  id: cat.id,
  label: cat.label,
  icon: cat.icon,
  color: ORGAN_COLORS[cat.id] || '#3b82f6',
}));
