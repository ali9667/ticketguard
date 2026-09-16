import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useNotifications } from '../lib/useNotifications';
import './layout.css';

export function Layout() {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();
  const nav = (to: string, label: string) => <NavLink to={to} className={({isActive}) => isActive ? 'active' : ''}>{label}</NavLink>;
  return <div className="app-shell">
    <header className="topbar">
      <Link className="brand" to="/"><span className="brand-mark">✓</span>TicketGuard</Link>
      <div className="global-search"><span>⌕</span><input aria-label="Search events" placeholder="Find amazing events & artists" onKeyDown={e=>{if(e.key==='Enter'){const v=e.currentTarget.value.trim();navigate(v?`/events?q=${encodeURIComponent(v)}`:'/events')}}}/></div>
      <div className="top-location">⌖ <span>India</span></div>
      <nav className="nav">
        {nav('/events','Explore')}
        {auth && nav('/tickets','My tickets')}
        {auth && nav('/orders','Orders')}
        {auth && nav('/transfers',`Transfers${unreadCount ? ` · ${unreadCount}` : ''}`)}
        {(auth?.role === 'SCANNER' || auth?.role === 'ADMIN') && nav('/scanner','Scanner')}
        {(auth?.role === 'EVENT_ORGANIZER' || auth?.role === 'ADMIN') && nav('/organizer','Organizer')}
        {auth?.role === 'ADMIN' && nav('/admin','Admin')}
        {auth ? <button onClick={() => void logout()}>Sign out</button> : <Link className="btn primary" to="/login">Sign in</Link>}
      </nav>
      <div className="mobile-menu">{auth ? <button className="btn ghost" onClick={() => void logout()}>Sign out</button> : <Link className="btn primary" to="/login">Sign in</Link>}</div>
    </header>
    <main><Outlet/></main>
    <footer className="footer"><strong>TicketGuard</strong><span>Verified ownership · secure transfer · trusted entry</span></footer>
  </div>;
}
