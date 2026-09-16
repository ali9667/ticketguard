import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FormEvent } from 'react';

import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  apiErrorMessage,
  type EventSummary,
} from '../lib/types';

type Scanner = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
};

type Assigned = {
  id: string;
  user: Scanner;
};

type ModalState =
  | {
      eventId: string;
      type: 'ticket';
    }
  | {
      eventId: string;
      type: 'scanner';
    }
  | null;

type EventForm = {
  name: string;
  description: string;
  startAt: string;
  endAt: string;
  timezone: string;
  capacity: number;
  venueName: string;
  address: string;
  city: string;
  country: string;
};

const initialForm: EventForm = {
  name: '',
  description: '',
  startAt: '',
  endAt: '',
  timezone: 'Asia/Kolkata',
  capacity: 100,
  venueName: '',
  address: '',
  city: '',
  country: 'India',
};

const initialTicket = {
  name: 'GENERAL',
  price: '499',
  quantity: '100',
};

export function Organizer() {
  const { auth } = useAuth();

  const [events, setEvents] = useState<EventSummary[]>([]);
  const [scanners, setScanners] = useState<Scanner[]>([]);
  const [assigned, setAssigned] = useState<
    Record<string, Assigned[]>
  >({});

  const [form, setForm] =
    useState<EventForm>(initialForm);

  const [ticket, setTicket] =
    useState(initialTicket);

  const [modal, setModal] =
    useState<ModalState>(null);

  const [scannerId, setScannerId] =
    useState('');

  const [message, setMessage] =
    useState('');

  const [messageType, setMessageType] =
    useState<'success' | 'error'>('success');

  const [busy, setBusy] =
    useState(false);

  const [actionId, setActionId] =
    useState<string | null>(null);

  const load = async () => {
    const [eventsResponse, scannersResponse] =
      await Promise.all([
        api.get('/events/mine/list'),
        api.get('/users/scanners'),
      ]);

    const loadedEvents =
      eventsResponse.data.data as EventSummary[];

    const loadedScanners =
      scannersResponse.data.data as Scanner[];

    setEvents(loadedEvents);
    setScanners(loadedScanners);

    const pairs = await Promise.all(
      loadedEvents.map(async (event) => {
        const response = await api.get(
          `/events/${event.id}/scanners`,
        );

        return [
          event.id,
          response.data.data as Assigned[],
        ] as const;
      }),
    );

    setAssigned(
      Object.fromEntries(pairs),
    );
  };

  useEffect(() => {
    if (!auth) {
      return;
    }

    void load().catch((error: unknown) => {
      setMessageType('error');
      setMessage(
        apiErrorMessage(
          error,
          'Unable to load organizer data.',
        ),
      );
    });
  }, [auth]);

  const showSuccess = (text: string) => {
    setMessageType('success');
    setMessage(text);
  };

  const showError = (error: unknown, fallback: string) => {
    setMessageType('error');
    setMessage(
      apiErrorMessage(error, fallback),
    );
  };

  const create = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    if (busy) {
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      const start = new Date(
        form.startAt,
      );

      const end = new Date(
        form.endAt,
      );

      if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime())
      ) {
        throw new Error(
          'Please provide valid event dates.',
        );
      }

      if (end <= start) {
        throw new Error(
          'Event end time must be after the start time.',
        );
      }

      if (form.capacity < 1) {
        throw new Error(
          'Capacity must be at least 1.',
        );
      }

      await api.post(
        '/events',
        {
          name: form.name.trim(),
          description:
            form.description.trim() || undefined,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          timezone: form.timezone.trim(),
          capacity: Number(form.capacity),
          venue: {
            name: form.venueName.trim(),
            address: form.address.trim(),
            city: form.city.trim(),
            country: form.country.trim(),
          },
        },
        {
          headers: {
            'Idempotency-Key':
              crypto.randomUUID(),
          },
        },
      );

      showSuccess('Event created successfully.');

      setForm(initialForm);

      await load();
    } catch (error: unknown) {
      showError(
        error,
        'Could not create event.',
      );
    } finally {
      setBusy(false);
    }
  };

  const publish = async (
    eventId: string,
  ) => {
    if (actionId) {
      return;
    }

    setActionId(eventId);
    setMessage('');

    try {
      await api.post(
        `/events/${eventId}/publish`,
        {},
        {
          headers: {
            'Idempotency-Key':
              crypto.randomUUID(),
          },
        },
      );

      showSuccess(
        'Event published successfully.',
      );

      await load();
    } catch (error: unknown) {
      showError(
        error,
        'Could not publish event.',
      );
    } finally {
      setActionId(null);
    }
  };

  const cancel = async (
    eventId: string,
  ) => {
    if (actionId) {
      return;
    }

    const confirmed = window.confirm(
      'Cancel this event? Existing tickets will be cancelled.',
    );

    if (!confirmed) {
      return;
    }

    setActionId(eventId);
    setMessage('');

    try {
      await api.post(
        `/events/${eventId}/cancel`,
        {},
        {
          headers: {
            'Idempotency-Key':
              crypto.randomUUID(),
          },
        },
      );

      showSuccess(
        'Event cancelled successfully.',
      );

      await load();
    } catch (error: unknown) {
      showError(
        error,
        'Could not cancel event.',
      );
    } finally {
      setActionId(null);
    }
  };

  const addTicket = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    if (!modal || modal.type !== 'ticket') {
      return;
    }

    if (actionId) {
      return;
    }

    setActionId(modal.eventId);
    setMessage('');

    try {
      const price = Number(
        ticket.price,
      );

      const quantity = Number(
        ticket.quantity,
      );

      if (
        !ticket.name.trim() ||
        !Number.isFinite(price) ||
        price < 0
      ) {
        throw new Error(
          'Please enter a valid ticket name and price.',
        );
      }

      if (
        !Number.isInteger(quantity) ||
        quantity < 1
      ) {
        throw new Error(
          'Ticket quantity must be at least 1.',
        );
      }

      await api.post(
        `/events/${modal.eventId}/ticket-types`,
        {
          name: ticket.name.trim(),
          price,
          quantity,
          currency: 'INR',
        },
        {
          headers: {
            'Idempotency-Key':
              crypto.randomUUID(),
          },
        },
      );

      showSuccess(
        'Ticket type added successfully.',
      );

      setTicket(initialTicket);
      setModal(null);

      await load();
    } catch (error: unknown) {
      showError(
        error,
        'Could not add ticket type.',
      );
    } finally {
      setActionId(null);
    }
  };

  const assign = async (
    event: FormEvent,
  ) => {
    event.preventDefault();

    if (!modal || modal.type !== 'scanner') {
      return;
    }

    if (!scannerId || actionId) {
      return;
    }

    setActionId(modal.eventId);
    setMessage('');

    try {
      await api.post(
        `/events/${modal.eventId}/scanners`,
        {
          scannerId,
        },
        {
          headers: {
            'Idempotency-Key':
              crypto.randomUUID(),
          },
        },
      );

      showSuccess(
        'Scanner assigned successfully.',
      );

      setScannerId('');
      setModal(null);

      await load();
    } catch (error: unknown) {
      showError(
        error,
        'Could not assign scanner.',
      );
    } finally {
      setActionId(null);
    }
  };

  const remove = async (
    eventId: string,
    userId: string,
  ) => {
    if (actionId) {
      return;
    }

    setActionId(userId);
    setMessage('');

    try {
      await api.delete(
        `/events/${eventId}/scanners/${userId}`,
        {
          headers: {
            'Idempotency-Key':
              crypto.randomUUID(),
          },
        },
      );

      showSuccess(
        'Scanner removed successfully.',
      );

      await load();
    } catch (error: unknown) {
      showError(
        error,
        'Could not remove scanner.',
      );
    } finally {
      setActionId(null);
    }
  };

  const issue = async (
    eventId: string,
    ticketTypeId: string,
  ) => {
    if (!auth || actionId) {
      return;
    }

    setActionId(ticketTypeId);
    setMessage('');

    try {
      await api.post(
        `/events/${eventId}/tickets`,
        {
          ticketTypeId,
          ownerId: auth.userId,
          quantity: 1,
        },
        {
          headers: {
            'Idempotency-Key':
              crypto.randomUUID(),
          },
        },
      );

      showSuccess(
        'Ticket issued to your account.',
      );

      await load();
    } catch (error: unknown) {
      showError(
        error,
        'Could not issue ticket.',
      );
    } finally {
      setActionId(null);
    }
  };

  const closeModal = () => {
    if (actionId) {
      return;
    }

    setModal(null);
    setScannerId('');
    setTicket(initialTicket);
  };

  return (
    <div className="page">
      {/* HEADER */}
      <div className="toolbar">
        <div>
          <span className="eyebrow">
            Control center
          </span>

          <h1 style={{ fontSize: 52 }}>
            Organizer workspace
          </h1>

          <p className="muted">
            Create experiences, control inventory
            and decide who can validate entry.
          </p>
        </div>

        <Link
          className="btn ghost"
          to="/events"
        >
          View public events
        </Link>
      </div>

      {/* GLOBAL MESSAGE */}
      {message && (
        <div
          className={`notice ${
            messageType === 'error'
              ? 'error'
              : 'success'
          }`}
          style={{ marginBottom: 20 }}
        >
          {message}
        </div>
      )}

      {/* CREATE EVENT */}
      <section className="card">
        <h2>Create an event</h2>

        <form
          onSubmit={create}
          className="form-grid"
        >
          <div className="field">
            <label htmlFor="event-name">
              Event name
            </label>

            <input
              id="event-name"
              className="input"
              value={form.name}
              onChange={(event) =>
                setForm({
                  ...form,
                  name: event.target.value,
                })
              }
              required
            />
          </div>

          <div className="field">
            <label htmlFor="venue-name">
              Venue
            </label>

            <input
              id="venue-name"
              className="input"
              value={form.venueName}
              onChange={(event) =>
                setForm({
                  ...form,
                  venueName:
                    event.target.value,
                })
              }
              required
            />
          </div>

          <div className="field">
            <label htmlFor="address">
              Address
            </label>

            <input
              id="address"
              className="input"
              value={form.address}
              onChange={(event) =>
                setForm({
                  ...form,
                  address:
                    event.target.value,
                })
              }
              required
            />
          </div>

          <div className="field">
            <label htmlFor="city">
              City
            </label>

            <input
              id="city"
              className="input"
              value={form.city}
              onChange={(event) =>
                setForm({
                  ...form,
                  city: event.target.value,
                })
              }
              required
            />
          </div>

          <div className="field">
            <label htmlFor="start-at">
              Starts
            </label>

            <input
              id="start-at"
              className="input"
              type="datetime-local"
              value={form.startAt}
              onChange={(event) =>
                setForm({
                  ...form,
                  startAt:
                    event.target.value,
                })
              }
              required
            />
          </div>

          <div className="field">
            <label htmlFor="end-at">
              Ends
            </label>

            <input
              id="end-at"
              className="input"
              type="datetime-local"
              value={form.endAt}
              onChange={(event) =>
                setForm({
                  ...form,
                  endAt:
                    event.target.value,
                })
              }
              required
            />
          </div>

          <div className="field">
            <label htmlFor="capacity">
              Capacity
            </label>

            <input
              id="capacity"
              className="input"
              type="number"
              min="1"
              value={form.capacity}
              onChange={(event) =>
                setForm({
                  ...form,
                  capacity:
                    Number(
                      event.target.value,
                    ),
                })
              }
              required
            />
          </div>

          <div className="field">
            <label htmlFor="timezone">
              Timezone
            </label>

            <input
              id="timezone"
              className="input"
              value={form.timezone}
              onChange={(event) =>
                setForm({
                  ...form,
                  timezone:
                    event.target.value,
                })
              }
              required
            />
          </div>

          <div className="field full">
            <label htmlFor="description">
              Description
            </label>

            <textarea
              id="description"
              className="input"
              rows={3}
              value={form.description}
              onChange={(event) =>
                setForm({
                  ...form,
                  description:
                    event.target.value,
                })
              }
            />
          </div>

          <div>
            <button
              type="submit"
              className="btn primary"
              disabled={busy}
            >
              {busy
                ? 'Creating…'
                : 'Create event'}
            </button>
          </div>
        </form>
      </section>

      {/* EVENTS */}
      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">
              Your inventory
            </span>

            <h2>Events</h2>
          </div>
        </div>

        {events.length === 0 ? (
          <div className="card empty">
            No events yet.
          </div>
        ) : (
          <div className="grid">
            {events.map((event) => {
              const eventScanners =
                assigned[event.id] || [];

              const publishing =
                actionId === event.id;

              return (
                <article
                  className="card"
                  key={event.id}
                >
                  {/* EVENT HEADER */}
                  <div className="toolbar">
                    <span
                      className={`pill ${
                        event.status ===
                        'PUBLISHED'
                          ? 'active'
                          : ''
                      }`}
                    >
                      {event.status}
                    </span>

                    <span className="muted">
                      Capacity{' '}
                      {event.capacity}
                    </span>
                  </div>

                  <h2
                    style={{
                      marginTop: 14,
                    }}
                  >
                    {event.name}
                  </h2>

                  <p className="muted">
                    {new Date(
                      event.startAt,
                    ).toLocaleString()}{' '}
                    · {event.venue.name}
                  </p>

                  {/* DRAFT ACTIONS */}
                  {event.status ===
                    'DRAFT' && (
                    <div className="actions">
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() =>
                          setModal({
                            eventId: event.id,
                            type: 'ticket',
                          })
                        }
                        disabled={
                          Boolean(actionId)
                        }
                      >
                        Add ticket type
                      </button>

                      <button
                        type="button"
                        className="btn accent"
                        onClick={() =>
                          void publish(
                            event.id,
                          )
                        }
                        disabled={
                          Boolean(actionId)
                        }
                      >
                        {publishing
                          ? 'Publishing…'
                          : 'Publish'}
                      </button>
                    </div>
                  )}

                  {/* TICKET TYPES */}
                  <div
                    style={{
                      marginTop: 18,
                    }}
                  >
                    <strong>
                      Ticket types
                    </strong>

                    {event.ticketTypes
                      .length === 0 ? (
                      <p className="muted">
                        No ticket types
                        configured.
                      </p>
                    ) : (
                      event.ticketTypes.map(
                        (type) => {
                          const issuing =
                            actionId ===
                            type.id;

                          return (
                            <div
                              key={type.id}
                              style={{
                                display:
                                  'flex',
                                justifyContent:
                                  'space-between',
                                alignItems:
                                  'center',
                                gap: 8,
                                padding:
                                  '10px 0',
                                borderBottom:
                                  '1px solid var(--line)',
                              }}
                            >
                              <span>
                                {type.name}
                                <br />

                                <small className="muted">
                                  {type.currency}{' '}
                                  {type.price}{' '}
                                  ·{' '}
                                  {
                                    type.soldCount
                                  }
                                  /
                                  {
                                    type.quantity
                                  }
                                </small>
                              </span>

                              {event.status ===
                                'PUBLISHED' && (
                                <button
                                  type="button"
                                  className="btn ghost"
                                  onClick={() =>
                                    void issue(
                                      event.id,
                                      type.id,
                                    )
                                  }
                                  disabled={
                                    Boolean(
                                      actionId,
                                    )
                                  }
                                >
                                  {issuing
                                    ? 'Issuing…'
                                    : 'Issue to me'}
                                </button>
                              )}
                            </div>
                          );
                        },
                      )
                    )}
                  </div>

                  {/* SCANNERS */}
                  <div
                    style={{
                      marginTop: 18,
                    }}
                  >
                    <div className="toolbar">
                      <strong>
                        Authorized scanners
                      </strong>

                      {event.status !==
                        'CANCELLED' && (
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() =>
                            setModal({
                              eventId:
                                event.id,
                              type: 'scanner',
                            })
                          }
                          disabled={
                            Boolean(
                              actionId,
                            )
                          }
                        >
                          + Assign
                        </button>
                      )}
                    </div>

                    {eventScanners.length ===
                    0 ? (
                      <p className="muted">
                        No scanners assigned.
                      </p>
                    ) : (
                      eventScanners.map(
                        (assignment) => {
                          const removing =
                            actionId ===
                            assignment.user
                              .id;

                          return (
                            <div
                              key={
                                assignment.id
                              }
                              style={{
                                display:
                                  'flex',
                                justifyContent:
                                  'space-between',
                                alignItems:
                                  'center',
                                gap: 10,
                                padding:
                                  '9px 0',
                              }}
                            >
                              <span>
                                {
                                  assignment
                                    .user
                                    .firstName
                                }{' '}
                                {
                                  assignment
                                    .user
                                    .lastName
                                }

                                <br />

                                <small className="muted">
                                  {
                                    assignment
                                      .user
                                      .email
                                  }
                                </small>
                              </span>

                              <button
                                type="button"
                                className="btn danger"
                                onClick={() =>
                                  void remove(
                                    event.id,
                                    assignment
                                      .user
                                      .id,
                                  )
                                }
                                disabled={
                                  Boolean(
                                    actionId,
                                  )
                                }
                              >
                                {removing
                                  ? 'Removing…'
                                  : 'Remove'}
                              </button>
                            </div>
                          );
                        },
                      )
                    )}
                  </div>

                  {/* CANCEL */}
                  {event.status !==
                    'CANCELLED' && (
                    <button
                      type="button"
                      className="btn danger"
                      style={{
                        marginTop: 15,
                      }}
                      onClick={() =>
                        void cancel(
                          event.id,
                        )
                      }
                      disabled={
                        Boolean(actionId)
                      }
                    >
                      {actionId === event.id
                        ? 'Cancelling…'
                        : 'Cancel event'}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* MODAL */}
      {modal && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeModal();
            }
          }}
        >
          <div className="modal">
            {/* TICKET MODAL */}
            {modal.type ===
            'ticket' ? (
              <>
                <h2>
                  Add ticket type
                </h2>

                <form
                  onSubmit={addTicket}
                  className="form-grid"
                >
                  <div className="field full">
                    <label htmlFor="ticket-name">
                      Name
                    </label>

                    <input
                      id="ticket-name"
                      className="input"
                      value={
                        ticket.name
                      }
                      onChange={(
                        event,
                      ) =>
                        setTicket({
                          ...ticket,
                          name:
                            event.target
                              .value,
                        })
                      }
                      required
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="ticket-price">
                      Price (INR)
                    </label>

                    <input
                      id="ticket-price"
                      className="input"
                      type="number"
                      min="0"
                      value={
                        ticket.price
                      }
                      onChange={(
                        event,
                      ) =>
                        setTicket({
                          ...ticket,
                          price:
                            event.target
                              .value,
                        })
                      }
                      required
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="ticket-quantity">
                      Quantity
                    </label>

                    <input
                      id="ticket-quantity"
                      className="input"
                      type="number"
                      min="1"
                      value={
                        ticket.quantity
                      }
                      onChange={(
                        event,
                      ) =>
                        setTicket({
                          ...ticket,
                          quantity:
                            event.target
                              .value,
                        })
                      }
                      required
                    />
                  </div>

                  <div className="actions">
                    <button
                      type="submit"
                      className="btn primary"
                      disabled={
                        Boolean(
                          actionId,
                        )
                      }
                    >
                      {actionId
                        ? 'Creating…'
                        : 'Create ticket type'}
                    </button>

                    <button
                      type="button"
                      className="btn ghost"
                      onClick={
                        closeModal
                      }
                      disabled={
                        Boolean(
                          actionId,
                        )
                      }
                    >
                      Close
                    </button>
                  </div>
                </form>
              </>
            ) : (
              /* SCANNER MODAL */
              <>
                <h2>
                  Assign scanner
                </h2>

                <p className="muted">
                  Only active SCANNER
                  accounts can validate
                  this event.
                </p>

                <form
                  onSubmit={assign}
                >
                  <select
                    className="input"
                    value={scannerId}
                    onChange={(event) =>
                      setScannerId(
                        event.target
                          .value,
                      )
                    }
                    required
                  >
                    <option value="">
                      Choose scanner
                    </option>

                    {scanners
                      .filter(
                        (scanner) =>
                          !(
                            assigned[
                              modal
                                .eventId
                            ] || []
                          ).some(
                            (
                              assignment,
                            ) =>
                              assignment
                                .user
                                .id ===
                              scanner.id,
                          ),
                      )
                      .map((scanner) => (
                        <option
                          key={
                            scanner.id
                          }
                          value={
                            scanner.id
                          }
                        >
                          {
                            scanner.firstName
                          }{' '}
                          {
                            scanner.lastName
                          }{' '}
                          ·{' '}
                          {
                            scanner.email
                          }
                        </option>
                      ))}
                  </select>

                  <div className="actions">
                    <button
                      type="submit"
                      className="btn primary"
                      disabled={
                        !scannerId ||
                        Boolean(
                          actionId,
                        )
                      }
                    >
                      {actionId
                        ? 'Assigning…'
                        : 'Assign scanner'}
                    </button>

                    <button
                      type="button"
                      className="btn ghost"
                      onClick={
                        closeModal
                      }
                      disabled={
                        Boolean(
                          actionId,
                        )
                      }
                    >
                      Close
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}