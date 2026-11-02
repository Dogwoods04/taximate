import type { ReactNode } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { isMock } from './api';
import { AppProvider, useApp } from './lib/app';
import { Spinner } from './components/ui';
import LoginPage from './pages/LoginPage';
import ConsentPage from './pages/ConsentPage';
import NewTripPage from './pages/NewTripPage';
import TripPage from './pages/TripPage';
import CandidatesPage from './pages/CandidatesPage';
import RoomPage from './pages/RoomPage';
import MyRoomsPage from './pages/MyRoomsPage';
import AdminPage from './pages/AdminPage';

export default function App() {
  return (
    <AppProvider>
      <Shell>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/consent" element={<RequireAuth><ConsentPage /></RequireAuth>} />
          <Route path="/" element={<RequireAuth><NewTripPage /></RequireAuth>} />
          <Route path="/trips/:id" element={<RequireAuth><TripPage /></RequireAuth>} />
          <Route path="/trips/:id/candidates" element={<RequireAuth><CandidatesPage /></RequireAuth>} />
          <Route path="/rooms/:id" element={<RequireAuth><RoomPage /></RequireAuth>} />
          <Route path="/me/rooms" element={<RequireAuth><MyRoomsPage /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth admin><AdminPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </AppProvider>
  );
}

function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { member, loading } = useApp();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!member) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (admin && member.role !== 'ADMIN') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Shell({ children }: { children: ReactNode }) {
  const { member, logout } = useApp();
  const navigate = useNavigate();
  const nav = ({ isActive }: { isActive: boolean }) => `rounded-lg px-2 py-1 ${isActive ? 'bg-white/20 text-white' : 'text-white/80 hover:text-white'}`;
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-50 shadow-sm">
      <header className="sticky top-0 z-30 bg-brand-600 px-4 py-3 text-white">
        <div className="flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2 text-base font-bold">
            🚕 시흥 택시메이트
            {isMock && <span className="rounded-md bg-yellow-300 px-1.5 py-0.5 text-[10px] font-bold text-yellow-900">MOCK 모드</span>}
          </Link>
          {member && (
            <button type="button" className="text-xs text-white/80 hover:text-white" onClick={() => { logout(); navigate('/login'); }}>
              로그아웃
            </button>
          )}
        </div>
        {member && (
          <nav className="mt-2 flex items-center gap-1 text-xs">
            <span className="mr-auto truncate font-semibold">{member.nickname}님{member.status === 'RESTRICTED' && ' · 이용 제한'}</span>
            <NavLink to="/" end className={nav}>새 이동</NavLink>
            <NavLink to="/me/rooms" className={nav}>내 동행방</NavLink>
            {member.role === 'ADMIN' && <NavLink to="/admin" className={nav}>관리자</NavLink>}
          </nav>
        )}
      </header>
      {member?.status === 'RESTRICTED' && (
        <div className="bg-red-50 px-4 py-2 text-xs text-red-700">운영 정책에 따라 이용이 제한된 계정이에요. 조회만 할 수 있어요.</div>
      )}
      <main className="flex-1 px-4 py-4">{children}</main>
      <footer className="border-t border-slate-200 px-4 py-4 text-[11px] leading-relaxed text-slate-500">
        서비스는 승객 간 동선 매칭·조율만 제공하며 법적 요건 검토 중인 MVP입니다. 운임 계산·결제·택시 호출 기능은 제공하지 않아요.
        다른 이용자의 위치는 약 100m 단위의 대략적인 지역으로만 표시돼요.
      </footer>
    </div>
  );
}
