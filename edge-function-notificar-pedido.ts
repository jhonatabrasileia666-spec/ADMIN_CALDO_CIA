// =====================================================================
//  Edge Function: notificar-pedido
//  Supabase Dashboard > Edge Functions > Create function > nome: notificar-pedido
//  Cole este codigo e clique em Deploy.
//
//  Secrets necessarios (Dashboard > Edge Functions > Secrets):
//    VAPID_PUBLIC_KEY  = BK4uQwVhQpRDiOYWH4RMpFP0g3Peqp4JDw8W1_sqazKiNhoo8Fh1onS6ZSCGNNiKLsghD5ogoGWd_nMAsrnvleM
//    VAPID_PRIVATE_KEY = W5hSrhGl6f18_qDTrM_n8tkiGbMiuh_KHJ-knnAP9eI
//    VAPID_SUBJECT     = mailto:seu@email.com
//  (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ja existem automaticamente)
// =====================================================================
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@exemplo.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  const pedido = await req.json().catch(() => ({}));
  const total = Number(pedido?.total ?? 0).toFixed(2).replace(".", ",");

  const payload = JSON.stringify({
    titulo: `🔔 Novo pedido #${pedido?.id ?? ""}`,
    corpo: `${pedido?.cliente_nome ?? "Cliente"} • R$ ${total}`,
    tag: `pedido-${pedido?.id ?? Date.now()}`,
    url: "/admin.html",
  });

  const { data: assinaturas, error } = await supabase
    .from("push_assinaturas")
    .select("id, endpoint, p256dh, auth");

  if (error) return new Response(JSON.stringify({ erro: error.message }), { status: 500 });

  let enviados = 0;
  for (const a of assinaturas ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
        payload,
      );
      enviados++;
    } catch (e) {
      // Aparelho desinstalou / expirou: remove da lista
      const status = (e as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        await supabase.from("push_assinaturas").delete().eq("id", a.id);
      }
    }
  }

  return new Response(JSON.stringify({ enviados }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
});
