import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Music, Loader2, CheckCircle, ArrowLeft, Mail } from "lucide-react";
import { toast } from "sonner";

type AuthView = "login" | "signup" | "forgot";

const Auth = () => {
  const { user, loading } = useAuth();
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);
  const { signIn, signUp } = useAuth();

  if (loading) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Por favor, insira seu email");
      return;
    }
    if (!password.trim()) {
      toast.error("Por favor, insira sua senha");
      return;
    }
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }
    if (view === "signup" && !displayName.trim()) {
      toast.error("Por favor, insira um nome de exibição");
      return;
    }
    setSubmitting(true);
    try {
      if (view === "login") {
        const { error } = await signIn(email, password);
        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            toast.error("Email ou senha incorretos. Verifique suas credenciais.");
          } else if (error.message.includes("Email not confirmed")) {
            toast.error("Confirme seu email antes de fazer login. Verifique sua caixa de entrada.");
          } else {
            toast.error(error.message);
          }
        }
      } else {
        const { error } = await signUp(email, password, displayName);
        if (error) {
          if (error.message.includes("already registered")) {
            toast.error("Este email já está cadastrado. Tente fazer login.");
          } else {
            toast.error(error.message);
          }
        } else {
          setSignupSuccess(true);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Por favor, insira seu email");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        toast.error(error.message);
      } else {
        setResetSent(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Signup success view
  if (signupSuccess) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-border bg-card">
          <CardHeader className="text-center">
            <Mail className="mx-auto h-12 w-12 text-primary mb-2" />
            <CardTitle className="text-2xl font-bold text-foreground">Verifique seu Email</CardTitle>
            <CardDescription className="text-muted-foreground">
              Enviamos um link de confirmação para{" "}
              <span className="text-foreground font-medium">{email}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Clique no link no seu email para ativar sua conta. Depois volte aqui e faça login.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSignupSuccess(false);
                setView("login");
                setPassword("");
              }}
              className="w-full"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Forgot password view
  if (view === "forgot") {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md border-border bg-card">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Music className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold text-foreground">Redefinir Senha</CardTitle>
            <CardDescription className="text-muted-foreground">
              {resetSent ? "Verifique seu email!" : "Insira seu email para receber o link de redefinição"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {resetSent ? (
              <div className="space-y-4 text-center">
                <CheckCircle className="mx-auto h-12 w-12 text-primary" />
                <p className="text-sm text-muted-foreground">
                  Enviamos um link de redefinição para{" "}
                  <span className="text-foreground font-medium">{email}</span>.
                  Verifique sua caixa de entrada e clique no link.
                </p>
                <Button
                  variant="outline"
                  onClick={() => { setView("login"); setResetSent(false); }}
                  className="w-full"
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar ao Login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email" className="text-foreground">Email</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    maxLength={255}
                    className="bg-muted border-border text-foreground"
                  />
                </div>
                <Button type="submit" className="w-full font-semibold" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enviar Link
                </Button>
                <button
                  type="button"
                  onClick={() => setView("login")}
                  className="block w-full text-center text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  <ArrowLeft className="inline mr-1 h-3 w-3" />
                  Voltar ao Login
                </button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLogin = view === "login";

  return (
    <div className="dark flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border bg-card">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 glow-primary">
            <Music className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-3xl font-bold text-gradient">BeatGenius Ultra</CardTitle>
          <CardDescription className="text-muted-foreground">
            {isLogin ? "Entre na sua conta" : "Crie sua conta de produtor"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="displayName" className="text-foreground">Nome de Exibição</Label>
                <Input
                  id="displayName"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="DJ Producer"
                  maxLength={50}
                  className="bg-muted border-border text-foreground"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                maxLength={255}
                className="bg-muted border-border text-foreground"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-foreground">Senha</Label>
                {isLogin && (
                  <button
                    type="button"
                    onClick={() => setView("forgot")}
                    className="text-xs text-primary hover:text-primary/80 transition-colors"
                  >
                    Esqueceu a senha?
                  </button>
                )}
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                className="bg-muted border-border text-foreground"
              />
              {!isLogin && (
                <p className="text-xs text-muted-foreground">Mínimo de 6 caracteres</p>
              )}
            </div>
            <Button type="submit" className="w-full font-semibold" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLogin ? "Entrar" : "Criar Conta"}
            </Button>
          </form>
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setView(isLogin ? "signup" : "login")}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {isLogin ? "Não tem conta? Cadastre-se" : "Já tem conta? Faça login"}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
