import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ServerError } from "@/components/ui/ServerError";
import { cn } from "@/lib/utils";

interface RecipeComponent {
  paintId: string;
  name: string;
  hex: string;
  parts: number;
}

interface SavedRecipe {
  id: string;
  targetPaint: { id: string; name: string; hex: string };
  components: RecipeComponent[];
  resultHex: string;
  distance: number;
  quality: "great" | "approximate";
  notes: string | null;
  createdAt: string;
}

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

export default function SavedRecipesList() {
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [editingIds, setEditingIds] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/recipes");
        if (!res.ok) {
          throw new Error(await extractError(res, "Failed to load saved recipes"));
        }
        const data = (await res.json()) as SavedRecipe[];
        if (!cancelled) setRecipes(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load saved recipes");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDelete(recipeId: string) {
    setPendingIds((prev) => new Set(prev).add(recipeId));
    setError(null);
    try {
      const res = await fetch(`/api/recipes/${recipeId}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(await extractError(res, "Failed to delete recipe"));
      }
      setRecipes((prev) => prev.filter((recipe) => recipe.id !== recipeId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete recipe");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(recipeId);
        return next;
      });
    }
  }

  function startEditing(recipeId: string, currentNotes: string | null) {
    setDrafts((prev) => ({ ...prev, [recipeId]: currentNotes ?? "" }));
    setEditingIds((prev) => new Set(prev).add(recipeId));
  }

  async function handleSaveNote(recipeId: string) {
    const notes = drafts[recipeId] ?? "";
    setPendingIds((prev) => new Set(prev).add(recipeId));
    setError(null);
    try {
      const res = await fetch(`/api/recipes/${recipeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) {
        throw new Error(await extractError(res, "Failed to save note"));
      }
      setRecipes((prev) => prev.map((recipe) => (recipe.id === recipeId ? { ...recipe, notes } : recipe)));
      setEditingIds((prev) => {
        const next = new Set(prev);
        next.delete(recipeId);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(recipeId);
        return next;
      });
    }
  }

  if (loading) {
    return <p className="text-blue-100/70">Loading your saved recipes…</p>;
  }

  if (recipes.length === 0) {
    return (
      <div className="space-y-4">
        <ServerError message={error} />
        <p className="text-sm text-blue-100/50">
          You haven&apos;t saved any recipes yet.{" "}
          <a href="/dashboard/recipe" className="text-purple-300 underline hover:text-purple-200">
            Generate a recipe
          </a>{" "}
          and save it to see it here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ServerError message={error} />

      <ul className="space-y-3">
        {recipes.map((recipe) => (
          <li key={recipe.id} className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4">
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

            {editingIds.has(recipe.id) ? (
              <div className="space-y-2">
                <Textarea
                  value={drafts[recipe.id] ?? ""}
                  onChange={(e) => {
                    setDrafts((prev) => ({ ...prev, [recipe.id]: e.target.value }));
                  }}
                  className="border-white/20 bg-white/10 text-white placeholder-white/40 focus-visible:ring-purple-400"
                  placeholder="Add a note..."
                />
                <Button
                  type="button"
                  size="sm"
                  disabled={pendingIds.has(recipe.id)}
                  onClick={() => void handleSaveNote(recipe.id)}
                  className="bg-purple-600 text-white hover:bg-purple-500"
                >
                  Save
                </Button>
              </div>
            ) : recipe.notes ? (
              <div className="space-y-2">
                <p className="text-sm whitespace-pre-wrap text-blue-100/70">{recipe.notes}</p>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    startEditing(recipe.id, recipe.notes);
                  }}
                  className="border border-white/20 bg-white/10 text-white hover:bg-white/20"
                >
                  Edit note
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  startEditing(recipe.id, recipe.notes);
                }}
                className="border border-white/20 bg-white/10 text-white hover:bg-white/20"
              >
                Add note
              </Button>
            )}

            <div>
              <Button
                type="button"
                size="sm"
                disabled={pendingIds.has(recipe.id)}
                onClick={() => void handleDelete(recipe.id)}
                className="bg-red-600/80 text-white hover:bg-red-500"
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
