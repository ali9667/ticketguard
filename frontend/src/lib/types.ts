export type ApiErrorLike = { response?: { data?: { error?: { message?: string } } } };
export const apiErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as ApiErrorLike;
    return candidate.response?.data?.error?.message ?? fallback;
  }
  return fallback;
};

export type EventSummary = {
  id: string; name: string; startAt: string; status: string; capacity: number;
  venue: { name: string; city: string };
  ticketTypes: Array<{ id: string; name: string; currency: string; price: string | number; quantity: number; soldCount: number; status: string }>;
};
export type TicketSummary = { id: string; status: string; event: { name: string; startAt: string; venue: { name: string } }; ticketType: { name: string } };
export type TransferSummary = { id: string; status: string; expiresAt: string; ticket: { event: { name: string }; ticketType: { name: string } }; initiator: { firstName: string; lastName: string }; recipient: { firstName: string; lastName: string } };
