import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './lib/app';
import MapLayout from './components/map/MapLayout';
import OnboardingScreen from './screens/OnboardingScreen';
import HomeScreen from './screens/HomeScreen';
import OnTheWayScreen from './screens/OnTheWayScreen';
import MyRoomsScreen from './screens/MyRoomsScreen';
import AdminScreen from './screens/AdminScreen';

export default function App() {
  return (
    <div id="app-frame" className="app-frame">
      <AppProvider>
        <Routes>
          <Route path="/start" element={<OnboardingScreen />} />
          <Route path="/consent" element={<RequireAuth><OnboardingScreen consentOnly /></RequireAuth>} />
          <Route path="/services" element={<RequireAuth><OnboardingScreen servicesOnly /></RequireAuth>} />
          <Route element={<RequireAuth consent><MapLayout /></RequireAuth>}>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/rooms/:id" element={<OnTheWayScreen />} />
          </Route>
          <Route path="/me/rooms" element={<RequireAuth><MyRoomsScreen /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth admin><AdminScreen /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppProvider>
    </div>
  );
}

function RequireAuth({ children, admin = false, consent = false }: { children: ReactNode; admin?: boolean; consent?: boolean }) {
  const { member, loading } = useApp();
  const location = useLocation();
  if (loading) return <div className="absolute inset-0 grid place-items-center bg-ink"><div className="spinner" style={{ borderColor: 'rgba(255,255,255,.15)', borderTopColor: '#FFD966' }} /></div>;
  if (!member) return <Navigate to="/start" replace />;
  if (admin && member.role !== 'ADMIN') return <Navigate to="/" replace />;
  // Map screens need both agreements (location notice, external services). Anyone who hasn't finished them —
  // including people with a saved session from before a step was added — starts over from the Start screen.
  if (consent && (!member.locationConsent || !member.servicesConsent)) return <Navigate to="/start" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}
