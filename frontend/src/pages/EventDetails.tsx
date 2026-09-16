import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { apiErrorMessage } from '../lib/types';
import { useAuth } from '../lib/auth';

type E={id:string;name:string;description?:string|null;startAt:string;endAt:string;timezone:string;capacity:number;status:string;venue:{name:string;address:string;city:string;country:string};ticketTypes:Array<{id:string;name:string;price:string|number;currency:string;quantity:number;soldCount:number;status:string}>};
const heroImages=['https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1800&q=85','https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1800&q=85','https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1800&q=85'];

export function EventDetails(){
  const{id}=useParams(); const navigate=useNavigate(); const {auth}=useAuth(); const[event,setEvent]=useState<E|null>(null); const[error,setError]=useState(''); const[quantities,setQuantities]=useState<Record<string,number>>({});
  useEffect(()=>{if(id)void api.get(`/events/${id}`).then(r=>setEvent(r.data.data)).catch(e=>setError(apiErrorMessage(e,'Unable to load event.')))},[id]);
  const image=useMemo(()=>heroImages[(id?.charCodeAt(0)??0)%heroImages.length],[id]);
  const selected=event?.ticketTypes.filter(t=>(quantities[t.id]??0)>0).map(t=>({ticketTypeId:t.id,name:t.name,price:Number(t.price),currency:t.currency,quantity:quantities[t.id]}))??[];
  const total=selected.reduce((s,i)=>s+i.price*i.quantity,0);
  const update=(ticketTypeId:string,delta:number,max:number)=>setQuantities(q=>({...q,[ticketTypeId]:Math.max(0,Math.min(max,(q[ticketTypeId]??0)+delta))}));
  const checkout=()=>{if(!auth){navigate('/login',{state:{from:`/events/${id}`}});return;} if(selected.length)navigate('/checkout',{state:{eventName:event?.name??'',items:selected}})};
  if(error)return <div className="page"><div className="card"><h2>Event unavailable</h2><p className="danger">{error}</p><Link className="btn ghost" to="/events">Back to events</Link></div></div>;
  if(!event)return <div className="page">Loading event…</div>;
  return <div className="page event-detail-page">
    <section className="event-hero-image" style={{backgroundImage:`linear-gradient(90deg,rgba(5,7,10,.9) 0%,rgba(5,7,10,.38) 52%,rgba(5,7,10,.1) 100%),url(${image})`}}><div><span className="event-kicker">LIVE EXPERIENCE</span><h1>{event.name}</h1><p>{new Date(event.startAt).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'})} · {new Date(event.startAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</p><p>{event.venue.name} · {event.venue.city}</p></div></section>
    <div className="event-detail-grid"><main><div className="event-facts"><div><span className="muted">DATE</span><strong>{new Date(event.startAt).toLocaleDateString()}</strong></div><div><span className="muted">VENUE</span><strong>{event.venue.name}</strong></div><div><span className="muted">LOCATION</span><strong>{event.venue.city}</strong></div></div><section className="detail-copy"><span className="eyebrow">About the event</span><h2>{event.name}</h2><p>{event.description||'An experience powered by TicketGuard. Your ticket is issued with a secure credential and verified at entry.'}</p></section></main>
    <aside className="ticket-selector card"><span className="eyebrow">Tickets</span><h2>Choose your tickets</h2>{event.ticketTypes.filter(t=>t.status==='ACTIVE').map(t=>{const available=Math.max(0,t.quantity-t.soldCount);const qty=quantities[t.id]??0;return <div className="ticket-choice" key={t.id}><div><strong>{t.name}</strong><span className="muted">{available} available</span></div><div className="ticket-choice-right"><strong>{t.currency} {Number(t.price).toFixed(2)}</strong><div className="qty"><button type="button" onClick={()=>update(t.id,-1,available)} disabled={!qty}>−</button><span>{qty}</span><button type="button" onClick={()=>update(t.id,1,Math.min(10,available))} disabled={qty>=Math.min(10,available)}>+</button></div></div></div>})}<div className="selector-total"><span>Total</span><strong>{event.ticketTypes[0]?.currency??'INR'} {total.toFixed(2)}</strong></div><button className="btn primary wide" type="button" disabled={!selected.length} onClick={checkout}>{auth?'Continue to checkout':'Sign in to continue'}</button><p className="muted tiny">Tickets are issued after payment confirmation.</p></aside></div>
  </div>;
}
