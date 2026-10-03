/** Shown instead of the app when the merged configuration (build + /config.js) is invalid. */
export function ConfigErrorScreen({ issues }: { issues: string[] }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">Configuration error</h1>
      <p className="text-muted-foreground">
        The admin panel cannot start because its configuration is invalid. Check the{' '}
        <code>VITE_*</code> build variables and the container&apos;s <code>APP_NAME</code> and{' '}
        <code>ACTIVE_SESSIONS_REFRESH_MS</code>.
      </p>
      <ul className="list-disc space-y-1 pl-6 font-mono text-sm">
        {issues.map((issue) => (
          <li key={issue}>{issue}</li>
        ))}
      </ul>
    </main>
  );
}
