import { useEffect, useState } from 'react';

/**
 * Phone UI (UPDATE-1 ج9): narrow screens, and phones held sideways (touch + short screen).
 * The iPad stays on the laptop UI.
 */
export const PHONE_QUERY = '(max-width: 760px), (pointer: coarse) and (max-height: 520px)';

export const isPhone = () => typeof matchMedia !== 'undefined' && matchMedia(PHONE_QUERY).matches;

export function useIsMobile() {
  const [m, setM] = useState(isPhone);
  useEffect(() => {
    const mq = matchMedia(PHONE_QUERY);
    const f = () => setM(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return m;
}
