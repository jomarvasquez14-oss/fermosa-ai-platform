import type { Metadata } from "next";
import { Suspense } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Logo } from "@/components/shared/logo";
import { LoginForm } from "@/features/auth/components/login-form";
import { siteConfig } from "@/lib/config/site";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="flex justify-center">
        <Logo href="/" />
      </div>
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>Sign in with your company account to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* useSearchParams (callbackUrl) requires a Suspense boundary. */}
          <Suspense fallback={<Skeleton className="h-56 w-full" />}>
            <LoginForm />
          </Suspense>
        </CardContent>
        <CardFooter>
          <p className="w-full text-center text-xs text-muted-foreground">
            {siteConfig.name} — internal use only. Contact your administrator for access.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
