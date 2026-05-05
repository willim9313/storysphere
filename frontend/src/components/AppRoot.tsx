import { RouterProvider } from 'react-router-dom';
import { router } from '@/router';
import { SplashScreen } from '@/components/SplashScreen';
import { useSplash } from '@/hooks/useSplash';

export function AppRoot() {
  const { needsSplash, markDone } = useSplash();

  return (
    <>
      {needsSplash && <SplashScreen onDone={markDone} />}
      <RouterProvider router={router} />
    </>
  );
}
