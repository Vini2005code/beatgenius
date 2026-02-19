import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Library, Play, Trash2, Music, Clock } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Beat {
  id: string;
  title: string;
  genre: string;
  bpm: number;
  energy_level: number;
  instrumental_density: number;
  prompt: string;
  audio_url: string | null;
  created_at: string;
}

interface BeatLibraryProps {
  onSelectBeat?: (beat: Beat) => void;
}

const BeatLibrary = ({ onSelectBeat }: BeatLibraryProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: beats, isLoading } = useQuery({
    queryKey: ["beats", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("beats")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Beat[];
    },
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: async (beatId: string) => {
      const { error } = await supabase.from("beats").delete().eq("id", beatId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["beats"] });
      toast.success("Beat deleted");
    },
    onError: () => toast.error("Failed to delete beat"),
  });

  return (
    <Card className="border-border bg-card h-full">
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
          <Library className="h-5 w-5 text-secondary" />
          My Beat Library
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : !beats?.length ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Music className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground text-sm">No beats yet</p>
            <p className="text-muted-foreground/60 text-xs mt-1">Generate your first beat to see it here</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {beats.map((beat) => (
              <div
                key={beat.id}
                className="group flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-3 hover:border-primary/30 transition-colors cursor-pointer"
                onClick={() => onSelectBeat?.(beat)}
              >
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-10 w-10 shrink-0 rounded-full text-primary hover:bg-primary/10"
                  onClick={(e) => { e.stopPropagation(); onSelectBeat?.(beat); }}
                >
                  <Play className="h-4 w-4" />
                </Button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{beat.title}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary font-medium">{beat.genre}</span>
                    <span>{beat.bpm} BPM</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(beat.created_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(beat.id); }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BeatLibrary;
