import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Step 1: Auth – validate HF token exists ──
    console.log("[generate-beat] Step 1/5: Checking HUGGING_FACE_ACCESS_TOKEN...");
    const hfToken = Deno.env.get("HUGGING_FACE_ACCESS_TOKEN");
    if (!hfToken) {
      console.error("[generate-beat] HUGGING_FACE_ACCESS_TOKEN is NOT set");
      return new Response(
        JSON.stringify({ error: "HUGGING_FACE_ACCESS_TOKEN is not configured. Add it in project secrets." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }
    console.log("[generate-beat] Token found (length:", hfToken.length, ")");

    // ── Step 2: Parse request body ──
    console.log("[generate-beat] Step 2/5: Parsing request body...");
    const body = await req.json();
    const { prompt, genre, bpm, energy_level, instrumental_density, mode, reference_audio_base64 } = body;
    console.log("[generate-beat] Params:", { genre, bpm, mode: mode || "prompt", promptLen: prompt?.length });

    // Build prompt for MusicGen
    let musicPrompt: string;
    if (mode === "reference" && reference_audio_base64) {
      musicPrompt = `${genre} instrumental beat, ${bpm} BPM, ${prompt}. Unique copyright-free instrumental with professional production quality.`;
      console.log("[generate-beat] Reference mode — using style prompt");
    } else {
      musicPrompt = `${genre} beat, ${bpm} BPM, ${prompt}`;
    }
    musicPrompt = musicPrompt.slice(0, 500);
    console.log("[generate-beat] Final prompt:", musicPrompt);

    // ── Step 3: Fetch from Hugging Face ──
    console.log("[generate-beat] Step 3/5: Calling Hugging Face MusicGen...");
    let hfResponse: Response;
    try {
      hfResponse = await fetch(
        "https://api-inference.huggingface.co/models/facebook/musicgen-small",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${hfToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inputs: musicPrompt,
            parameters: { max_new_tokens: 512 },
          }),
        }
      );
    } catch (fetchErr) {
      console.error("[generate-beat] Network error calling Hugging Face:", fetchErr);
      return new Response(
        JSON.stringify({ error: "Network error reaching Hugging Face API. Please try again." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 }
      );
    }

    console.log("[generate-beat] HF response status:", hfResponse.status);

    if (!hfResponse.ok) {
      const errorText = await hfResponse.text();
      console.error("[generate-beat] HF API error:", hfResponse.status, errorText);

      let userMessage: string;
      switch (hfResponse.status) {
        case 401:
          userMessage = "Hugging Face token is invalid. Please update HUGGING_FACE_ACCESS_TOKEN in your project secrets with a valid token.";
          break;
        case 403:
          userMessage = "Hugging Face token lacks 'Make calls to Inference Providers' permission. Regenerate your token with this permission enabled.";
          break;
        case 503:
          userMessage = "AI model is loading — please retry in 30 seconds.";
          break;
        case 429:
          userMessage = "Rate limited by Hugging Face. Please wait a minute and try again.";
          break;
        default:
          userMessage = `Hugging Face API error (${hfResponse.status}). Try again later.`;
      }

      return new Response(
        JSON.stringify({ error: userMessage }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // ── Step 4: Read audio blob ──
    console.log("[generate-beat] Step 4/5: Reading audio blob...");
    const audioBlob = await hfResponse.arrayBuffer();
    console.log("[generate-beat] Audio blob size:", audioBlob.byteLength, "bytes");

    if (audioBlob.byteLength < 1000) {
      console.error("[generate-beat] Audio blob too small:", audioBlob.byteLength);
      return new Response(
        JSON.stringify({ error: "Audio response too small — model may still be loading. Try again in 30s." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    // ── Step 5: Upload to Supabase Storage ──
    console.log("[generate-beat] Step 5/5: Uploading to Supabase Storage...");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Ensure bucket exists
    const { data: buckets, error: bucketListError } = await supabase.storage.listBuckets();
    if (bucketListError) {
      console.error("[generate-beat] Failed to list buckets:", bucketListError);
    }
    const bucketExists = buckets?.some((b: { id: string }) => b.id === "beat-files");
    if (!bucketExists) {
      console.log("[generate-beat] Creating beat-files bucket...");
      const { error: createBucketError } = await supabase.storage.createBucket("beat-files", { public: true });
      if (createBucketError) {
        console.error("[generate-beat] Bucket creation error:", createBucketError);
        return new Response(
          JSON.stringify({ error: "Failed to create storage bucket." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }
    }

    const fileName = `beats/${crypto.randomUUID()}.wav`;
    console.log("[generate-beat] Uploading file:", fileName);

    const { error: uploadError } = await supabase.storage
      .from("beat-files")
      .upload(fileName, new Uint8Array(audioBlob), {
        contentType: "audio/wav",
        upsert: false,
      });

    if (uploadError) {
      console.error("[generate-beat] Upload error:", uploadError);
      return new Response(
        JSON.stringify({ error: `Storage upload failed: ${uploadError.message}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    const { data: urlData } = supabase.storage.from("beat-files").getPublicUrl(fileName);
    const audioUrl = urlData.publicUrl;
    console.log("[generate-beat] ✅ Upload complete. Public URL:", audioUrl);

    return new Response(
      JSON.stringify({ audio_url: audioUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("[generate-beat] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unexpected server error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
