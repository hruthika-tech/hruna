/**
 * Customer saved items (designer/dress/collection/project) — list + toggle. Maps the frontend's
 * single generic `itemId` onto whichever of the four target columns customer_saved_items actually
 * uses for that item_type (see the CHECK constraint in
 * supabase/migrations/20260829180009_diary_and_saved_items.sql) — the frontend shape doesn't
 * change, only how it's stored.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminOwnedDesigner, requireCustomer } from "@/lib/supabase/authorization";
import { errorResponse } from "@/lib/supabase/errors";
import { mapSavedItem } from "@/lib/customer/data";
import type { TablesInsert } from "@/lib/supabase/types";
import { recordSave } from "@/lib/analytics/tracking";
import { isMissingSchemaObject } from "@/lib/supabase/schema-readiness";

export const dynamic = "force-dynamic";

type SavedItemType = "designer" | "dress" | "collection" | "project";
const TARGET_COLUMN: Record<SavedItemType, "designer_id" | "dress_id" | "collection_id" | "project_id"> = {
  designer: "designer_id",
  dress: "dress_id",
  collection: "collection_id",
  project: "project_id",
};

export async function GET() {
  try {
    const ctx = await requireCustomer();
    const supabase = createClient();

    const { data, error } = await supabase
      .from("customer_saved_items")
      .select("*")
      .eq("customer_id", ctx.customerId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json({ status: "ok", items: (data ?? []).map(mapSavedItem) });
  } catch (err) {
    return errorResponse(err, "api.savedItems.list");
  }
}

/** Toggles save state for one item — mirrors the existing toggleSavedItem mock behavior (save if
 *  not saved, unsave if already saved) in one call, since that's the only way the frontend uses it
 *  (a single heart-icon button, never separate save/unsave actions). */
export async function POST(request: Request) {
  try {
    const ctx = await requireCustomer();
    const body = await request.json().catch(() => null);
    const itemType = body?.itemType as SavedItemType | undefined;
    const itemId = typeof body?.itemId === "string" ? body.itemId : "";
    if (!itemType || !TARGET_COLUMN[itemType] || !itemId) {
      return NextResponse.json({ status: "error", message: "itemType and itemId are required." }, { status: 400 });
    }

    const column = TARGET_COLUMN[itemType];
    const supabase = createClient();

    // Designers, dresses and collections belonging to an admin-owned designer profile aren't
    // public, so they can't be saved either. The owning designer is also what a save is credited
    // to in that designer's analytics.
    let ownerDesignerId: string | null = null;
    if (itemType === "designer" || itemType === "dress" || itemType === "collection") {
      let designerId: string | null = itemId;
      if (itemType !== "designer") {
        const { data: item } = await supabase.from(itemType === "dress" ? "dresses" : "collections").select("designer_id").eq("id", itemId).maybeSingle();
        designerId = item?.designer_id ?? null;
      }
      if (designerId && (await isAdminOwnedDesigner(designerId))) {
        return NextResponse.json({ status: "error", message: "Item not found." }, { status: 404 });
      }
      ownerDesignerId = designerId;
    }

    const { data: existing, error: findError } = await supabase
      .from("customer_saved_items")
      .select("id")
      .eq("customer_id", ctx.customerId)
      .eq("item_type", itemType)
      .eq(column, itemId)
      .maybeSingle();
    if (findError) throw findError;

    if (existing) {
      const { error: deleteError } = await supabase.from("customer_saved_items").delete().eq("id", existing.id);
      if (deleteError) throw deleteError;
      return NextResponse.json({ status: "ok", saved: false });
    }

    const insert: TablesInsert<"customer_saved_items"> = {
      customer_id: ctx.customerId,
      item_type: itemType,
      [column]: itemId,
    };
    const { error: insertError } = await supabase.from("customer_saved_items").insert(insert);
    if (insertError) throw insertError;

    // Credit the save to the item's designer (lib/analytics/tracking.ts). Never allowed to fail the save.
    if (ownerDesignerId && itemType !== "project") {
      await recordSave({ ctx, itemType, itemId, designerId: ownerDesignerId }).catch((err) => {
        if (!isMissingSchemaObject(err)) console.error("[analytics] save not recorded", err instanceof Error ? err.message : err);
      });
    }

    return NextResponse.json({ status: "ok", saved: true });
  } catch (err) {
    return errorResponse(err, "api.savedItems.toggle");
  }
}
