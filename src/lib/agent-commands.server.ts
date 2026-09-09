import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/types";

type Admin = SupabaseClient<Database>;
type Result = {
  command_id: string;
  status: "succeeded" | "failed" | "timeout";
  output?: string | null;
  failed_reason?: string | null;
};

export async function recordCommandResult(db: Admin, endpointId: string, result: Result) {
  const { data: command, error } = await db
    .from("endpoint_commands")
    .select("status, expires_at, output, failed_reason")
    .eq("id", result.command_id)
    .eq("endpoint_id", endpointId)
    .maybeSingle();
  if (error) return { status: 500, error: "db_error" };
  if (!command) return { status: 404, error: "command_not_found" };

  // Retries acknowledge the original result without changing its audit timestamp.
  if (
    command.status === result.status &&
    command.output === (result.output ?? null) &&
    command.failed_reason === (result.failed_reason ?? null)
  ) {
    return { status: 200 };
  }
  if (command.status !== "sent") return { status: 409, error: "command_not_sent" };

  const now = new Date().toISOString();
  const expired = command.expires_at !== null && Date.parse(command.expires_at) <= Date.parse(now);
  const { data: updated, error: updateError } = await db
    .from("endpoint_commands")
    .update(
      expired
        ? {
            status: "expired",
            failed_reason: "result_after_expiration",
            completed_at: now,
          }
        : {
            status: result.status,
            output: result.output ?? null,
            failed_reason: result.failed_reason ?? null,
            completed_at: now,
          },
    )
    .eq("id", result.command_id)
    .eq("endpoint_id", endpointId)
    .eq("status", "sent")
    .select("id")
    .maybeSingle();
  if (updateError) return { status: 500, error: "update_failed" };
  if (!updated) return { status: 409, error: "command_state_changed" };
  return expired ? { status: 410, error: "expired" } : { status: 200 };
}

export async function claimPendingCommands(db: Admin, endpointId: string) {
  const columns =
    "id, command, params, created_at, timeout_seconds, signature, expires_at" as const;
  const { data: pending, error } = await db
    .from("endpoint_commands")
    .select(columns)
    .eq("endpoint_id", endpointId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(10);
  if (error) throw new Error("command_read_failed");

  const now = new Date().toISOString();
  const expired = (pending ?? []).filter(
    (c) => c.expires_at !== null && Date.parse(c.expires_at) <= Date.parse(now),
  );
  const sendable = (pending ?? []).filter(
    (c) => c.expires_at === null || Date.parse(c.expires_at) > Date.parse(now),
  );
  if (expired.length) {
    const { error: expireError } = await db
      .from("endpoint_commands")
      .update({ status: "expired", failed_reason: "expired_before_pickup", completed_at: now })
      .eq("endpoint_id", endpointId)
      .eq("status", "pending")
      .in(
        "id",
        expired.map((c) => c.id),
      );
    if (expireError) throw new Error("command_expiration_failed");
  }
  if (!sendable.length) return [];

  // Conditional UPDATE claims each command once, even for concurrent heartbeats.
  const { data: claimed, error: claimError } = await db
    .from("endpoint_commands")
    .update({ status: "sent", sent_at: now, attempted_at: now })
    .eq("endpoint_id", endpointId)
    .eq("status", "pending")
    .in(
      "id",
      sendable.map((c) => c.id),
    )
    .select(columns);
  if (claimError) throw new Error("command_claim_failed");
  const claimedIds = new Set((claimed ?? []).map((c) => c.id));
  return sendable.filter((c) => claimedIds.has(c.id));
}
