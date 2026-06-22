import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, CheckCircle, Mail, XCircle } from "lucide-react";

export default function VerifyEmailPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [token, setToken] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("token");
    if (t) setToken(t);
  }, []);

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/verify-email-token", { token });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.message ?? "Verification failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setDone(true);
      toast({ title: "Email verified!", description: "Your email has been verified successfully." });
    },
    onError: (e: Error) => {
      setError(e.message);
    },
  });

  useEffect(() => {
    if (token) {
      verifyMutation.mutate();
    }
  }, [token]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center text-muted-foreground">
            <XCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
            Invalid or missing verification token.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex justify-center mb-2">
            <div className="rounded-full bg-green-100 p-3">
              <Mail className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <CardTitle className="text-center">Email Verification</CardTitle>
          <CardDescription className="text-center">
            Verifying your email address...
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {verifyMutation.isPending && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-green-500" />
              <p className="text-muted-foreground">Verifying your email...</p>
            </div>
          )}
          {done && (
            <div className="space-y-4">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-green-700 font-medium">Email verified successfully!</p>
              <p className="text-sm text-muted-foreground">Your account is now fully active.</p>
              <Button className="w-full" onClick={() => setLocation("/auth")} data-testid="button-go-to-login">
                Go to Login
              </Button>
            </div>
          )}
          {error && (
            <div className="space-y-4">
              <XCircle className="h-12 w-12 text-red-400 mx-auto" />
              <p className="text-red-600 font-medium">Verification failed</p>
              <p className="text-sm text-muted-foreground">{error}</p>
              <p className="text-xs text-muted-foreground">
                This link may have expired or already been used. Contact support if you need help.
              </p>
              <Button variant="outline" className="w-full" onClick={() => setLocation("/auth")} data-testid="button-back-to-login">
                Back to Login
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
