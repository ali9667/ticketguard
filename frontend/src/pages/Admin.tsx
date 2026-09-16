import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type User = { id: string; email: string; firstName: string; lastName: string; role: string; status: 'ACTIVE'|'SUSPENDED'|'DELETED'; createdAt: string };
type Audit = { id: string; action: string; resourceType: string; resourceId: string|null; requestId: string; createdAt: string };
type Security = { id: string; type: string; severity: string; requestId: string; createdAt: string };

export function Admin() {
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<Audit[]>([]);
  const [security, setSecurity] = useState<Security[]>([]);
  const [message, setMessage] = useState('');

  const load = async () => {
    const [u, l, s] = await Promise.all([api.get('/admin/users?limit=50'), api.get('/admin/audit-logs?limit=50'), api.get('/admin/security-events?limit=50')]);
    setUsers(u.data.data.data); setLogs(l.data.data.data); setSecurity(s.data.data.data);
  };
  useEffect(() => { void load().catch(() => setMessage('Unable to load admin data.')); }, []);

  const setStatus = async (id: string, status: 'ACTIVE'|'SUSPENDED') => {
    try { await api.patch(`/admin/users/${id}/status`, { status }, { headers: { 'Idempotency-Key': crypto.randomUUID() } }); setMessage(`User ${status.toLowerCase()}.`); await load(); }
    catch (e: unknown) { const error = e as { response?: { data?: { error?: { message?: string } } } }; setMessage(error.response?.data?.error?.message ?? 'Unable to update user.'); }
  };

  return <div className="page">
    <h1>Administration</h1><p className="muted">Platform controls are audited and authorization is enforced server-side.</p>
    {message && <p>{message}</p>}
    <section className="card"><h2>Users</h2>{users.map(user => <div key={user.id} style={{display:'flex',justifyContent:'space-between',gap:16,padding:'12px 0',borderBottom:'1px solid #eee'}}><span><strong>{user.email}</strong><br/><span className="muted">{user.role} · {user.status}</span></span>{user.status !== 'DELETED' && <span>{user.status === 'ACTIVE' ? <button onClick={() => void setStatus(user.id,'SUSPENDED')}>Suspend</button> : <button className="primary" onClick={() => void setStatus(user.id,'ACTIVE')}>Activate</button>}</span>}</div>)}</section>
    <section className="card"><h2>Audit log</h2>{logs.map(log => <p key={log.id}><strong>{log.action}</strong> · {log.resourceType} · {new Date(log.createdAt).toLocaleString()}<br/><span className="muted">request {log.requestId}</span></p>)}</section>
    <section className="card"><h2>Security events</h2>{security.map(event => <p key={event.id}><strong>{event.severity}</strong> · {event.type} · {new Date(event.createdAt).toLocaleString()}</p>)}</section>
  </div>;
}
