"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelPostpone } from "@/actions/engine";

export function BringBackButton({ taskId }: { taskId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await cancelPostpone(taskId);
          if (!r.ok) toast.error(r.error);
          else toast.success("Brought back to your list");
        })
      }
    >
      Bring back now
    </Button>
  );
}
