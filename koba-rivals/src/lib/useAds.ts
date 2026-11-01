import { useEffect, useState } from 'react';
import { getAds, setAds, subscribeAds } from './ads';
import type { AdState } from './ads';

/** Reads the shared ad store and re-renders whenever a campaign or metric changes. */
export function useAds(): [AdState, (next: AdState) => void] {
  const [state, setLocal] = useState<AdState>(() => getAds());

  useEffect(() => subscribeAds(() => setLocal(getAds())), []);

  return [state, setAds];
}
