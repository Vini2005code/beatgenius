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
    const hfToken = Deno.env.get("HUGGING_FACE_ACCESS_TOKEN");
    if (!hfToken) {
      throw new Error("HUGGING_FACE_ACCESS_TOKEN is not configured");
    }

    const { prompt, genre, bpm, energy_level, instrumental_density } = await req.json();
    console.log("[generate-beat] Received request:", { prompt, genre, bpm });

    // Build a rich prompt for MusicGen
    const musicPrompt = `${genre} beat, ${bpm} BPM, ${prompt}`.slice(0, 500);
    console.log("[generate-beat] Sending to Hugging Face MusicGen:", musicPrompt);

    // Call Hugging Face Inference API
    const hfResponse = await fetch(
      "https://api-inference.huggingface.co/models/facebook/musicgen-small",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${hfToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: musicPrompt,
          parameters: {
            max_new_tokens: 512,
          },
        }),
      }
    );

    if (!hfResponse.ok) {
      const errorText = await hfResponse.text();
      console.error("[generate-beat] Hugging Face API error:", hfResponse.status, errorText);
      throw new Error(`Hugging Face API error: ${hfResponse.status} — ${errorText}`);
    }

    console.log("[generate-beat] Hugging Face response received, reading audio blob...");
    const audioBlob = await hfResponse.arrayBuffer();
    console.log("[generate-beat] Audio blob size:", audioBlob.byteLength, "bytes");

    if (audioBlob.byteLength < 1000) {
      throw new Error("Audio response too small — model may still be loading. Try again in 30s.");
    }

    // Upload to Supabase Storage
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Ensure bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some((b: { id: string }) => b.id === "beat-files");
    if (!bucketExists) {
      console.log("[generate-beat] Creating beat-files bucket...");
      await supabase.storage.createBucket("beat-files", { public: true });
    }

    const fileName = `beats/${crypto.randomUUID()}.wav`;
    console.log("[generate-beat] Uploading to storage:", fileName);

    const { error: uploadError } = await supabase.storage
      .from("beat-files")
      .upload(fileName, new Uint8Array(audioBlob), {
        contentType: "audio/wav",
        upsert: false,
      });

    if (uploadError) {
      console.error("[generate-beat] Storage upload error:", uploadError);
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from("beat-files").getPublicUrl(fileName);
    const audioUrl = urlData.publicUrl;
    console.log("[generate-beat] Public URL:", audioUrl);

    return new Response(
      JSON.stringify({ audio_url: audioUrl }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("[generate-beat] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
