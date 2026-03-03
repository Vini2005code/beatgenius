import { useEffect, useRef, useState, useCallback } from "react";
import WaveSurfer from "wavesurfer.js";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";

interface AudioPlayerProps {
  audioUrl: string | null;
  title?: string;
  genre?: string;
  bpm?: number;
}

const AudioPlayer = ({ audioUrl, title, genre, bpm }: AudioPlayerProps) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState([0.8]);

  const destroyWavesurfer = useCallback(() => {
    if (wavesurferRef.current) {
      console.log("[AudioPlayer] Destroying previous WaveSurfer instance");
      wavesurferRef.current.destroy();
      wavesurferRef.current = null;
    }
    setIsPlaying(false);
    setIsReady(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  useEffect(() => {
    if (!audioUrl || !waveformRef.current) {
      destroyWavesurfer();
      return;
    }

    console.log("[AudioPlayer] Initializing WaveSurfer with URL:", audioUrl);

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: "hsl(192, 100%, 50%)",
      progressColor: "hsl(72, 100%, 50%)",
      cursorColor: "hsl(0, 0%, 95%)",
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      height: 80,
      normalize: true,
      backend: "MediaElement",
    });

    wavesurferRef.current = ws;

    ws.on("ready", () => {
      console.log("[AudioPlayer] WaveSurfer READY — duration:", ws.getDuration());
      setIsReady(true);
      setDuration(ws.getDuration());
      ws.setVolume(volume[0]);
    });

    ws.on("audioprocess", () => {
      setCurrentTime(ws.getCurrentTime());
    });

    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => setIsPlaying(false));

    ws.on("error", (err) => {
      console.error("[AudioPlayer] WaveSurfer error:", err);
    });

    console.log("[AudioPlayer] Loading audio file...");
    ws.load(audioUrl);

    return () => {
      console.log("[AudioPlayer] Cleanup — destroying instance");
      ws.destroy();
      wavesurferRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl]);

  useEffect(() => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.setVolume(volume[0]);
    }
  }, [volume, isReady]);

  const togglePlay = () => {
    if (wavesurferRef.current && isReady) {
      wavesurferRef.current.playPause();
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (!audioUrl) return null;

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4 space-y-3">
        {/* Track info */}
        {title && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {genre && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary font-medium">{genre}</span>}
                {bpm && <span>{bpm} BPM</span>}
              </div>
            </div>
            <span className="text-xs font-mono text-muted-foreground">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
        )}

        {/* Waveform */}
        <div
          ref={waveformRef}
          className="w-full rounded-md bg-muted/30 cursor-pointer"
          style={{ minHeight: 80 }}
        />

        {/* Controls */}
        <div className="flex items-center gap-3">
          <Button
            size="icon"
            variant="ghost"
            onClick={togglePlay}
            disabled={!isReady}
            className="h-10 w-10 rounded-full text-primary hover:bg-primary/10"
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </Button>

          <div className="flex items-center gap-2 ml-auto">
            {volume[0] === 0 ? (
              <VolumeX className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Volume2 className="h-4 w-4 text-muted-foreground" />
            )}
            <Slider
              value={volume}
              onValueChange={setVolume}
              min={0}
              max={1}
              step={0.01}
              className="w-24"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AudioPlayer;
