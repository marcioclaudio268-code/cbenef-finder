import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // 1. Get active source feeds
    const { data: feeds, error: feedError } = await supabase
      .from("source_feeds")
      .select("*")
      .eq("is_active", true)
      .eq("state", "SP");

    if (feedError) throw feedError;

    if (!feeds || feeds.length === 0) {
      return new Response(
        JSON.stringify({ message: "Nenhuma fonte ativa encontrada. Configure source_feeds." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results = [];

    for (const feed of feeds) {
      // 2. Create update run
      const { data: run, error: runError } = await supabase
        .from("source_update_runs")
        .insert({
          source_feed_id: feed.id,
          status: "running",
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (runError) throw runError;

      try {
        // PLACEHOLDER: In production, fetch data from feed.url
        // For now, this is a skeleton that logs the attempt
        // Example: const response = await fetch(feed.url);
        // const data = await response.json();

        // 3. Create rule version
        const { data: version, error: versionError } = await supabase
          .from("rule_versions")
          .insert({
            source_feed_id: feed.id,
            version_label: `v${new Date().toISOString().slice(0, 10)}`,
            published_at: new Date().toISOString(),
            is_current: true,
          })
          .select()
          .single();

        if (versionError) throw versionError;

        // Mark previous versions as not current
        await supabase
          .from("rule_versions")
          .update({ is_current: false })
          .eq("source_feed_id", feed.id)
          .neq("id", version.id);

        // 4. PLACEHOLDER: Insert/update cbenef_rules from fetched data
        // await supabase.from("cbenef_rules").insert(parsedRules);

        // 5. Update run as completed
        await supabase
          .from("source_update_runs")
          .update({
            status: "completed",
            finished_at: new Date().toISOString(),
            records_processed: 0, // Update with actual count
          })
          .eq("id", run.id);

        results.push({ feed: feed.name, status: "completed" });
      } catch (innerErr) {
        await supabase
          .from("source_update_runs")
          .update({
            status: "error",
            finished_at: new Date().toISOString(),
            error_message: innerErr.message,
          })
          .eq("id", run.id);

        results.push({ feed: feed.name, status: "error", error: innerErr.message });
      }
    }

    return new Response(
      JSON.stringify({ results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
