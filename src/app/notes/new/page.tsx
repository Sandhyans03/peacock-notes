"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Created = { noteId: string; url: string; accessKey: string | null };

export default function NewNotePage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [shareType, setShareType] = useState("time_based");
  const [accessType, setAccessType] = useState("public");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  // Protected page: send logged-out visitors to /login
  useEffect(() => {
    if (!isPending && !session) router.push("/login");
  }, [isPending, session, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        content,
        // datetime-local gives local time without a timezone; convert to a real UTC instant
        expiresAt: new Date(expiresAt).toISOString(),
        shareType,
        accessType,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Could not create the note. Check the fields (expiry must be in the future).");
      return;
    }
    setCreated(await res.json());
  }

  if (isPending || !session) return <main className="p-8">Loading...</main>;

  if (created) {
    return (
      <main className="mx-auto max-w-xl p-4">
        <Card>
          <CardHeader>
            <CardTitle>Share link created</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Share link</Label>
              <Input readOnly value={created.url} onFocus={(e) => e.target.select()} />
            </div>
            {created.accessKey && (
              <div className="space-y-1">
                <Label>Access key (shown only once, copy it now)</Label>
                <Input readOnly value={created.accessKey} className="font-mono" onFocus={(e) => e.target.select()} />
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={() => navigator.clipboard.writeText(created.url)}>Copy link</Button>
              <Button variant="outline" asChild>
                <Link href={`/notes/${created.noteId}`}>Manage note</Link>
              </Button>
              <Button variant="ghost" onClick={() => setCreated(null)}>New note</Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl p-4">
      <Card>
        <CardHeader>
          <CardTitle>New note</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">Content</Label>
              <Textarea id="content" rows={6} value={content} onChange={(e) => setContent(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiresAt">Expiry date and time</Label>
              <Input id="expiresAt" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="shareType">Share type</Label>
                <select id="shareType" className={selectClass} value={shareType} onChange={(e) => setShareType(e.target.value)}>
                  <option value="time_based">Time-based</option>
                  <option value="one_time">One-time</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="accessType">Access type</Label>
                <select id="accessType" className={selectClass} value={accessType} onChange={(e) => setAccessType(e.target.value)}>
                  <option value="public">Public</option>
                  <option value="password">Password-protected</option>
                </select>
              </div>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating..." : "Create note and share link"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
