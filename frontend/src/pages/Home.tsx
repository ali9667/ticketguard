import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { EventSummary } from '../lib/types';
import { apiErrorMessage } from '../lib/types';

const images = [
  'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1600&q=88',
  'https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1200&q=88',
  'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1200&q=88',
  'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=88',
];

export function Home() {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { void api.get('/events').then(r => setEvents(r.data.data as EventSummary[])).catch(e => setError(apiErrorMessage(e, ''))); }, []);
  const featured = events[0];
  const popular = useMemo(() => events.slice(0, 4), [events]);

  return <div className="page home-page">
    <section className="hero">
      <div className="hero-visual">
        <div className="hero-card" style={{backgroundImage:`url(${featured ? images[featured.id.charCodeAt(0)%images.length] : images[0]})`}}>
          <div className="hero-copy">
            <span className="eyebrow">Tonight · Live experiences</span>
            <h1>{featured?.name || 'Find something worth showing up for.'}</h1>
            <p>{featured ? `${featured.venue.name}, ${featured.venue.city} · ${new Date(featured.startAt).toLocaleDateString(undefined,{month:'short',day:'numeric'})}` : 'Concerts, comedy, theatre and experiences — discovered, purchased and protected in one place.'}</p>
            <div className="actions">
              <Link className="btn primary" to={featured ? `/events/${featured.id}` : '/events'}>{featured ? 'Book now →' : 'Explore events →'}</Link>
              <Link className="btn ghost" to="/events">View all events</Link>
            </div>
          </div>
          <div className="hero-ticket">
            <span className="eyebrow">TicketGuard protected</span>
            <div className="big">Your ticket. Your ownership.</div>
            <div className="hero-ticket-row"><span>Cryptographic credential</span><span>● Verified</span></div>
          </div>
        </div>
      </div>
    </section>

    <section className="section home-popular">
      <div className="section-head"><div><span className="eyebrow">Popular near you</span><h2>Explore the most wanted events</h2><p className="muted">Real published events from TicketGuard — no fabricated listings.</p></div><Link className="btn ghost" to="/events">View all →</Link></div>
      {error ? <div className="notice error">Unable to load live events.</div> : popular.length === 0 ? <div className="card empty"><h3>No live events right now</h3><p className="muted">New events appear here as organizers publish them.</p></div> : <div className="grid">{popular.map((event,i)=><Link key={event.id} to={`/events/${event.id}`} className="card event-card" style={{textDecoration:'none',color:'inherit'}}><div className="event-image" style={{backgroundImage:`url(${images[i%images.length]})`}}><span className="pill active" style={{position:'absolute',top:12,right:12,zIndex:1}}>{new Date(event.startAt).toLocaleDateString(undefined,{month:'short',day:'2-digit'})}</span></div><div className="event-body"><h3>{event.name}</h3><p>{event.venue.name}, {event.venue.city}</p><p className="muted">{new Date(event.startAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</p></div></Link>)}</div>}
    </section>

    <section className="section"><div className="section-head"><div><span className="eyebrow">Why TicketGuard</span><h2>Built like a ticketing product. Engineered like a security system.</h2></div></div><div className="feature-grid"><div className="card feature"><span className="eyebrow">01 · Ownership</span><h3>Cryptographic tickets</h3><p className="muted">Every issued ticket gets a unique credential, encrypted at rest and independently verifiable.</p></div><div className="card feature"><span className="eyebrow">02 · Transfer</span><h3>Controlled ownership</h3><p className="muted">Transfers have explicit lifecycle rules, expiry and an auditable ownership trail.</p></div><div className="card feature"><span className="eyebrow">03 · Entry</span><h3>One-time verification</h3><p className="muted">Scanner authorization and transactional locking prevent the same ticket from being consumed twice.</p></div></div></section>
  </div>;
}
