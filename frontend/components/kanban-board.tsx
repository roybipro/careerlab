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
import { statusMeta } from "@/lib/enums";
import { cn } from "@/lib/utils";

export type KanbanColumn = { id: string; label: string };
export type KanbanItem = { id: string };

type KanbanBoardProps<T extends KanbanItem> = {
  columns: KanbanColumn[];
  items: T[];
  /** Called when a card is dropped on another column or picked from its status menu. */
  onMove: (item: T, toColumn: string) => void;
  /** The card's content. Make it a link to the detail page; the board adds drag and the status menu. */
  renderCard: (item: T) => ReactNode;
  /** Describes a card for screen readers, for example "Acme, Engineer". */
  getItemLabel: (item: T) => string;
  /** The column a card belongs in. Defaults to the item's `status`. */
  getColumn?: (item: T) => string;
};

function Column({ column, count, children }: { column: KanbanColumn; count: number; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const meta = statusMeta(column.id);
  return (
    <section
      ref={setNodeRef}
      aria-label={`${column.label}, ${count} cards`}
      className={cn("flex w-64 shrink-0 flex-col rounded-2xl p-2 transition-shadow", meta.tint, isOver && "ring-2 ring-ring")}
    >
      <h3 className="flex items-center gap-2 px-2 py-2 text-sm font-semibold">
        <span className={cn("size-2.5 shrink-0 rounded-full", meta.dot)} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{column.label}</span>
        <span className="font-normal text-muted-foreground tabular-nums">{count}</span>
      </h3>
      <div className="flex min-h-16 flex-col gap-2">{children}</div>
    </section>
  );
}

function Card<T extends KanbanItem>({
  item,
  columns,
  label,
  column,
  onMove,
  children,
}: {
  item: T;
  /** The column the card is in, left out of its "Move to" menu. */
  column: string;
  columns: KanbanColumn[];
  label: string;
  onMove: (item: T, toColumn: string) => void;
  children: ReactNode;
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: item.id });
  return (
    // The lift is on the inner element: dnd-kit measures the outer node, which must not move on hover.
    <div ref={setNodeRef} className={cn(isDragging && "opacity-40")}>
      <div
        className={cn(
          "relative rounded-xl shadow-card transition-[transform,box-shadow] duration-150",
          !isDragging && "hover:shadow-lift motion-safe:hover:-translate-y-0.5",
        )}
      >
        {/* Drag listeners sit on the card body only, so the menu button is a separate control. */}
        <div {...listeners}>{children}</div>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Move ${label} to another status`}
            render={<Button variant="ghost" size="icon-sm" className="absolute top-0.5 right-0.5 text-muted-foreground md:top-1.5 md:right-1.5" />}
          >
            <MoreVertical />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Move to</DropdownMenuLabel>
              {columns
                .filter((c) => c.id !== column)
                .map((c) => (
                  <DropdownMenuItem key={c.id} onClick={() => onMove(item, c.id)}>
                    {c.label}
                  </DropdownMenuItem>
                ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/**
 * Columns by status. Mouse drag starts after 8px of movement (so a click still opens the card);
 * touch drag starts after a 250ms press (so a swipe still scrolls the board). Every card also
 * has a "Move to" menu, which is the keyboard path.
 */
export function KanbanBoard<T extends KanbanItem>({ columns, items, onMove, renderCard, getItemLabel, getColumn = (item) => (item as { status?: string }).status ?? "" }: KanbanBoardProps<T>) {
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
    if (item && to && to !== getColumn(item)) onMove(item, to);
  }

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="flex items-start gap-3 overflow-x-auto pb-3">
        {columns.map((column) => {
          const columnItems = items.filter((i) => getColumn(i) === column.id);
          return (
            <Column key={column.id} column={column} count={columnItems.length}>
              {columnItems.map((item) => (
                <Card key={item.id} item={item} columns={columns} label={getItemLabel(item)} column={column.id} onMove={onMove}>
                  {renderCard(item)}
                </Card>
              ))}
            </Column>
          );
        })}
      </div>
      <DragOverlay>{active ? <div className="cursor-grabbing rounded-xl shadow-lift">{renderCard(active)}</div> : null}</DragOverlay>
    </DndContext>
  );
}
