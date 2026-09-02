import { Routes, Route, Navigate, NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth } from './components/AuthContext.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Campaigns from './pages/Campaigns.jsx';
import CreateCampaign from './pages/CreateCampaign.jsx';
import Campaign from './pages/Campaign.jsx';
import LiveCampaign from './pages/LiveCampaign.jsx';
import Analytics from './pages/Analytics.jsx';
import Wallet from './pages/Wallet.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';

function NavBar() {
  const { user, ready, logout } = useAuth();
  const location = useLocation();
  const showNav = user && location.pathname !== '/';
  if (!showNav) return null;
  const link = ({ isActive }) => 'nav-link' + (isActive ? ' active' : '');
  return (
    <header className="nav">
      <Link to="/dashboard" className="brand">
        <span className="brand-dot" /> Traffic Loop
      </Link>
      <nav className="nav-links">
        <NavLink to="/dashboard" className={link}>Dashboard</NavLink>
        <NavLink to="/campaigns" className={link}>Campaigns</NavLink>
        <NavLink to="/campaigns/new" className={link}>New</NavLink>
        <NavLink to="/analytics" className={link}>Analytics</NavLink>
        <NavLink to="/wallet" className={link}>Wallet</NavLink>
        <NavLink to="/reports" className={link}>Reports</NavLink>
        <NavLink to="/settings" className={link}>Settings</NavLink>
      </nav>
      <div className="nav-user">
        {ready && user ? (
          <>
            <span className="user-email">{user.email || 'Signed in'}</span>
            <button onClick={logout} className="btn btn-ghost">Logout</button>
          </>
        ) : (
          <Link to="/login" className="btn btn-primary">Sign in</Link>
        )}
      </div>
    </header>
  );
}

function Protected({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="page-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Public({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="page-loading">Loading…</div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <NavBar />
      <main className="main">
        <Routes>
          <Route path="/" element={<LandingRoute />} />
          <Route path="/login" element={<Public><Login /></Public>} />
          <Route path="/signup" element={<Public><Signup /></Public>} />
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="/campaigns" element={<Protected><Campaigns /></Protected>} />
          <Route path="/campaigns/new" element={<Protected><CreateCampaign /></Protected>} />
          <Route path="/campaigns/:id" element={<Protected><LiveCampaign /></Protected>} />
          <Route path="/campaigns/:id/analytics" element={<Protected><Analytics /></Protected>} />
          <Route path="/campaigns/:id/diagnostic" element={<Protected><Analytics diagnosticMode /></Protected>} />
          <Route path="/analytics" element={<Protected><Analytics /></Protected>} />
          <Route path="/analytics/:campaignId" element={<Protected><Analytics /></Protected>} />
          <Route path="/wallet" element={<Protected><Wallet /></Protected>} />
          <Route path="/reports" element={<Protected><Reports /></Protected>} />
          <Route path="/settings" element={<Protected><Settings /></Protected>} />
          <Route path="/c/:id" element={<Protected><Campaign /></Protected>} />
          <Route path="*" element={<div className="empty">Not found</div>} />
        </Routes>
      </main>
    </>
  );
}

function LandingRoute() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="page-loading">Loading…</div>;
  return <Landing user={user} />;
}
