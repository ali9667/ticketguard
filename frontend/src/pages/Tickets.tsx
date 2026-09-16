import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../lib/api';
import { apiErrorMessage, type TicketSummary } from '../lib/types';
const images = ['https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1000&q=85','https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1000&q=85','https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1000&q=85'];

export function Tickets() {
  const [tickets, setTickets] = useState<TicketSummary[]>([]); const [error, setError] = useState('');
  const location = useLocation(); const purchased = Boolean((location.state as { purchased?: boolean } | null)?.purchased);
  useEffect(() => { void api.get('/tickets').then(r => setTickets(r.data.data)).catch(e => setError(apiErrorMessage(e, 'Unable to load tickets.'))); }, []);
  return <div className="page"><div className="section-head"><div><span className="eyebrow">Your wallet</span><h1 style={{ fontSize: 52 }}>My tickets</h1><p className="muted">Your active ownership records, ready for secure entry.</p></div><Link className="btn ghost" to="/orders">Order history</Link></div>
    {purchased && <div className="notice success" style={{ marginBottom: 20 }}><strong>Purchase confirmed.</strong> Your tickets have been issued to your secure wallet.</div>}
    {error && <div className="notice error">{error}</div>}
    {!error && tickets.length === 0 ? <div className="card empty"><h2>Your wallet is empty</h2><p className="muted">Explore an event and purchase tickets to see them here.</p><Link className="btn primary" to="/events">Explore events</Link></div> : <div className="grid">{tickets.map((t, i) => <Link key={t.id} to={`/tickets/${t.id}`} className="card event-card" style={{ textDecoration: 'none', color: 'inherit', padding: 0 }}><div className="event-image" style={{ backgroundImage: `url(${images[i % images.length]})` }} /><div className="event-body"><span className={`pill ${t.status === 'ACTIVE' ? 'active' : ''}`}>{t.status}</span><h2 style={{ marginTop: 12 }}>{t.event.name}</h2><p>{t.ticketType.name} · {t.event.venue.name}</p><p className="muted">{new Date(t.event.startAt).toLocaleString()}</p><strong>Open secure ticket →</strong></div></Link>)}</div>}
  </div>;
}
