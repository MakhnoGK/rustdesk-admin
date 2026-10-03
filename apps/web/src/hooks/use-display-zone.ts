import { createContext, useContext } from 'react';
import type { DisplayZone } from '@/lib/time';

export interface DisplayZoneState {
  /** `'UTC'` when "Show times in UTC" is on, otherwise `undefined` (the viewer's local zone). */
  zone: DisplayZone;
  utc: boolean;
  setUtc: (utc: boolean) => void;
}

export const DisplayZoneContext = createContext<DisplayZoneState | null>(null);

export function useDisplayZone(): DisplayZoneState {
  const value = useContext(DisplayZoneContext);
  if (!value) throw new Error('useDisplayZone must be used inside <PreferencesProvider>');
  return value;
}
