import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { apiErrorMessage } from '../lib/types';

type CheckoutItem = { ticketTypeId: string; name: string; price: number; currency: string; quantity: number };
type State = { eventName: string; items: CheckoutItem[] };

export function Checkout() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as State | null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const total = useMemo(() => state?.items.reduce((sum, item) => sum + item.price * item.quantity, 0) ?? 0, [state]);

  if (!state || state.items.length === 0) return <div className="page"><div className="card empty"><h1>Checkout unavailable</h1><p className="muted">Choose tickets from an event before opening checkout.</p><Link className="btn primary" to="/events">Browse events</Link></div></div>;

  const pay = async () => {
    setBusy(true); setError('');
    try {
      const order = await api.post('/orders/checkout', { items: state.items.map(({ ticketTypeId, quantity }) => ({ ticketTypeId, quantity })) }, { headers: { 'Idempotency-Key': crypto.randomUUID() } });
      const orderId = order.data.data.id as string;
      await api.post(`/orders/${orderId}/pay`, {}, { headers: { 'Idempotency-Key': crypto.randomUUID() } });
      navigate('/tickets', { replace: true, state: { purchased: true, orderId } });
    } catch (e) { setError(apiErrorMessage(e, 'We could not complete this purchase. Your ticket was not issued.')); }
    finally { setBusy(false); }
  };

  return <div className="page checkout-page">
    <div className="checkout-head"><div><span className="eyebrow">Secure checkout</span><h1>Complete your booking.</h1><p className="muted">{state.eventName}</p></div><Link className="btn ghost" to="/events">Back</Link></div>
    <div className="checkout-layout">
      <section className="card checkout-main"><h2>Your tickets</h2>{state.items.map(item => <div className="checkout-line" key={item.ticketTypeId}><div><strong>{item.name}</strong><span className="muted">{item.quantity} × {item.currency} {item.price.toFixed(2)}</span></div><strong>{item.currency} {(item.price * item.quantity).toFixed(2)}</strong></div>)}<div className="security-strip"><span>✓</span><div><strong>TicketGuard protected checkout</strong><p className="muted">Your ticket is created only after successful payment confirmation.</p></div></div></section>
      <aside className="card checkout-summary"><span className="eyebrow">Order summary</span><div className="summary-total"><span>Total</span><strong>{state.items[0].currency} {total.toFixed(2)}</strong></div>{error&&<div className="notice error">{error}</div>}<button className="btn primary wide" type="button" disabled={busy} onClick={() => void pay()}>{busy ? 'Processing…' : `Pay ${state.items[0].currency} ${total.toFixed(2)}`}</button><p className="muted tiny">Sandbox payment for this project. No real money is charged.</p></aside>
    </div>
  </div>;
}
