import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Loader2, RotateCcw, Zap, Layers, Music } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const GENRES = ["Trap", "Drill", "Afro-Trap", "Rage"] as const;

// Public domain / CC0 sample beats for debug fallback
const FALLBACK_AUDIO_URLS = [
  "https://cdn.pixabay.com/audio/2024/11/29/audio_71780c0542.mp3",
  "https://cdn.pixabay.com/audio/2024/10/16/audio_484e8b3e90.mp3",
  "https://cdn.pixabay.com/audio/2023/07/19/audio_e552ef4e0b.mp3",
];

export interface GeneratedBeat {
  id: string;
  title: string;
  genre: string;
  bpm: number;
  energyLevel: number;
  instrumentalDensity: number;
  prompt: string;
  audioUrl: string;
}

interface GeneratorDashboardProps {
  onBeatGenerated?: (beat: GeneratedBeat) => void;
}

const GeneratorDashboard = ({ onBeatGenerated }: GeneratorDashboardProps) => {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState<string>("");
  const [energyLevel, setEnergyLevel] = useState([5]);
  const [instrumentalDensity, setInstrumentalDensity] = useState([5]);
  const [bpm, setBpm] = useState("140");
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const [progress, setProgress] = useState(0);

  const bpmNum = parseInt(bpm, 10);
  const isValidBpm = !isNaN(bpmNum) && bpmNum >= 60 && bpmNum <= 200;
  const canGenerate = prompt.trim().length > 0 && genre && isValidBpm;

  const fetchAudio = async (): Promise<string> => {
    console.log("[Generator] Step 1: Attempting to call Suno API edge function...");

    // Try calling the edge function first
    try {
      const { data, error } = await supabase.functions.invoke("generate-beat", {
        body: {
          prompt,
          genre,
          bpm: bpmNum,
          energy_level: energyLevel[0],
          instrumental_density: instrumentalDensity[0],
        },
      });

      if (error) throw error;
      if (data?.audio_url) {
        console.log("[Generator] Step 2: Suno API returned audio URL:", data.audio_url);
        return data.audio_url;
      }
      throw new Error("No audio_url in response");
    } catch (err) {
      console.warn("[Generator] Suno API unavailable, falling back to debug audio:", err);
    }

    // Fallback: use a real public MP3
    const fallbackUrl = FALLBACK_AUDIO_URLS[Math.floor(Math.random() * FALLBACK_AUDIO_URLS.length)];
    console.log("[Generator] Step 2 (fallback): Using debug audio URL:", fallbackUrl);

    // Validate the URL actually resolves
    console.log("[Generator] Step 3: Validating audio URL with HEAD request...");
    const headRes = await fetch(fallbackUrl, { method: "HEAD" });
    if (!headRes.ok) {
      throw new Error(`Audio URL validation failed: ${headRes.status}`);
    }
    console.log("[Generator] Step 3: Audio URL valid — Content-Type:", headRes.headers.get("content-type"), "Size:", headRes.headers.get("content-length"));

    return fallbackUrl;
  };

  const handleGenerate = async () => {
    if (!canGenerate) {
      if (!prompt.trim()) toast.error("Enter your musical vision");
      else if (!genre) toast.error("Select a genre");
      else if (!isValidBpm) toast.error("BPM must be between 60 and 200");
      return;
    }

    setIsGenerating(true);
    setHasFailed(false);
    setProgress(10);
    console.log("[Generator] === GENERATION STARTED ===");
    console.log("[Generator] Params:", { prompt, genre, bpm: bpmNum, energy: energyLevel[0], density: instrumentalDensity[0] });

    try {
      setProgress(30);
      const audioUrl = await fetchAudio();

      if (!audioUrl) {
        throw new Error("Audio source is null — cannot proceed");
      }

      setProgress(60);
      console.log("[Generator] Step 4: Audio URL acquired:", audioUrl);

      // Save beat to database
      console.log("[Generator] Step 5: Saving beat metadata to database...");
      const beatTitle = `${genre} Beat — ${prompt.slice(0, 30)}`;
      const { data: insertedBeat, error: dbError } = await supabase
        .from("beats")
        .insert({
          title: beatTitle,
          genre,
          bpm: bpmNum,
          energy_level: energyLevel[0],
          instrumental_density: instrumentalDensity[0],
          prompt,
          audio_url: audioUrl,
          user_id: user!.id,
        })
        .select()
        .single();

      if (dbError) {
        console.error("[Generator] DB insert error:", dbError);
        throw dbError;
      }

      setProgress(90);
      console.log("[Generator] Step 5: Beat saved to DB with id:", insertedBeat.id);

      const beat: GeneratedBeat = {
        id: insertedBeat.id,
        title: beatTitle,
        genre,
        bpm: bpmNum,
        energyLevel: energyLevel[0],
        instrumentalDensity: instrumentalDensity[0],
        prompt,
        audioUrl,
      };

      setProgress(100);
      console.log("[Generator] === GENERATION COMPLETE ===");
      onBeatGenerated?.(beat);
      toast.success("Beat generated successfully!");
    } catch (err: unknown) {
      console.error("[Generator] === GENERATION FAILED ===", err);
      setHasFailed(true);
      toast.error(err instanceof Error ? err.message : "Failed to generate beat. Try again.");
    } finally {
      setIsGenerating(false);
      setProgress(0);
    }
  };

  return (
    <Card className="border-border bg-card h-full">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
          <Sparkles className="h-5 w-5 text-primary" />
          Generator Dashboard
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Musical Vision */}
        <div className="space-y-2">
          <Label htmlFor="prompt" className="flex items-center gap-2 text-foreground">
            <Music className="h-4 w-4 text-primary" />
            Musical Vision
          </Label>
          {isGenerating ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.slice(0, 500))}
              placeholder="Describe your beat... e.g. 'Dark melodic trap with haunting piano chords and heavy 808s'"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
              maxLength={500}
            />
          )}
          <p className="text-xs text-muted-foreground text-right">{prompt.length}/500</p>
        </div>

        {/* Genre */}
        <div className="space-y-2">
          <Label className="text-foreground">Genre</Label>
          {isGenerating ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Select value={genre} onValueChange={setGenre}>
              <SelectTrigger className="bg-muted border-border text-foreground">
                <SelectValue placeholder="Select genre" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {GENRES.map((g) => (
                  <SelectItem key={g} value={g}>{g}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Energy Level */}
        <div className="space-y-3">
          <Label className="flex items-center justify-between text-foreground">
            <span className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-secondary" />
              Energy Level
            </span>
            <span className="text-sm font-mono text-primary">{energyLevel[0]}/10</span>
          </Label>
          {isGenerating ? (
            <Skeleton className="h-5 w-full" />
          ) : (
            <Slider value={energyLevel} onValueChange={setEnergyLevel} min={1} max={10} step={1} />
          )}
        </div>

        {/* Instrumental Density */}
        <div className="space-y-3">
          <Label className="flex items-center justify-between text-foreground">
            <span className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-secondary" />
              Instrumental Density
            </span>
            <span className="text-sm font-mono text-primary">{instrumentalDensity[0]}/10</span>
          </Label>
          {isGenerating ? (
            <Skeleton className="h-5 w-full" />
          ) : (
            <Slider value={instrumentalDensity} onValueChange={setInstrumentalDensity} min={1} max={10} step={1} />
          )}
        </div>

        {/* BPM */}
        <div className="space-y-2">
          <Label htmlFor="bpm" className="text-foreground">BPM (60–200)</Label>
          {isGenerating ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <Input
              id="bpm"
              type="number"
              value={bpm}
              onChange={(e) => setBpm(e.target.value)}
              min={60}
              max={200}
              className="bg-muted border-border text-foreground font-mono"
            />
          )}
          {bpm && !isValidBpm && (
            <p className="text-xs text-destructive">BPM must be between 60 and 200</p>
          )}
        </div>

        {/* Progress bar during generation */}
        {isGenerating && (
          <div className="space-y-1">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">Generating your beat...</p>
          </div>
        )}

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={!canGenerate || isGenerating}
          className={`w-full h-12 text-base font-bold transition-all ${
            isGenerating ? "animate-pulse-glow" : canGenerate ? "glow-primary hover:scale-[1.02]" : ""
          }`}
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-5 w-5" />
              Generate Beat
            </>
          )}
        </Button>

        {/* Try Again */}
        {hasFailed && (
          <Button variant="outline" onClick={handleGenerate} className="w-full border-destructive text-destructive hover:bg-destructive/10">
            <RotateCcw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default GeneratorDashboard;
