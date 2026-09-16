import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { apiErrorMessage } from '../lib/types';

type Order = {
  id: string;
  status: string;
  currency: string;
  subtotal: string | number;
  total: string | number;
  createdAt: string;
  items: Array<{
    id: string;
    quantity: number;
    unitPrice: string | number;
    lineTotal: string | number;
    event: { name: string; startAt: string; venue: { name: string; city: string } };
    ticketType: { name: string };
    tickets: Array<{ id: string; status: string }>;
  }>;
  payment?: { status: string } | null;
};

const money = (value: string | number, currency: string) => `${currency} ${Number(value).toFixed(2)}`;

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    void api.get('/orders')
      .then((response) => setOrders(response.data.data as Order[]))
      .catch((e) => setError(apiErrorMessage(e, 'Unable to load your orders.')));
  }, []);

  return <div className="page">
    <div className="section-head">
      <div><span className="eyebrow">Purchase history</span><h1 style={{ fontSize: 52 }}>Your orders.</h1><p className="muted">Every purchase, payment state and issued ticket in one place.</p></div>
      <Link className="btn ghost" to="/events">Explore events</Link>
    </div>
    {error && <div className="notice error">{error}</div>}
    {!error && orders.length === 0 ? <div className="card empty"><h2>No orders yet</h2><p className="muted">When you purchase tickets, your confirmed orders will appear here.</p><Link className="btn primary" to="/events">Find an event</Link></div> : <div style={{ display: 'grid', gap: 16 }}>
      {orders.map(order => <article className="card" key={order.id}>
        <div className="toolbar">
          <div><span className={`pill ${order.status === 'CONFIRMED' ? 'active' : order.status === 'FAILED' ? 'danger' : ''}`}>{order.status}</span><h2 style={{ margin: '10px 0 4px' }}>{order.items[0]?.event.name ?? 'TicketGuard order'}</h2><p className="muted" style={{ margin: 0 }}>{new Date(order.createdAt).toLocaleString()} · Order #{order.id.slice(0, 8)}</p></div>
          <strong style={{ fontSize: 22 }}>{money(order.total, order.currency)}</strong>
        </div>
        <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
          {order.items.map(item => <div key={item.id} className="checkout-line"><div><strong>{item.quantity} × {item.ticketType.name}</strong><span className="muted">{item.event.venue.name} · {item.event.venue.city} · {new Date(item.event.startAt).toLocaleString()}</span></div><strong>{money(item.lineTotal, order.currency)}</strong></div>)}
        </div>
        <div className="actions" style={{ marginTop: 18 }}>
          {order.items.flatMap(item => item.tickets).slice(0, 3).map(ticket => <Link className="btn ghost" key={ticket.id} to={`/tickets/${ticket.id}`}>Open ticket</Link>)}
          {order.items.flatMap(item => item.tickets).length > 3 && <span className="muted" style={{ alignSelf: 'center' }}>+{order.items.flatMap(item => item.tickets).length - 3} more tickets</span>}
        </div>
      </article>)}
    </div>}
  </div>;
}
