import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Loader2, RotateCcw, Zap, Layers, Music, Upload, FileAudio, X, Shield, Timer, Wifi, WifiOff, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const GENRES = ["Trap", "Drill", "Afro-Trap", "Rage", "Lo-Fi", "Eletrônico", "R&B", "Pop", "Funk", "Hip-Hop"] as const;
const DURATIONS = [
  { label: "5s", value: 5 },
  { label: "8s", value: 8 },
  { label: "10s", value: 10 },
  { label: "15s", value: 15 },
  { label: "20s", value: 20 },
] as const;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const COOLDOWN_SECONDS = 30;
const LOCAL_BACKEND_KEY = "soundforge_local_url";

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
  const [duration, setDuration] = useState("8");
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");

  // Backend mode
  const [backendMode, setBackendMode] = useState<"cloud" | "local">(() => {
    return localStorage.getItem(LOCAL_BACKEND_KEY) ? "local" : "cloud";
  });
  const [localUrl, setLocalUrl] = useState(() => {
    return localStorage.getItem(LOCAL_BACKEND_KEY) || "http://localhost:8000";
  });
  const [localConnected, setLocalConnected] = useState<boolean | null>(null);

  // Cooldown state
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reference mode state
  const [mode, setMode] = useState<"prompt" | "reference">("prompt");
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isCooldownActive = cooldownRemaining > 0;
  const bpmNum = parseInt(bpm, 10);
  const isValidBpm = !isNaN(bpmNum) && bpmNum >= 60 && bpmNum <= 200;
  const canGenerate =
    mode === "prompt"
      ? prompt.trim().length > 0 && genre && isValidBpm
      : referenceFile !== null && genre && isValidBpm;

  // Check local backend health
  useEffect(() => {
    if (backendMode !== "local") return;
    const check = async () => {
      try {
        const res = await fetch(`${localUrl}/health`, { signal: AbortSignal.timeout(3000) });
        const data = await res.json();
        setLocalConnected(data.status === "ok");
      } catch {
        setLocalConnected(false);
      }
    };
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, [backendMode, localUrl]);

  // Save local URL
  useEffect(() => {
    if (backendMode === "local") {
      localStorage.setItem(LOCAL_BACKEND_KEY, localUrl);
    } else {
      localStorage.removeItem(LOCAL_BACKEND_KEY);
    }
  }, [backendMode, localUrl]);

  // Cooldown timer
  useEffect(() => {
    if (cooldownRemaining > 0) {
      cooldownRef.current = setInterval(() => {
        setCooldownRemaining((prev) => {
          if (prev <= 1) {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, [cooldownRemaining > 0]);

  const startCooldown = () => setCooldownRemaining(COOLDOWN_SECONDS);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".mp3")) {
      toast.error("Only .mp3 files are accepted");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File too large — max 5MB");
      return;
    }
    setReferenceFile(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback(() => setIsDragging(false), []);

  const fetchAudioLocal = async (): Promise<string> => {
    console.log("[Generator] Calling local backend...");
    const res = await fetch(`${localUrl}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        genre,
        bpm: bpmNum,
        energy_level: energyLevel[0],
        instrumental_density: instrumentalDensity[0],
        duration: parseInt(duration, 10),
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Local generation failed" }));
      throw new Error(err.detail || "Local generation failed");
    }

    const data = await res.json();
    if (!data.audio_url) throw new Error("No audio URL from local backend");
    console.log("[Generator] Local audio URL:", data.audio_url);
    toast.info(`Generated in ${data.generation_time?.toFixed(1)}s`);
    return data.audio_url;
  };

  const fetchAudioCloud = async (): Promise<string> => {
    console.log("[Generator] Calling cloud edge function...");
    let body: Record<string, unknown> = {
      genre,
      bpm: bpmNum,
      energy_level: energyLevel[0],
      instrumental_density: instrumentalDensity[0],
    };

    if (mode === "reference" && referenceFile) {
      const arrayBuffer = await referenceFile.arrayBuffer();
      const base64 = btoa(new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ""));
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

    const { data, error } = await supabase.functions.invoke("generate-beat", { body });

    if (error) {
      try {
        const context = (error as any)?.context;
        if (context) {
          const responseBody = await context.json?.();
          if (responseBody?.rate_limited) throw new Error("RATE_LIMITED");
          if (responseBody?.error) throw new Error(responseBody.error);
        }
      } catch (parseErr: any) {
        if (parseErr.message === "RATE_LIMITED") throw parseErr;
      }
      throw new Error("Generation failed — Check API Token or try again");
    }

    if (data?.error) {
      if (data.rate_limited) throw new Error("RATE_LIMITED");
      throw new Error(data.error);
    }

    if (!data?.audio_url) throw new Error("No audio URL returned");
    return data.audio_url;
  };

  const handleGenerate = async () => {
    if (!canGenerate || isCooldownActive) {
      if (isCooldownActive) { toast.error(`Please wait ${cooldownRemaining}s`); return; }
      if (mode === "prompt" && !prompt.trim()) toast.error("Enter your musical vision");
      else if (mode === "reference" && !referenceFile) toast.error("Upload a reference MP3");
      else if (!genre) toast.error("Select a genre");
      else if (!isValidBpm) toast.error("BPM must be between 60 and 200");
      return;
    }

    if (backendMode === "local" && !localConnected) {
      toast.error("Local backend not connected. Start the Python server first.");
      return;
    }

    setIsGenerating(true);
    setHasFailed(false);
    setProgress(10);
    setProgressLabel(backendMode === "local" ? "Generating locally (may take a while)..." : "Sending to AI...");

    try {
      setProgress(20);
      const audioUrl = backendMode === "local" ? await fetchAudioLocal() : await fetchAudioCloud();

      if (!audioUrl) throw new Error("Audio source is null");

      setProgress(60);
      setProgressLabel("Saving to library...");

      const beatTitle = mode === "reference"
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

      if (dbError) throw dbError;

      setProgress(100);
      setProgressLabel("Ready!");

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

      onBeatGenerated?.(beat);
      toast.success("Beat generated successfully!");
    } catch (err: unknown) {
      const isRateLimited = err instanceof Error && err.message === "RATE_LIMITED";
      if (isRateLimited) {
        toast.info("Server is busy. Please wait...", { duration: 5000 });
        startCooldown();
        setHasFailed(false);
      } else {
        setHasFailed(true);
        toast.error(err instanceof Error ? err.message : "Generation failed");
      }
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
        {/* Backend Mode Toggle */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wider">Backend</Label>
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setBackendMode("cloud")}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                backendMode === "cloud"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <Wifi className="h-3.5 w-3.5" />
              Cloud (Replicate)
            </button>
            <button
              type="button"
              onClick={() => setBackendMode("local")}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                backendMode === "local"
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <WifiOff className="h-3.5 w-3.5" />
              Local (MusicGen)
            </button>
          </div>

          {backendMode === "local" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  value={localUrl}
                  onChange={(e) => setLocalUrl(e.target.value)}
                  placeholder="http://localhost:8000"
                  className="bg-muted border-border text-foreground text-xs font-mono h-8"
                />
                <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                  localConnected === true ? "bg-green-500" : localConnected === false ? "bg-destructive" : "bg-muted-foreground"
                }`} />
              </div>
              <p className="text-xs text-muted-foreground">
                {localConnected === true ? "✅ Connected to local MusicGen" :
                 localConnected === false ? "❌ Backend not running — start the Python server" :
                 "⏳ Checking connection..."}
              </p>
            </div>
          )}
        </div>

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
                  <p className="text-xs text-muted-foreground">{(referenceFile.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setReferenceFile(null)} className="h-8 w-8 text-muted-foreground hover:text-destructive">
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
                  isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50"
                }`}
              >
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground text-center">Drag & drop an MP3 here, or click to browse</p>
                <p className="text-xs text-muted-foreground">Max 5MB • .mp3 only</p>
                <input ref={fileInputRef} type="file" accept=".mp3,audio/mpeg" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileSelect(file); }} />
              </div>
            )}
            <div className="flex items-start gap-2 rounded-md bg-primary/5 border border-primary/20 p-3">
              <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Generating a <span className="text-primary font-medium">unique version</span> — 100% original and plagiarism-free.
              </p>
            </div>
          </div>
        )}

        {/* Genre */}
        <div className="space-y-2">
          <Label className="text-foreground">Genre</Label>
          {isGenerating ? <Skeleton className="h-10 w-full" /> : (
            <Select value={genre} onValueChange={setGenre}>
              <SelectTrigger className="bg-muted border-border text-foreground">
                <SelectValue placeholder="Select genre" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Duration */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-foreground">
            <Timer className="h-4 w-4 text-secondary" />
            Duration
          </Label>
          {isGenerating ? <Skeleton className="h-10 w-full" /> : (
            <div className="flex gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDuration(String(d.value))}
                  className={`flex-1 py-2 text-xs font-medium rounded-md border transition-colors ${
                    duration === String(d.value)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted text-muted-foreground border-border hover:border-primary/50"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
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
          {isGenerating ? <Skeleton className="h-5 w-full" /> : (
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
          {isGenerating ? <Skeleton className="h-5 w-full" /> : (
            <Slider value={instrumentalDensity} onValueChange={setInstrumentalDensity} min={1} max={10} step={1} />
          )}
        </div>

        {/* BPM */}
        <div className="space-y-2">
          <Label htmlFor="bpm" className="text-foreground">BPM (60–200)</Label>
          {isGenerating ? <Skeleton className="h-10 w-full" /> : (
            <Input id="bpm" type="number" value={bpm} onChange={(e) => setBpm(e.target.value)} min={60} max={200} className="bg-muted border-border text-foreground font-mono" />
          )}
          {bpm && !isValidBpm && <p className="text-xs text-destructive">BPM must be between 60 and 200</p>}
        </div>

        {/* Progress */}
        {isGenerating && (
          <div className="space-y-1">
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground text-center">{progressLabel || "Generating your beat..."}</p>
            {backendMode === "local" && (
              <p className="text-xs text-muted-foreground/60 text-center">⚠️ Local generation can take 30s–5min depending on hardware</p>
            )}
          </div>
        )}

        {/* Cooldown */}
        {isCooldownActive && !isGenerating && (
          <div className="flex items-center gap-2 rounded-md bg-muted border border-border p-3">
            <Timer className="h-4 w-4 text-primary animate-pulse" />
            <p className="text-sm text-muted-foreground">
              API is busy, please wait... <span className="font-mono text-primary font-bold">{cooldownRemaining}s</span>
            </p>
          </div>
        )}

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={!canGenerate || isGenerating || isCooldownActive || (backendMode === "local" && !localConnected)}
          className={`w-full h-12 text-base font-bold transition-all ${
            isGenerating ? "animate-pulse-glow" : canGenerate && !isCooldownActive ? "glow-primary hover:scale-[1.02]" : ""
          }`}
        >
          {isGenerating ? (
            <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Generating...</>
          ) : isCooldownActive ? (
            <><Timer className="mr-2 h-5 w-5" />Wait {cooldownRemaining}s</>
          ) : (
            <><Sparkles className="mr-2 h-5 w-5" />{mode === "reference" ? "Generate Similar Beat" : "Generate Beat"}</>
          )}
        </Button>

        {/* Try Again */}
        {hasFailed && !isCooldownActive && !isGenerating && (
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
