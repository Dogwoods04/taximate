import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import LandingPage from './LandingPage';
import TryPage from './TryPage';
import './pc.css';

/**
 * PC site: `/` introduces the service, `/try` shows a usage guide beside a phone frame running the real
 * mobile app (same-origin iframe). Any other app path opened on a PC (e.g. a shared /rooms/… link)
 * goes to /try with that path loaded inside the phone.
 */
export default function PcApp() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/try" element={<TryPage />} />
      <Route path="*" element={<DeepLink />} />
    </Routes>
  );
}

function DeepLink() {
  const { pathname } = useLocation();
  return <Navigate to={`/try?path=${encodeURIComponent(pathname)}`} replace />;
}
