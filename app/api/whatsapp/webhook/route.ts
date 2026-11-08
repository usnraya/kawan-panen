import { NextResponse } from "next/server";

/**
 * Stub only. Production wiring would verify the WhatsApp Business Cloud API
 * webhook challenge/signature, normalize inbound messages, then dispatch to
 * authenticated farmer actions. This demo never calls an external WhatsApp API.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN && challenge) {
    return new Response(challenge, { status: 200 });
  }
  return NextResponse.json({ error: "Webhook verifikasi tidak valid." }, { status: 403 });
}

export async function POST() {
  return NextResponse.json({ ok: true, simulated: true, message: "Webhook WhatsApp simulasi diterima." });
}
