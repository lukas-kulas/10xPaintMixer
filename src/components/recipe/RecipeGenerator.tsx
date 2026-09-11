import { useEffect, useMemo, useState } from "react";
import { Search, FlaskConical } from "lucide-react";
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

interface RecipeComponent {
  paintId: string;
  name: string;
  hex: string;
  parts: number;
}

interface RecipeResponse {
  targetPaint: { id: string; name: string; hex: string };
  components: RecipeComponent[];
  resultHex: string;
  distance: number;
  quality: "great" | "approximate";
}

type SaveState = "idle" | "saving" | "saved";

interface ErrorBody {
  error?: string;
}

async function extractError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as ErrorBody | null;
  return body?.error ?? fallback;
}

function formatParts(components: RecipeComponent[]): string {
  return components
    .map((component) => `${component.parts} part${component.parts === 1 ? "" : "s"} ${component.name}`)
    .join(" : ");
}

export default function RecipeGenerator() {
  const [paints, setPaints] = useState<Paint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [recipeError, setRecipeError] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<RecipeResponse | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

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

  const hasOwnedPaints = useMemo(() => paints.some((paint) => paint.owned), [paints]);

  const types = useMemo(() => {
    return Array.from(new Set(paints.map((paint) => paint.type).filter(Boolean))).sort();
  }, [paints]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return paints.filter((paint) => {
      if (typeFilter && paint.type !== typeFilter) return false;
      if (term && !paint.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [paints, search, typeFilter]);

  async function handleGenerate(targetPaintId: string) {
    setPendingId(targetPaintId);
    setRecipeError(null);
    setSaveState("idle");
    try {
      const res = await fetch("/api/recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_paint_id: targetPaintId }),
      });
      if (!res.ok) {
        throw new Error(await extractError(res, "Failed to generate recipe"));
      }
      const data = (await res.json()) as RecipeResponse;
      setRecipe(data);
    } catch (err) {
      setRecipeError(err instanceof Error ? err.message : "Failed to generate recipe");
    } finally {
      setPendingId(null);
    }
  }

  async function handleSave() {
    if (!recipe) return;
    setSaveState("saving");
    setRecipeError(null);
    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_paint_id: recipe.targetPaint.id,
          components: recipe.components.map((component) => ({ paint_id: component.paintId, parts: component.parts })),
          result_hex: recipe.resultHex,
          distance: recipe.distance,
        }),
      });
      if (!res.ok) {
        throw new Error(await extractError(res, "Failed to save recipe"));
      }
      setSaveState("saved");
    } catch (err) {
      setRecipeError(err instanceof Error ? err.message : "Failed to save recipe");
      setSaveState("idle");
    }
  }

  if (loading) {
    return <p className="text-blue-100/70">Loading paints…</p>;
  }

  if (!hasOwnedPaints) {
    return (
      <div className="space-y-4">
        <ServerError message={error} />
        <p className="text-sm text-blue-100/50">
          You don&apos;t have any paints yet.{" "}
          <a href="/dashboard/paints" className="text-purple-300 underline hover:text-purple-200">
            Add some paints
          </a>{" "}
          before generating a recipe.
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
            placeholder="Search colors..."
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
              onClick={() => void handleGenerate(paint.id)}
              className="bg-purple-600 text-white hover:bg-purple-500"
            >
              <FlaskConical className="size-4" />
              Generate
            </Button>
          </li>
        ))}
        {filtered.length === 0 && <p className="text-sm text-blue-100/50">No colors match your search.</p>}
      </ul>

      <ServerError message={recipeError} />

      {recipe && (
        <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span
                className="size-8 shrink-0 rounded-full border border-white/20"
                style={{ backgroundColor: recipe.targetPaint.hex }}
                aria-hidden="true"
              />
              <span className="text-sm text-blue-100/70">Target: {recipe.targetPaint.name}</span>
            </div>
            <span className="text-blue-100/40">→</span>
            <div className="flex items-center gap-2">
              <span
                className="size-8 shrink-0 rounded-full border border-white/20"
                style={{ backgroundColor: recipe.resultHex }}
                aria-hidden="true"
              />
              <span className="text-sm text-blue-100/70">Result: {recipe.resultHex}</span>
            </div>
          </div>

          <p
            className={cn(
              "inline-block rounded-lg border px-3 py-1 text-sm",
              recipe.quality === "great"
                ? "border-green-400/30 bg-green-900/20 text-green-300"
                : "border-yellow-400/30 bg-yellow-900/20 text-yellow-300",
            )}
          >
            {recipe.quality === "great" ? "Great match" : "Approximate match"}
          </p>

          <p className="text-sm text-white">{formatParts(recipe.components)}</p>

          <Button
            type="button"
            size="sm"
            disabled={saveState !== "idle"}
            onClick={() => void handleSave()}
            className="bg-purple-600 text-white hover:bg-purple-500"
          >
            {saveState === "saved" ? "Saved" : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}
