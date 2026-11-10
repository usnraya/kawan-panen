import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

type EventPayload = Record<string, unknown>;

export type EventInput = {
  requestId: string | null;
  type: string;
  payload?: EventPayload;
};

export async function appendEvent(input: EventInput, admin = createAdminClient()) {
  const { error } = await admin.from("events").insert({
    request_id: input.requestId,
    type: input.type,
    payload: input.payload ?? {},
  });
  if (error) throw error;
}
