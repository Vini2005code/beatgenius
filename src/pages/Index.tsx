import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import GeneratorDashboard from "@/components/GeneratorDashboard";
import BeatLibrary from "@/components/BeatLibrary";
import { Button } from "@/components/ui/button";
import { LogOut, Music, Loader2 } from "lucide-react";

const Index = () => {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

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
      <main className="container py-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <GeneratorDashboard />
          <BeatLibrary />
        </div>
      </main>
    </div>
  );
};

export default Index;
