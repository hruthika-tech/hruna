// Which fashion-request statuses are still open to designers' proposals.
//
// A public request is created 'submitted'; the first proposal moves it to 'proposal_received'
// (mark_request_proposal_received — that status exists for the customer's "Proposal Received" tab).
// Both mean the customer is still weighing proposals, so the request must stay discoverable to every
// other eligible designer. It closes only when the customer accepts a proposal: accept_proposal()
// moves it to 'accepted', auto-declines the other proposals and creates the one project (the database
// also guarantees one accepted proposal and one project per request). Isomorphic, no side effects.

export const OPEN_REQUEST_STATUSES = ["submitted", "proposal_received"] as const;

export function isRequestOpenForProposals(status: string | null | undefined): boolean {
  return (OPEN_REQUEST_STATUSES as readonly string[]).includes(status ?? "");
}

export const REQUEST_CLOSED_MESSAGE = "This request is no longer accepting proposals — the customer has already chosen a designer.";
