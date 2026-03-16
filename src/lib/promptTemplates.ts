// Modality-aware prompt templates for structured radiology reporting
// Each modality has specific evaluation criteria and reporting standards

export interface ClinicalContext {
  age?: string;
  gender?: 'male' | 'female' | 'other' | '';
  complaint?: string;
  history?: string;
  clinicalQuestion?: string;
}

export function buildClinicalContextString(ctx: ClinicalContext): string {
  const parts: string[] = [];
  if (ctx.age) parts.push(`Yaş: ${ctx.age}`);
  if (ctx.gender) {
    const g = ctx.gender === 'male' ? 'Erkek' : ctx.gender === 'female' ? 'Kadın' : 'Diğer';
    parts.push(`Cinsiyet: ${g}`);
  }
  if (ctx.complaint) parts.push(`Şikayet: ${ctx.complaint}`);
  if (ctx.history) parts.push(`Özgeçmiş: ${ctx.history}`);
  if (ctx.clinicalQuestion) parts.push(`Klinik soru: ${ctx.clinicalQuestion}`);
  return parts.length > 0
    ? `\n\nHASTA BİLGİLERİ:\n${parts.join('\n')}`
    : '';
}

// Modality-specific system prompts
const MODALITY_PROMPTS: Record<string, string> = {
  CT: `Sen deneyimli bir radyolog asistanısın. BT (Bilgisayarlı Tomografi) görüntüsü analiz ediyorsun.
Türkçe yanıt ver. Aşağıdaki yapıda sistematik rapor hazırla:

## TEKNİK
- Kesit kalınlığı, kontrast durumu (varsa), rekonstrüksiyon penceresi

## BULGULAR
Her anatomik bölge için sırasıyla değerlendir. Ölçüm ver (mm/cm). Dansite değerleri (HU) belirt.
- Patolojik bulgu varsa: lokalizasyon, boyut, morfoloji, kontrast tutulumu
- Normal yapıları kısaca "doğal" olarak belirt

## SONUÇ / İZLENİM
- Ana bulgular (en önemli önce)
- Olası tanılar (en muhtemel → en az muhtemel)
- Varsa ilgili skorlama sistemi kullan (Lung-RADS, LI-RADS, Bosniak vb.)

## ÖNERİ
- Klinik korelasyon, ek tetkik, takip önerisi`,

  MR: `Sen deneyimli bir radyolog asistanısın. MR (Manyetik Rezonans) görüntüsü analiz ediyorsun.
Türkçe yanıt ver. Aşağıdaki yapıda sistematik rapor hazırla:

## TEKNİK
- Sekans tipi (T1, T2, FLAIR, DWI, kontrastlı vb.)

## BULGULAR
- Sinyal karakteristikleri (T1/T2 sinyal intensitesi)
- Difüzyon kısıtlanması varsa belirt
- Kontrast tutulumu (varsa pattern'i tanımla: homojen, heterojen, rim, nodüler)
- Ölçüm ver (mm/cm)
- Normal yapıları kısaca "doğal" olarak belirt

## SONUÇ / İZLENİM
- Ana bulgular, olası tanılar
- Varsa ilgili skorlama: PI-RADS (prostat), BI-RADS (meme MR), O-RADS (over), mRECIST

## ÖNERİ
- Klinik korelasyon, ek tetkik, takip`,

  CR: `Sen deneyimli bir radyolog asistanısın. Konvansiyonel röntgen (X-ray) görüntüsü analiz ediyorsun.
Türkçe yanıt ver. Aşağıdaki yapıda sistematik rapor hazırla:

## TEKNİK
- Pozisyon (PA, AP, lateral vb.), kalite

## BULGULAR
Göğüs röntgeni ise sırasıyla:
- Akciğer alanları (sağ/sol, üst/orta/alt zonlar)
- Hilus, mediasten genişliği
- Kardiyotorasik oran
- Kemik yapılar, yumuşak dokular
- Plevral alan, kostofrenik sinüsler
- Trakea, pozisyon

Kemik röntgeni ise: Alignment, kemik yapı, eklem aralığı, yumuşak doku

## SONUÇ / İZLENİM
- Ana bulgular, olası tanılar

## ÖNERİ
- Klinik korelasyon, gerekirse BT/MR`,

  US: `Sen deneyimli bir radyolog asistanısın. Ultrasonografi görüntüsü analiz ediyorsun.
Türkçe yanıt ver. Aşağıdaki yapıda sistematik rapor hazırla:

## TEKNİK
- İnceleme bölgesi, prob tipi (lineer/konveks)

## BULGULAR
- Organ boyutları, ekojenite (hipoekoik, hiperekoik, anekoik, mikst)
- Lezyon varsa: lokalizasyon, boyut, sınır, vaskülarite (Doppler varsa)
- Sıvı koleksiyonu, lenfadenopati

## SONUÇ / İZLENİM
- Ana bulgular
- Varsa skorlama: TI-RADS (tiroid nodülü), BI-RADS (meme US), Bosniak (renal kist)

## ÖNERİ
- Takip, biyopsi endikasyonu, ek görüntüleme`,

  MG: `Sen deneyimli bir radyolog asistanısın. Mamografi görüntüsü analiz ediyorsun.
Türkçe yanıt ver. BI-RADS leksikonunu kullan:

## TEKNİK
- Projeksiyon (MLO, CC), dijital/tomosentez

## BULGULAR
- Meme kompozisyonu (ACR a/b/c/d)
- Kitle varsa: şekil, sınır, dansite
- Kalsifikasyon varsa: morfoloji, dağılım
- Asimetri, yapısal distorsiyon
- Aksiller LAP

## BI-RADS KATEGORİZASYON
- BI-RADS 0-6 arası sınıfla ve gerekçesini yaz

## ÖNERİ
- BI-RADS kategorisine uygun takip/biyopsi önerisi`,

  NM: `Sen deneyimli bir radyolog asistanısın. Nükleer tıp / sintigrafi görüntüsü analiz ediyorsun.
Türkçe yanıt ver.

## TEKNİK
- Radyofarmasötik, görüntüleme tekniği (planar, SPECT, PET/BT)

## BULGULAR
- Aktivite dağılımı, tutulum paternleri
- Fokal artmış/azalmış tutulum bölgeleri
- PET ise: SUVmax değerleri

## SONUÇ / İZLENİM
- Bulgular, olası tanılar

## ÖNERİ`,

  DEFAULT: `Sen deneyimli bir radyolog asistanısın. Türkçe yanıt ver.
Görüntü tıbbi bir görüntü olabileceği gibi, ekran görüntüsü, telefon fotoğrafı veya başka bir görüntü de olabilir.

Tıbbi görüntüler için aşağıdaki yapıda sistematik rapor hazırla:
## TEKNİK
## BULGULAR
## SONUÇ / İZLENİM
## ÖNERİ

Tıbbi olmayan görüntüler için: İçeriği analiz et ve açıkla.`,
};

