import { createClient } from "https://esm.sh/@supabase/supabase-js@2.97.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000;

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
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Prediction timed out after 2 minutes");
}

async function createPredictionWithRetry(
  replicateToken: string,
  requestBody: any
): Promise<{ prediction: any; wasRetried: boolean }> {
  let lastError: string = "";
  let wasRetried = false;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      wasRetried = true;
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      console.log(`[generate-beat] Rate limited by Replicate, retrying in ${backoff / 1000}s... (attempt ${attempt + 1}/${MAX_RETRIES})`);
      await new Promise((r) => setTimeout(r, backoff));
    }

    let createRes: Response;
    try {
      createRes = await fetch("https://api.replicate.com/v1/predictions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${replicateToken}`,
          "Content-Type": "application/json",
          Prefer: "wait",
        },
        body: JSON.stringify(requestBody),
      });
    } catch (fetchErr) {
      console.error("[generate-beat] Network error calling Replicate:", fetchErr);
      lastError = "Network error reaching Replicate API. Please try again.";
      continue;
    }

    console.log("[generate-beat] Replicate response status:", createRes.status);

    // Rate limited — retry
    if (createRes.status === 429) {
      const errorText = await createRes.text();
      console.warn("[generate-beat] Rate limited (429):", errorText);
      lastError = "RATE_LIMITED";
      continue;
    }

    // Server error with rate limit message — retry
    if (createRes.status === 500) {
      const errorText = await createRes.text();
      if (errorText.toLowerCase().includes("rate limit")) {
        console.warn("[generate-beat] Server rate limit (500):", errorText);
        lastError = "RATE_LIMITED";
        continue;
      }
      lastError = `Replicate API error (500). Try again later.`;
      // Don't retry non-rate-limit 500s
      break;
    }

    if (!createRes.ok) {
      const errorText = await createRes.text();
      console.error("[generate-beat] Replicate API error:", createRes.status, errorText);

      switch (createRes.status) {
        case 401:
          lastError = "Replicate API token is invalid. Please update REPLICATE_API_TOKEN in your project secrets.";
          break;
        case 402:
          lastError = "Replicate account requires payment setup. Visit replicate.com/account/billing.";
          break;
        case 422:
          lastError = "Invalid model parameters. Please try different settings.";
          break;
        default:
          lastError = `Replicate API error (${createRes.status}). Try again later.`;
      }
      // Non-retryable errors
      break;
    }

    // Success
    const prediction = await createRes.json();
    console.log("[generate-beat] Prediction created:", prediction.id, "status:", prediction.status);
    return { prediction, wasRetried };
  }

  // All retries exhausted or non-retryable error
  throw new Error(lastError);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    console.log("[generate-beat] Step 2/5: Parsing request body...");
    const body = await req.json();
    const { prompt, genre, bpm, energy_level, instrumental_density, mode, reference_audio_base64 } = body;
    console.log("[generate-beat] Params:", { genre, bpm, mode: mode || "prompt", promptLen: prompt?.length });

    let musicPrompt: string;
    if (mode === "reference" && reference_audio_base64) {
      musicPrompt = `${genre} instrumental beat, ${bpm} BPM, ${prompt}. Unique copyright-free instrumental with professional production quality.`;
    } else {
      musicPrompt = `${genre} beat, ${bpm} BPM, ${prompt}`;
    }
    musicPrompt = musicPrompt.slice(0, 500);
    console.log("[generate-beat] Final prompt:", musicPrompt);

    console.log("[generate-beat] Step 3/5: Creating Replicate prediction (with retry)...");

    let prediction: any;
    let wasRetried = false;
    try {
      const result = await createPredictionWithRetry(replicateToken, {
        version: "671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb",
        input: {
          model_version: "stereo-melody-large",
          prompt: musicPrompt,
          duration: 8,
        },
      });
      prediction = result.prediction;
      wasRetried = result.wasRetried;
    } catch (retryErr: any) {
      const errorMessage = retryErr.message || "Generation failed";
      const isRateLimited = errorMessage === "RATE_LIMITED";
      console.error("[generate-beat] All retries failed:", errorMessage);
      return new Response(
        JSON.stringify({
          error: isRateLimited
            ? "Rate limited by Replicate after multiple retries. Please wait a minute and try again."
            : errorMessage,
          rate_limited: isRateLimited,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: isRateLimited ? 429 : 500 }
      );
    }

    if (wasRetried) {
      console.log("[generate-beat] ✅ Succeeded after retry!");
    }

    // Poll if not completed yet
    if (prediction.status !== "succeeded") {
      console.log("[generate-beat] Polling for completion...");
      prediction = await pollForResult(prediction.urls.get, replicateToken);
    }

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

    console.log("[generate-beat] Step 5/5: Uploading to Supabase Storage...");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

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
