// Shared clinical context state hook
// Used by both AIPanel (desktop) and MobileApp (mobile)

import { useState } from 'react';
import type { ClinicalContext } from '../lib/promptTemplates';
import { hasClinicalContext as _hasClinicalContext } from '../lib/geminiClient';

export function useClinicalContext() {
  const [showContext, setShowContext] = useState(false);
  const [clinicalContext, setClinicalContext] = useState<ClinicalContext>({
    age: '',
    gender: '',
    complaint: '',
    history: '',
    clinicalQuestion: '',
  });

  const hasContext = () => _hasClinicalContext(clinicalContext);

  const resetContext = () => {
    setClinicalContext({
      age: '',
      gender: '',
      complaint: '',
      history: '',
      clinicalQuestion: '',
    });
  };

  const updateField = (field: keyof ClinicalContext, value: string) => {
    setClinicalContext((prev) => ({ ...prev, [field]: value }));
  };

  return {
    showContext,
    setShowContext,
    clinicalContext,
    setClinicalContext,
    hasContext,
    resetContext,
    updateField,
  };
}
