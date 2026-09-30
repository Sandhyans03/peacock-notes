"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Status = { state: string; accessType?: "public" | "password"; shareType?: "one_time" | "time_based" };

const MESSAGES: Record<string, string> = {
  not_found: "This link is invalid.",
  revoked: "This link has been revoked by its owner.",
  expired: "This link has expired.",
  used: "This one-time link has already been used.",
  locked: "Too many wrong attempts. Please try again later.",
  wrong_password: "Wrong password. Try again.",
  rate_limited: "Too many attempts from your network. Wait a minute and try again.",
};

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<Status | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const [note, setNote] = useState<{ title: string; content: string } | null>(null);

  // Status check only: never consumes the link or changes the view count.
  useEffect(() => {
    fetch(`/api/share/${token}`)
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ state: "not_found" }));
  }, [token]);

  async function open() {
    setError("");
    setOpening(true);
    const res = await fetch(`/api/share/${token}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: password || undefined }),
    });
    const data = await res.json().catch(() => null);
    setOpening(false);

    if (res.ok) return setNote(data.note);

    const reason: string = data?.error ?? "not_found";
    if (reason === "wrong_password" || reason === "rate_limited") return setError(MESSAGES[reason]);
    setStatus({ state: reason });
  }

  return (
    <main className="mx-auto max-w-xl p-4">
      <Card>
        <CardHeader>
          <CardTitle>{note ? note.title : "Shared note"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!status && <p>Loading...</p>}

          {note && (
            <>
              {/* React escapes this text, so note content can't inject HTML or scripts */}
              <p className="whitespace-pre-wrap">{note.content}</p>
              {status?.shareType === "one_time" && (
                <p className="text-sm text-muted-foreground">
                  This was a one-time link. Reloading will not show the note again.
                </p>
              )}
            </>
          )}

          {!note && status && status.state !== "ok" && (
            <p className="text-red-600">{MESSAGES[status.state] ?? "Something went wrong."}</p>
          )}

          {!note && status?.state === "ok" && (
            <>
              {status.accessType === "password" && (
                <div className="space-y-2">
                  <Label htmlFor="pw">Access key</Label>
                  <Input id="pw" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
              )}
              {status.shareType === "one_time" && (
                <p className="text-sm text-muted-foreground">
                  One-time link: it will stop working after you open the note.
                </p>
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button onClick={open} disabled={opening || (status.accessType === "password" && !password)}>
                {opening ? "Opening..." : status.accessType === "password" ? "Unlock note" : "Open note"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
