"use client";

import { Copy, MoreHorizontal, Pencil, RotateCcw, Trash2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function TaskActionsMenu({
  status,
  onEdit,
  onDuplicate,
  onToggleDone,
  onDelete,
}: {
  status: string;
  onEdit: () => void;
  onDuplicate: () => void;
  onToggleDone: () => void;
  onDelete: () => void;
}) {
  const done = status === "Done";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Task actions">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onToggleDone}>
          {done ? <RotateCcw /> : <CheckCircle2 />}
          {done ? "Reopen" : "Mark as done"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDuplicate}>
          <Copy /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={onDelete}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
