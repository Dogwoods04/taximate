import { lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { platform } from './lib/platform';
import MobileApp from './mobile/MobileApp';

// The PC site is only downloaded on PCs; phones (and the PC phone-frame iframe) get the mobile app.
const PcApp = lazy(() => import('./pc/PcApp'));

export default function App() {
  const { pathname } = useLocation();
  if (platform.view === 'mobile' || pathname === '/auth/kakao') return <MobileApp />;
  return <Suspense fallback={null}><PcApp /></Suspense>;
}
