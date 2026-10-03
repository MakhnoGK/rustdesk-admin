import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlertIcon, MonitorSmartphoneIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';
import { errorMessage, fieldErrorsOf, hasStatus } from '@/api/errors';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { config } from '@/lib/config';
import { useLogin } from '../api';
import { safeRedirect } from '../redirect';

// Mirrors AdminLoginDto: username 1-64, password 1-256.
const loginSchema = z.object({
  username: z.string().trim().min(1, 'Enter your username').max(64),
  password: z.string().min(1, 'Enter your password').max(256),
});
type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const login = useLogin();
  // Kept here, not in the mutation: the mutation (holding the password) is reset once settled.
  const [error, setError] = useState<unknown>(null);
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    login.mutate(values, {
      onSettled: () => login.reset(),
      onSuccess: () => {
        form.reset();
        void navigate(safeRedirect(params.get('redirect')), { replace: true });
      },
      onError: (failure) => {
        setError(failure);
        form.resetField('password');
        for (const [name, message] of Object.entries(fieldErrorsOf(failure))) {
          if (name === 'username' || name === 'password') form.setError(name, { message });
        }
      },
    });
  });

  const expired = params.get('reason') === 'expired';
  const failure = error && !hasStatus(error, 422) ? errorMessage(error) : null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <MonitorSmartphoneIcon aria-hidden className="size-5" />
          </div>
          <CardTitle>
            <h1 className="text-xl">{config.appName}</h1>
          </CardTitle>
          <CardDescription>Sign in with an administrator account.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate>
            <FieldGroup className="gap-5">
              {expired && !failure ? (
                <Alert>
                  <CircleAlertIcon aria-hidden />
                  <AlertTitle>Session expired</AlertTitle>
                  <AlertDescription>Sign in again to continue.</AlertDescription>
                </Alert>
              ) : null}
              {failure ? (
                <Alert variant="destructive">
                  <CircleAlertIcon aria-hidden />
                  <AlertTitle>Sign-in failed</AlertTitle>
                  <AlertDescription>{failure}</AlertDescription>
                </Alert>
              ) : null}
              <Field data-invalid={!!errors.username}>
                <FieldLabel htmlFor="username">Username</FieldLabel>
                <Input
                  id="username"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-invalid={!!errors.username}
                  {...form.register('username')}
                />
                <FieldError errors={[errors.username]} />
              </Field>
              <Field data-invalid={!!errors.password}>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  {...form.register('password')}
                />
                <FieldError errors={[errors.password]} />
              </Field>
              <Button type="submit" disabled={login.isPending} className="w-full">
                {login.isPending ? <Spinner /> : null}
                Sign in
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
