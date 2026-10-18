-- A dress's stock status, set by its designer in Manage Studio (Add/Edit dress) and shown to customers.
--
-- Kept SEPARATE from dresses.available ("Available for purchase" — whether the dress is offered at
-- all): stock_status says HOW it's available — in stock now, made to order, or currently unavailable.
-- The customer pages combine the two (lib/dresses/availability.ts): a dress can only be ordered
-- (Contact Designer) when it's available for purchase AND not 'unavailable'.
--
-- Existing rows get 'in_stock' — exactly what the customer pages already showed for them; no other
-- column or row is changed. Ownership is unchanged: the existing dresses policies (anyone can read,
-- only the owning designer can write — dresses_all_owner) cover the new column too.

create type public.dress_stock_status as enum ('in_stock', 'made_to_order', 'unavailable');

alter table public.dresses
  add column stock_status public.dress_stock_status not null default 'in_stock';

comment on column public.dresses.stock_status is
  'Set by the owning designer: in_stock | made_to_order | unavailable. Separate from available (offered for purchase at all).';
