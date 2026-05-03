import { useCallback, useState } from 'react';

const SPLASH_KEY = 'storysphere:splash-shown';

export function useSplash() {
  const [shown, setShown] = useState(() => sessionStorage.getItem(SPLASH_KEY) === '1');

  const markDone = useCallback(() => {
    sessionStorage.setItem(SPLASH_KEY, '1');
    setShown(true);
  }, []);

  return { needsSplash: !shown, markDone };
}
