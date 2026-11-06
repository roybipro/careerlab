"use client";

import { ExternalLink, Trash2 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { TextField } from "@/components/text-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { safeHttpUrl } from "@/lib/format";
import type { PublicationLink, Research } from "@/lib/types";
import { useSavedList } from "./use-saved-list";

const MAX_LINKS = 100;

const schema = z.object({
  title: z.string().trim().min(1, "Enter a title").max(200, "At most 200 characters"),
  url: z
    .string()
    .trim()
    .regex(/^https?:\/\/\S+$/i, "Enter a link starting with http:// or https://"),
});

/** Papers and pages related to this opportunity. Each add or remove saves the whole list. */
export function PublicationLinks({ research }: { research: Research }) {
  const { items, save, error } = useSavedList<PublicationLink>(research, "publication_links");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [errors, setErrors] = useState<{ title?: string; url?: string; form?: string }>({});

  function add() {
    const parsed = schema.safeParse({ title, url });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      return setErrors({ title: flat.title?.[0], url: flat.url?.[0] });
    }
    if (items.length >= MAX_LINKS) return setErrors({ form: `At most ${MAX_LINKS} links.` });
    setErrors({});
    setTitle("");
    setUrl("");
    save([...items, parsed.data]);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Publication links</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription>Could not save the links. The list shows what is saved. {error}</AlertDescription>
          </Alert>
        ) : null}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No publication links yet.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((link, index) => {
              const href = safeHttpUrl(link.url);
              return (
                <li key={`${index}-${link.url}`} className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium break-words">{link.title}</p>
                    {href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm break-all underline underline-offset-4">
                        {href}
                        <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
                      </a>
                    ) : (
                      <p className="text-sm break-all text-muted-foreground">{link.url}</p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${link.title}`} onClick={() => save(items.filter((_, i) => i !== index))}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        <form
          noValidate
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Title" value={title} error={errors.title} onChange={(e) => setTitle(e.target.value)} />
            <TextField label="URL" type="url" placeholder="https://" value={url} error={errors.url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          {errors.form ? <p className="text-xs text-destructive">{errors.form}</p> : null}
          <Button type="submit" variant="outline">
            Add link
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
