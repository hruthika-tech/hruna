import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Db = SupabaseClient<Database>;

/**
 * Account summaries for the admin User Reports pages — read with the ADMIN's own client (the
 * users/customer_profiles/designer_profiles admin RLS allows it; no service role). Links point to the
 * existing admin customer/designer pages, which hold the existing suspend actions.
 */
export interface AccountSummary {
  userId: string;
  email: string | null;
  name: string;
  isAdmin: boolean;
  customer: { id: string; name: string; status: string } | null;
  designer: { id: string; studioName: string; overallStatus: string | null } | null;
}

export async function accountSummaries(supabase: Db, userIds: string[]): Promise<Map<string, AccountSummary>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const out = new Map<string, AccountSummary>();
  if (ids.length === 0) return out;
  const [{ data: users }, { data: customers }, { data: designers }] = await Promise.all([
    supabase.from("users").select("id, email, display_name, is_admin").in("id", ids),
    supabase.from("customer_profiles").select("id, user_id, name, status").in("user_id", ids),
    supabase.from("designer_profiles").select("id, user_id, studio_name").in("user_id", ids),
  ]);
  const designerIds = (designers ?? []).map((d) => d.id);
  const { data: verifications } = designerIds.length
    ? await supabase.from("designer_verifications").select("designer_id, overall_status").in("designer_id", designerIds)
    : { data: [] as { designer_id: string; overall_status: string }[] };
  const statusByDesigner = new Map((verifications ?? []).map((v) => [v.designer_id, v.overall_status]));
  for (const id of ids) {
    const u = (users ?? []).find((x) => x.id === id);
    const c = (customers ?? []).find((x) => x.user_id === id);
    const d = (designers ?? []).find((x) => x.user_id === id);
    out.set(id, {
      userId: id,
      email: (u?.email as string | undefined) ?? null,
      name: d?.studio_name || c?.name || u?.display_name || "Unnamed account",
      isAdmin: !!u?.is_admin,
      customer: c ? { id: c.id, name: c.name, status: c.status } : null,
      designer: d ? { id: d.id, studioName: d.studio_name, overallStatus: statusByDesigner.get(d.id) ?? null } : null,
    });
  }
  return out;
}
