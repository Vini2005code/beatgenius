import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Loader2, RotateCcw, Zap, Layers, Music, Upload, FileAudio, X, Shield } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const GENRES = ["Trap", "Drill", "Afro-Trap", "Rage"] as const;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

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
  const [progressLabel, setProgressLabel] = useState("");

  // Reference mode state
  const [mode, setMode] = useState<"prompt" | "reference">("prompt");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bpmNum = parseInt(bpm, 10);
  const isValidBpm = !isNaN(bpmNum) && bpmNum >= 60 && bpmNum <= 200;
  const canGenerate =
    mode === "prompt"
      ? prompt.trim().length > 0 && genre && isValidBpm
      : referenceFile !== null && genre && isValidBpm;

  const handleFileSelect = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".mp3")) {
      toast.error("Only .mp3 files are accepted");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large — max 5MB");
      return;
    }
    console.log("[Generator] Reference file selected:", file.name, file.size, "bytes");
    setReferenceFile(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const fetchAudio = async (): Promise<string> => {
    console.log("[Generator] Calling generate-beat edge function...");

    let body: Record<string, unknown> = {
      genre,
      bpm: bpmNum,
      energy_level: energyLevel[0],
      instrumental_density: instrumentalDensity[0],
    };

    if (mode === "reference" && referenceFile) {
      // Convert file to base64 for the edge function
      console.log("[Generator] Converting reference MP3 to base64...");
      const arrayBuffer = await referenceFile.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      );
      body = {
        ...body,
        prompt: `Generate a unique, copyright-free instrumental in the same style, mood, and energy as the provided reference`,
        reference_audio_base64: base64,
        reference_filename: referenceFile.name,
        mode: "reference",
      };
    } else {
      body.prompt = prompt;
      body.mode = "prompt";
    }

    const { data, error } = await supabase.functions.invoke("generate-beat", {
      body,
    });

    if (error) {
      console.error("[Generator] Edge function invocation error:", error);
      throw new Error("Generation failed — Check Hugging Face Token");
    }

    if (data?.error) {
      console.error("[Generator] Edge function returned error:", data.error);
      throw new Error(data.error);
    }

    if (!data?.audio_url) {
      throw new Error("No audio URL returned from generation service");
    }

    console.log("[Generator] Audio URL received:", data.audio_url);
    return data.audio_url;
  };

  const handleGenerate = async () => {
    if (!canGenerate) {
      if (mode === "prompt" && !prompt.trim()) toast.error("Enter your musical vision");
      else if (mode === "reference" && !referenceFile) toast.error("Upload a reference MP3");
      else if (!genre) toast.error("Select a genre");
      else if (!isValidBpm) toast.error("BPM must be between 60 and 200");
      return;
    }

    setIsGenerating(true);
    setHasFailed(false);
    setProgress(10);
    setProgressLabel(mode === "reference" ? "Analyzing Reference..." : "Sending to Hugging Face...");
    console.log("[Generator] === GENERATION STARTED ===");

    try {
      setProgress(20);
      setProgressLabel("Processing Audio Blob...");
      const audioUrl = await fetchAudio();

      if (!audioUrl) {
        throw new Error("Audio source is null — cannot proceed");
      }

      setProgress(60);
      setProgressLabel("Uploading to Storage...");
      console.log("[Generator] Audio URL acquired:", audioUrl);

      const beatTitle =
        mode === "reference"
          ? `${genre} Beat — Similar to ${referenceFile?.name.slice(0, 20)}`
          : `${genre} Beat — ${prompt.slice(0, 30)}`;

      const { data: insertedBeat, error: dbError } = await supabase
        .from("beats")
        .insert({
          title: beatTitle,
          genre,
          bpm: bpmNum,
          energy_level: energyLevel[0],
          instrumental_density: instrumentalDensity[0],
          prompt: mode === "reference" ? `Reference: ${referenceFile?.name}` : prompt,
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
      setProgressLabel("Ready!");
      console.log("[Generator] Beat saved to DB with id:", insertedBeat.id);

      const beat: GeneratedBeat = {
        id: insertedBeat.id,
        title: beatTitle,
        genre,
        bpm: bpmNum,
        energyLevel: energyLevel[0],
        instrumentalDensity: instrumentalDensity[0],
        prompt: mode === "reference" ? `Reference: ${referenceFile?.name}` : prompt,
        audioUrl,
      };

      setProgress(100);
      console.log("[Generator] === GENERATION COMPLETE ===");
      onBeatGenerated?.(beat);
      toast.success("Beat generated successfully!");
    } catch (err: unknown) {
      console.error("[Generator] === GENERATION FAILED ===", err);
      setHasFailed(true);
      toast.error(err instanceof Error ? err.message : "Generation failed — Check Hugging Face Token");
    } finally {
      setIsGenerating(false);
      setProgress(0);
      setProgressLabel("");
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
        {/* Mode Toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden">
          <button
            type="button"
            onClick={() => setMode("prompt")}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              mode === "prompt"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <Music className="inline-block mr-1.5 h-4 w-4" />
            Text Prompt
          </button>
          <button
            type="button"
            onClick={() => setMode("reference")}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
              mode === "reference"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileAudio className="inline-block mr-1.5 h-4 w-4" />
            Reference MP3
          </button>
        </div>

        {/* Text Prompt Mode */}
        {mode === "prompt" && (
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
        )}

        {/* Reference MP3 Mode */}
        {mode === "reference" && (
          <div className="space-y-3">
            <Label className="flex items-center gap-2 text-foreground">
              <Upload className="h-4 w-4 text-primary" />
              Reference Beat
            </Label>
            {referenceFile ? (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted p-3">
                <FileAudio className="h-8 w-8 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{referenceFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(referenceFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setReferenceFile(null)}
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors ${
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/50"
                }`}
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground text-center">
                  Drag & drop an MP3 here, or click to browse
                </p>
                <p className="text-xs text-muted-foreground">Max 5MB • .mp3 only</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".mp3,audio/mpeg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                />
              </div>
            )}

            {/* Legal compliance notice */}
            <div className="flex items-start gap-2 rounded-md bg-primary/5 border border-primary/20 p-3">
              <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Generating a <span className="text-primary font-medium">unique version</span> ready for
                monetization — 100% original and plagiarism-free.
              </p>
            </div>
          </div>
        )}

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
            <p className="text-xs text-muted-foreground text-center">{progressLabel || "Generating your beat..."}</p>
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
              {mode === "reference" ? "Generate Similar Beat" : "Generate Beat"}
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
