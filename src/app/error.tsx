"use client";

import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card>
      <EmptyState
        title="Something went wrong while loading your data"
        description={`${error.message || "Unknown error"}. If the database was not set up yet, stop the server, run "npx prisma migrate dev --name phase3", and start it again.`}
        action={<Button onClick={reset}>Try again</Button>}
      />
    </Card>
  );
}
