import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, CheckCircle, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { nonBlank } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const setupSchema = z.object({
  token: z.string().min(1, "Setup token is required"),
  fullName: nonBlank("Full name", z.string().min(2, "Full name must be at least 2 characters")),
  email: z.string().email("Invalid email address"),
  password: nonBlank("Password", z.string().min(8, "Password must be at least 8 characters")),
  confirmPassword: nonBlank("Confirm password", z.string().min(1, "Please confirm your password")),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type SetupForm = z.infer<typeof setupSchema>;

export default function SetupPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const form = useForm<SetupForm>({
    resolver: zodResolver(setupSchema),
    defaultValues: { token: "", fullName: "", email: "", password: "", confirmPassword: "" },
  });

  const setupMutation = useMutation({
    mutationFn: async (data: SetupForm) => {
      const res = await fetch("/api/setup/super-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token: data.token, fullName: data.fullName, email: data.email, password: data.password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message ?? "Setup failed");
      return json;
    },
    onSuccess: () => {
      toast({ title: "Super admin created", description: "Redirecting to login..." });
      setTimeout(() => setLocation("/auth"), 1200);
    },
    onError: (e: Error) => {
      toast({ title: "Setup failed", description: e.message, variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex justify-center mb-2">
            <div className="rounded-full bg-blue-100 p-3">
              <ShieldCheck className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-center">Create Super Admin</CardTitle>
          <CardDescription className="text-center">
            Enter your setup token and choose credentials for the new super admin account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {setupMutation.isSuccess ? (
            <div className="text-center space-y-4">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-green-700 font-medium">Super admin created! Redirecting to login...</p>
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(d => setupMutation.mutate(d))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="token"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Setup Token</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Enter your SUPER_ADMIN_SETUP_TOKEN"
                          data-testid="input-setup-token"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input
                          type="text"
                          placeholder="Your full name"
                          data-testid="input-full-name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="admin@yourcompany.com"
                          data-testid="input-email"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="At least 8 characters"
                          data-testid="input-password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Repeat your password"
                          data-testid="input-confirm-password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={setupMutation.isPending}
                  data-testid="button-create-super-admin"
                >
                  {setupMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Create Super Admin
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
