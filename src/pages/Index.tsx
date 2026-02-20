import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import GeneratorDashboard, { type GeneratedBeat } from "@/components/GeneratorDashboard";
import BeatLibrary from "@/components/BeatLibrary";
import AudioPlayer from "@/components/AudioPlayer";
import { Button } from "@/components/ui/button";
import { LogOut, Music, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const Index = () => {
  const { user, loading, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [activeBeat, setActiveBeat] = useState<{
    audioUrl: string;
    title: string;
    genre: string;
    bpm: number;
  } | null>(null);

  if (loading) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const handleBeatGenerated = (beat: GeneratedBeat) => {
    console.log("[Index] Beat generated, loading into player:", beat.title);
    setActiveBeat({
      audioUrl: beat.audioUrl,
      title: beat.title,
      genre: beat.genre,
      bpm: beat.bpm,
    });
    queryClient.invalidateQueries({ queryKey: ["beats"] });
  };

  const handleSelectBeat = (beat: { audio_url: string | null; title: string; genre: string; bpm: number }) => {
    if (!beat.audio_url) return;
    console.log("[Index] Library beat selected:", beat.title);
    setActiveBeat({
      audioUrl: beat.audio_url,
      title: beat.title,
      genre: beat.genre,
      bpm: beat.bpm,
    });
  };

  return (
    <div className="dark min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Music className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-lg font-bold text-gradient">BeatGenius Ultra</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground hover:text-foreground">
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container py-6 space-y-6">
        {/* Audio Player — persistent at top */}
        <AudioPlayer
          audioUrl={activeBeat?.audioUrl ?? null}
          title={activeBeat?.title}
          genre={activeBeat?.genre}
          bpm={activeBeat?.bpm}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GeneratorDashboard onBeatGenerated={handleBeatGenerated} />
          <BeatLibrary onSelectBeat={handleSelectBeat} />
        </div>
      </main>
    </div>
  );
};

export default Index;
