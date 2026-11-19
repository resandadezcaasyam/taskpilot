import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";

export default function NotFound() {
  return (
    <Card>
      <EmptyState
        title="We could not find that page"
        description="The task or project may have been deleted, or the link is out of date."
        action={<Button asChild variant="outline"><Link href="/">Back to dashboard</Link></Button>}
      />
    </Card>
  );
}