// Map DICOM modality codes to our prompt keys
const MODALITY_MAP: Record<string, string> = {
  CT: 'CT',
  MR: 'MR',
  CR: 'CR',
  DX: 'CR',  // Digital X-ray
  DR: 'CR',  // Digital Radiography
  XA: 'CR',  // X-ray Angiography
  RF: 'CR',  // Radiofluoroscopy
  US: 'US',
  MG: 'MG',
  PT: 'NM',  // PET
  NM: 'NM',
  OT: 'DEFAULT',
  SC: 'DEFAULT', // Secondary Capture
};

export function getSystemPrompt(modality?: string): string {
  if (!modality) return MODALITY_PROMPTS.DEFAULT;
  const key = MODALITY_MAP[modality.toUpperCase()] || 'DEFAULT';
  return MODALITY_PROMPTS[key];
}

// Build organ-focused prompt with modality awareness
export function buildAnalysisPrompt(opts: {
  modality?: string;
  seriesDescription?: string;
  imageIndex?: number;
  totalImages?: number;
  organLabel?: string;
  hasDrawing?: boolean;
  clinicalContext?: ClinicalContext;
}): string {
  const parts: string[] = [];

  // Image context
  if (opts.modality) {
    parts.push(`Modalite: ${opts.modality}`);
  }
  if (opts.seriesDescription) {
    parts.push(`Seri: ${opts.seriesDescription}`);
  }
  if (opts.imageIndex !== undefined && opts.totalImages) {
    parts.push(`Kesit: ${opts.imageIndex + 1}/${opts.totalImages}`);
  }

  // Clinical context
  if (opts.clinicalContext) {
    const ctxStr = buildClinicalContextString(opts.clinicalContext);
    if (ctxStr) parts.push(ctxStr);
  }

  // Organ/region focus
  if (opts.organLabel && opts.organLabel !== 'Genel Analiz' && opts.organLabel !== 'Tüm görüntü analizi') {
    if (opts.hasDrawing) {
      parts.push(`\nGörüntüde "${opts.organLabel}" bölgesinde kırmızı ile işaretlenmiş alanı analiz et. İşaretli bölgedeki bulguları detaylı değerlendir. Patoloji varsa tanımla, yoksa normal olarak raporla.`);
    } else {
      parts.push(`\n"${opts.organLabel}" yapısına/bölgesine odaklanarak analiz et. Bu organa/bölgeye özgü bulguları değerlendir.`);
    }
  } else {
    parts.push('\nBu görüntüyü sistematik olarak analiz et. Tüm yapıları sırasıyla değerlendir.');
  }

  return parts.join('\n');
}

// Scoring system hints based on organ + modality
export function getScoringHint(organId: string, modality?: string): string | null {
  const mod = modality?.toUpperCase() || '';

  if (organId.startsWith('chest_lung') && mod === 'CT') return 'Lung-RADS sınıflaması kullan';
  if (organId === 'abd_liver' && mod === 'CT') return 'LI-RADS sınıflaması kullan (hepatoselüler karsinom riski varsa)';
  if (organId === 'abd_liver' && mod === 'MR') return 'LI-RADS sınıflaması kullan';
  if (organId === 'abd_liver' && mod === 'US') return 'US LI-RADS sınıflaması kullan';
  if (organId === 'kidney_right' || organId === 'kidney_left') return 'Kistik lezyon varsa Bosniak sınıflaması kullan';
  if (organId === 'neck_thyroid' && mod === 'US') return 'ACR TI-RADS sınıflaması kullan';
  if (organId === 'pelvis_prostate' && mod === 'MR') return 'PI-RADS v2.1 sınıflaması kullan';
  if (organId === 'pelvis_ovary' && mod === 'MR') return 'O-RADS MRI sınıflaması kullan';
  if (organId === 'pelvis_ovary' && mod === 'US') return 'O-RADS US sınıflaması kullan';
  if (organId === 'ext_bone') return 'Fraktür varsa AO sınıflaması kullan';
  if (organId === 'brain_general' || organId.startsWith('brain_')) {
    if (mod === 'MR') return 'İnme şüphesi varsa DWI değerlendir. Tümör varsa WHO grade belirt.';
  }
  return null;
}

// Medical disclaimer text
export const MEDICAL_DISCLAIMER = 'Bu analiz yapay zeka destekli bir karar destek aracıdır. Kesin tanı koymaz, klinik kararın yerini almaz. Tüm bulgular uzman hekim tarafından değerlendirilmelidir.';
