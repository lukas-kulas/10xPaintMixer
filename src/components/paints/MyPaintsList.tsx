import { useEffect, useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ServerError } from "@/components/ui/ServerError";
import { cn } from "@/lib/utils";

interface Paint {
  id: string;
  name: string;
  type: string;
  hex: string;
  owned: boolean;
}

interface ErrorBody {
  error?: string;
}

async function extractError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as ErrorBody | null;
  return body?.error ?? fallback;
}

export default function MyPaintsList() {
  const [paints, setPaints] = useState<Paint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/paints");
        if (!res.ok) {
          throw new Error(await extractError(res, "Failed to load paints"));
        }
        const data = (await res.json()) as Paint[];
        if (!cancelled) setPaints(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load paints");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const owned = useMemo(() => paints.filter((paint) => paint.owned), [paints]);

  const types = useMemo(() => {
    return Array.from(new Set(owned.map((paint) => paint.type).filter(Boolean))).sort();
  }, [owned]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return owned.filter((paint) => {
      if (typeFilter && paint.type !== typeFilter) return false;
      if (term && !paint.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [owned, search, typeFilter]);

  async function handleRemove(paintId: string) {
    setPendingId(paintId);
    setError(null);
    try {
      const res = await fetch(`/api/paints/${paintId}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(await extractError(res, "Failed to remove paint"));
      }
      setPaints((prev) => prev.filter((paint) => paint.id !== paintId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove paint");
    } finally {
      setPendingId(null);
    }
  }

  if (loading) {
    return <p className="text-blue-100/70">Loading your paints…</p>;
  }

  if (owned.length === 0) {
    return (
      <div className="space-y-4">
        <ServerError message={error} />
        <p className="text-sm text-blue-100/50">
          You haven&apos;t added any paints yet.{" "}
          <a href="/dashboard/paints" className="text-purple-300 underline hover:text-purple-200">
            Add some paints
          </a>{" "}
          to see them here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            placeholder="Search your paints..."
            className="border-white/20 bg-white/10 pl-10 text-white placeholder-white/40 focus-visible:ring-purple-400"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setTypeFilter(null);
            }}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm transition-colors",
              typeFilter === null
                ? "border-purple-400 bg-purple-600/30 text-white"
                : "border-white/20 text-blue-100/70 hover:bg-white/10",
            )}
          >
            All
          </button>
          {types.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setTypeFilter(type);
              }}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                typeFilter === type
                  ? "border-purple-400 bg-purple-600/30 text-white"
                  : "border-white/20 text-blue-100/70 hover:bg-white/10",
              )}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <ServerError message={error} />

      <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
        {filtered.map((paint) => (
          <li key={paint.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
            <span
              className="size-6 shrink-0 rounded-full border border-white/20"
              style={{ backgroundColor: paint.hex }}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{paint.name}</p>
              <p className="text-xs text-blue-100/50">{paint.type}</p>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={pendingId === paint.id}
              onClick={() => void handleRemove(paint.id)}
              className="bg-red-600/80 text-white hover:bg-red-500"
            >
              <Trash2 className="size-4" />
              Remove
            </Button>
          </li>
        ))}
        {filtered.length === 0 && <p className="text-sm text-blue-100/50">No paints match your filters.</p>}
      </ul>
    </div>
  );
}
