"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ShareLink = {
  id: string;
  shareType: "one_time" | "time_based";
  accessType: "public" | "password";
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  lockedUntil: string | null;
  createdAt: string;
};
type Data = { note: { id: string; title: string; content: string }; links: ShareLink[] };

function statusOf(l: ShareLink) {
  if (l.revokedAt) return "Revoked";
  if (new Date(l.expiresAt) <= new Date()) return "Expired";
  if (l.shareType === "one_time" && l.usedAt) return "Used";
  return "Active";
}

export default function NoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/notes/${id}`);
    if (res.status === 401) return router.push("/login");
    if (!res.ok) return setError("Note not found.");
    setData(await res.json());
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function revoke(linkId: string) {
    if (!window.confirm("Revoke this link? It will stop working immediately.")) return;
    await fetch(`/api/shares/${linkId}/revoke`, { method: "POST" });
    load();
  }

  if (error) return <main className="p-8">{error}</main>;
  if (!data) return <main className="p-8">Loading...</main>;

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>{data.note.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap">{data.note.content}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Share links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.links.map((l) => {
            const status = statusOf(l);
            return (
              <div key={l.id} className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm">
                <div className="space-y-1">
                  <div>
                    <b>{l.shareType === "one_time" ? "One-time" : "Time-based"}</b> ·{" "}
                    {l.accessType === "public" ? "Public" : "Password"} · <b>{status}</b>
                  </div>
                  <div>Views: {l.viewCount}</div>
                  <div>Expires: {new Date(l.expiresAt).toLocaleString()}</div>
                </div>
                {status === "Active" && (
                  <Button variant="destructive" size="sm" onClick={() => revoke(l.id)}>
                    Revoke
                  </Button>
                )}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            The link itself is not stored (only its hash), so it can&apos;t be shown again after creation.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={load}>Refresh</Button>
            <Button variant="ghost" asChild>
              <Link href="/notes/new">New note</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
