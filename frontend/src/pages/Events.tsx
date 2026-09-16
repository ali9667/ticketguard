import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import type { EventSummary } from '../lib/types';
import { apiErrorMessage } from '../lib/types';

const images = ['https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1200&q=88','https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1200&q=88','https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1200&q=88','https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1200&q=88'];

export function Events() {
  const [events,setEvents]=useState<EventSummary[]>([]); const [query,setQuery]=useState(''); const [city,setCity]=useState('All cities'); const [error,setError]=useState(''); const [params,setParams]=useSearchParams();
  useEffect(()=>{setQuery(params.get('q')||'');void api.get('/events').then(r=>setEvents(r.data.data as EventSummary[])).catch(e=>setError(apiErrorMessage(e,'Unable to load events.')))},[params]);
  const cities=useMemo(()=>['All cities',...Array.from(new Set(events.map(e=>e.venue.city))).sort()],[events]);
  const filtered=useMemo(()=>events.filter(e=>`${e.name} ${e.venue.name} ${e.venue.city}`.toLowerCase().includes(query.toLowerCase())&&(city==='All cities'||e.venue.city===city)),[events,query,city]);
  const search=(value:string)=>{setQuery(value);const next=new URLSearchParams(params);if(value)next.set('q',value);else next.delete('q');setParams(next)};
  return <div className="page"><div className="section-head"><div><span className="eyebrow">Discover</span><h1 style={{fontSize:56}}>Events worth showing up for.</h1><p className="muted">Search real published experiences and choose your ticket before checkout.</p></div></div>
    <div className="category-row"><button className="active">All</button><button>Concerts</button><button>Comedy</button><button>Theatre</button><button>Festivals</button><button>Nightlife</button><button>Sports</button></div>
    <div className="search-bar"><input className="input" value={query} onChange={e=>search(e.target.value)} placeholder="Search events, artists, venues or cities" aria-label="Search events"/><select className="input" value={city} onChange={e=>setCity(e.target.value)} aria-label="Filter by city">{cities.map(c=><option key={c}>{c}</option>)}</select></div>
    {error&&<div className="notice error">{error}</div>}
    {!error&&filtered.length===0?<div className="card empty"><h2>{events.length?'No matching events':'No events live right now'}</h2><p className="muted">{events.length?'Try another search or city.':'Check back when organizers publish new experiences.'}</p></div>:<div className="grid">{filtered.map((event,i)=><Link key={event.id} to={`/events/${event.id}`} className="card event-card" style={{textDecoration:'none',color:'inherit'}}><div className="event-image" style={{backgroundImage:`url(${images[i%images.length]})`}}><span className="pill active" style={{position:'absolute',top:12,left:12,zIndex:1}}>{new Date(event.startAt).toLocaleDateString(undefined,{month:'short',day:'2-digit'})}</span></div><div className="event-body"><h2 style={{fontSize:20}}>{event.name}</h2><p>{event.venue.name}, {event.venue.city}</p><p className="muted">{new Date(event.startAt).toLocaleString()}</p><span className="muted" style={{fontSize:12}}>{event.ticketTypes.length} ticket option{event.ticketTypes.length!==1?'s':''}</span></div></Link>)}</div>}
  </div>;
}
