"use client";

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { MoreVertical } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuGroup, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type KanbanColumn = { id: string; label: string };
export type KanbanItem = { id: string; status: string };

type KanbanBoardProps<T extends KanbanItem> = {
  columns: KanbanColumn[];
  items: T[];
  /** Called when a card is dropped on another column or picked from its status menu. */
  onMove: (item: T, toColumn: string) => void;
  /** The card's content. Make it a link to the detail page; the board adds drag and the status menu. */
  renderCard: (item: T) => ReactNode;
  /** Describes a card for screen readers, for example "Acme, Engineer". */
  getItemLabel: (item: T) => string;
};

function Column({ column, count, children }: { column: KanbanColumn; count: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <section
      ref={setNodeRef}
      aria-label={`${column.label}, ${count} cards`}
      className={cn("flex w-72 shrink-0 flex-col rounded-xl bg-muted/50 p-2 transition-colors", isOver && "bg-muted ring-2 ring-ring/40")}
    >
      <h3 className="px-2 py-1.5 text-sm font-medium">
        {column.label} <span className="font-normal text-muted-foreground">{count}</span>
      </h3>
      <div className="flex min-h-16 flex-col gap-2">{children}</div>
    </section>
  );
}

function Card<T extends KanbanItem>({
  item,
  columns,
  label,
  onMove,
  children,
}: {
  item: T;
  columns: KanbanColumn[];
  label: string;
  onMove: (item: T, toColumn: string) => void;
  children: ReactNode;
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: item.id });
  return (
    <div ref={setNodeRef} className={cn("relative", isDragging && "opacity-40")}>
      {/* Drag listeners sit on the card body only, so the menu button is a separate control. */}
      <div {...listeners}>{children}</div>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Move ${label} to another status`}
          render={<Button variant="ghost" size="icon-sm" className="absolute top-1.5 right-1.5" />}
        >
          <MoreVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Move to</DropdownMenuLabel>
            {columns
              .filter((c) => c.id !== item.status)
              .map((c) => (
                <DropdownMenuItem key={c.id} onClick={() => onMove(item, c.id)}>
                  {c.label}
                </DropdownMenuItem>
              ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * Columns by status. Mouse drag starts after 8px of movement (so a click still opens the card);
 * touch drag starts after a 250ms press (so a swipe still scrolls the board). Every card also
 * has a "Move to" menu, which is the keyboard path.
 */
export function KanbanBoard<T extends KanbanItem>({ columns, items, onMove, renderCard, getItemLabel }: KanbanBoardProps<T>) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = items.find((i) => i.id === activeId) ?? null;

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const item = items.find((i) => i.id === event.active.id);
    const to = event.over ? String(event.over.id) : null;
    if (item && to && to !== item.status) onMove(item, to);
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="flex items-start gap-3 overflow-x-auto pb-3">
        {columns.map((column) => {
          const columnItems = items.filter((i) => i.status === column.id);
          return (
            <Column key={column.id} column={column} count={columnItems.length}>
              {columnItems.map((item) => (
                <Card key={item.id} item={item} columns={columns} label={getItemLabel(item)} onMove={onMove}>
                  {renderCard(item)}
                </Card>
              ))}
            </Column>
          );
        })}
      </div>
      <DragOverlay>{active ? <div className="cursor-grabbing shadow-lg">{renderCard(active)}</div> : null}</DragOverlay>
    </DndContext>
  );
}
