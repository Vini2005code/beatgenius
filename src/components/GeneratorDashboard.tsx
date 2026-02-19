import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Loader2, RotateCcw, Zap, Layers, Music } from "lucide-react";
import { toast } from "sonner";

const GENRES = ["Trap", "Drill", "Afro-Trap", "Rage"] as const;

interface GeneratorDashboardProps {
  onBeatGenerated?: (beat: { title: string; genre: string; bpm: number; energyLevel: number; instrumentalDensity: number; prompt: string }) => void;
}

const GeneratorDashboard = ({ onBeatGenerated }: GeneratorDashboardProps) => {
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState<string>("");
  const [energyLevel, setEnergyLevel] = useState([5]);
  const [instrumentalDensity, setInstrumentalDensity] = useState([5]);
  const [bpm, setBpm] = useState("140");
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);

  const bpmNum = parseInt(bpm, 10);
  const isValidBpm = !isNaN(bpmNum) && bpmNum >= 60 && bpmNum <= 200;
  const canGenerate = prompt.trim().length > 0 && genre && isValidBpm;

  const handleGenerate = async () => {
    if (!canGenerate) {
      if (!prompt.trim()) toast.error("Enter your musical vision");
      else if (!genre) toast.error("Select a genre");
      else if (!isValidBpm) toast.error("BPM must be between 60 and 200");
      return;
    }

    setIsGenerating(true);
    setHasFailed(false);

    try {
      // TODO: Call Suno API edge function
      await new Promise((resolve) => setTimeout(resolve, 3000));
      
      onBeatGenerated?.({
        title: `${genre} Beat`,
        genre,
        bpm: bpmNum,
        energyLevel: energyLevel[0],
        instrumentalDensity: instrumentalDensity[0],
        prompt,
      });
      
      toast.success("Beat generated successfully!");
    } catch {
      setHasFailed(true);
      toast.error("Failed to generate beat. Try again.");
    } finally {
      setIsGenerating(false);
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
