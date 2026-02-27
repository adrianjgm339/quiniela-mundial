export type UTM = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
};

const KEY = 'qm_utms_v1';

export function saveUtm(utm: UTM) {
  if (typeof window === 'undefined') return;
  const prev = loadUtm();
  const next = { ...prev, ...utm };
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function loadUtm(): UTM {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}