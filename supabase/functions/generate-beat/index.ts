import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function pollForResult(predictionUrl: string, token: string, maxAttempts = 60): Promise<any> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(predictionUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    console.log(`[generate-beat] Poll ${i + 1}: status=${data.status}`);

    if (data.status === "succeeded") return data;
    if (data.status === "failed" || data.status === "canceled") {
      throw new Error(data.error || "Prediction failed");
    }
    // Wait 2 seconds between polls
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Prediction timed out after 2 minutes");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Step 1: Auth – validate Replicate token ──
    console.log("[generate-beat] Step 1/5: Checking REPLICATE_API_TOKEN...");
    const replicateToken = Deno.env.get("REPLICATE_API_TOKEN");
    if (!replicateToken) {
      console.error("[generate-beat] REPLICATE_API_TOKEN is NOT set");
      return new Response(
        JSON.stringify({ error: "REPLICATE_API_TOKEN is not configured. Add it in project secrets." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }
    console.log("[generate-beat] Token found (length:", replicateToken.length, ")");

    // ── Step 2: Parse request body ──
    console.log("[generate-beat] Step 2/5: Parsing request body...");
    const body = await req.json();
    const { prompt, genre, bpm, energy_level, instrumental_density, mode, reference_audio_base64 } = body;
    console.log("[generate-beat] Params:", { genre, bpm, mode: mode || "prompt", promptLen: prompt?.length });

    // Build prompt for MusicGen
    let musicPrompt: string;
    if (mode === "reference" && reference_audio_base64) {
      musicPrompt = `${genre} instrumental beat, ${bpm} BPM, ${prompt}. Unique copyright-free instrumental with professional production quality.`;
    } else {
      musicPrompt = `${genre} beat, ${bpm} BPM, ${prompt}`;
    }
    musicPrompt = musicPrompt.slice(0, 500);
    console.log("[generate-beat] Final prompt:", musicPrompt);

    // ── Step 3: Call Replicate API (MusicGen) ──
    console.log("[generate-beat] Step 3/5: Creating Replicate prediction...");
    let createRes: Response;
    try {
      createRes = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${replicateToken}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify({
          version: "671ac645ce5e552cc63a54a2bbff63fcf798043ac68f86b6588690de4c07e23b",
          input: {
            model_version: "stereo-melody-large",
            prompt: musicPrompt,
            duration: 8,
          },
        }),
      });
    } catch (fetchErr) {
      console.error("[generate-beat] Network error calling Replicate:", fetchErr);
      return new Response(
        JSON.stringify({ error: "Network error reaching Replicate API. Please try again." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502 }
      );
    }

    console.log("[generate-beat] Replicate response status:", createRes.status);

    if (!createRes.ok) {
      const errorText = await createRes.text();
      console.error("[generate-beat] Replicate API error:", createRes.status, errorText);

      let userMessage: string;
      switch (createRes.status) {
        case 401:
          userMessage = "Replicate API token is invalid. Please update REPLICATE_API_TOKEN in your project secrets.";
          break;
        case 402:
          userMessage = "Replicate account requires payment setup. Visit replicate.com/account/billing.";
          break;
        case 422:
          userMessage = "Invalid model parameters. Please try different settings.";
          break;
        case 429:
          userMessage = "Rate limited by Replicate. Please wait a minute and try again.";
          break;
        default:
          userMessage = `Replicate API error (${createRes.status}). Try again later.`;
      }

      return new Response(
        JSON.stringify({ error: userMessage }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    let prediction = await createRes.json();
    console.log("[generate-beat] Prediction created:", prediction.id, "status:", prediction.status);

    // If not completed yet (Prefer: wait may not always work), poll
    if (prediction.status !== "succeeded") {
      console.log("[generate-beat] Polling for completion...");
      prediction = await pollForResult(prediction.urls.get, replicateToken);
    }

    // ── Step 4: Get audio URL from Replicate ──
    console.log("[generate-beat] Step 4/5: Extracting audio output...");
    const replicateAudioUrl = prediction.output;
    if (!replicateAudioUrl) {
      console.error("[generate-beat] No audio output from Replicate:", JSON.stringify(prediction));
      return new Response(
        JSON.stringify({ error: "No audio was generated. Please try again." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }
    console.log("[generate-beat] Replicate audio URL:", replicateAudioUrl);

    // Download the audio from Replicate
    const audioRes = await fetch(replicateAudioUrl);
    if (!audioRes.ok) {
      console.error("[generate-beat] Failed to download audio from Replicate:", audioRes.status);
      return new Response(
        JSON.stringify({ error: "Failed to download generated audio." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }
    const audioBlob = await audioRes.arrayBuffer();
    console.log("[generate-beat] Audio blob size:", audioBlob.byteLength, "bytes");

    if (audioBlob.byteLength < 1000) {
      console.error("[generate-beat] Audio blob too small:", audioBlob.byteLength);
      return new Response(
        JSON.stringify({ error: "Audio response too small. Try again." }),
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
