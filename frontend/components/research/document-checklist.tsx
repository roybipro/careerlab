"use client";

import { FileCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Research, RequiredDocument } from "@/lib/types";
import { useSavedList } from "./use-saved-list";

const MAX_DOCUMENTS = 100;

/** The documents an application needs. Each change (add, tick, remove) saves the whole list. */
export function DocumentChecklist({ research }: { research: Research }) {
  const { items, save, error } = useSavedList<RequiredDocument>(research, "required_documents");
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const done = items.filter((d) => d.done).length;

  function add() {
    const label = name.trim();
    if (!label) return setFormError("Enter a document name.");
    if (label.length > 200) return setFormError("At most 200 characters.");
    if (items.length >= MAX_DOCUMENTS) return setFormError(`At most ${MAX_DOCUMENTS} documents.`);
    setFormError(null);
    setName("");
    save([...items, { name: label, done: false }]);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <FileCheck aria-hidden="true" />
          Required documents
        </CardTitle>
        {items.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            {done} of {items.length} ready
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>Could not save the checklist. It shows what is saved. {error}</AlertDescription>
          </Alert>
        ) : null}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No documents yet. Add the CV, transcripts or letters this application needs.</p>
        ) : (
          <ul className="space-y-1">
            {items.map((doc, index) => (
              <li key={`${index}-${doc.name}`} className="flex items-center gap-2">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md px-1.5 py-3 hover:bg-muted md:py-1.5">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-primary"
                    checked={doc.done}
                    onChange={() => save(items.map((d, i) => (i === index ? { ...d, done: !d.done } : d)))}
                  />
                  <span className={doc.done ? "text-sm break-words text-muted-foreground line-through" : "text-sm break-words"}>{doc.name}</span>
                </label>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${doc.name}`}
                  onClick={() => save(items.filter((_, i) => i !== index))}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          noValidate
          className="space-y-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <div className="flex gap-2">
            <Input
              aria-label="New document name"
              placeholder="Add a document, for example CV"
              value={name}
              aria-invalid={formError ? true : undefined}
              onChange={(e) => {
                setName(e.target.value);
                setFormError(null);
              }}
            />
            <Button type="submit" variant="outline">
              Add
            </Button>
          </div>
          {formError ? <p className="text-xs text-destructive">{formError}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
