import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Save, Trash2, RefreshCw, Plus } from "lucide-react";
import {
  listProviders,
  listModels,
  listPlanAccess,
  adminUpsertProvider,
  adminUpsertModel,
  adminDeleteModel,
  adminSetPlanAccess,
  type CatalogModel,
  type CatalogProvider,
} from "@/lib/developer-catalog.functions";

const STATUSES = ["stable", "preview", "beta", "deprecated", "maintenance"] as const;
const PLANS = ["free", "premium", "plus", "pro"] as const;

type ModelRow = CatalogModel & { allowed?: boolean };

export function AdminModelsPanel() {
  const fnProviders = useServerFn(listProviders);
  const fnModels = useServerFn(listModels);
  const fnPlans = useServerFn(listPlanAccess);
  const fnUpProv = useServerFn(adminUpsertProvider);
  const fnUpModel = useServerFn(adminUpsertModel);
  const fnDelModel = useServerFn(adminDeleteModel);
  const fnSetAcc = useServerFn(adminSetPlanAccess);

  const [providers, setProviders] = useState<CatalogProvider[]>([]);
  const [models, setModels] = useState<ModelRow[]>([]);
  const [access, setAccess] = useState<Array<{ model_id: string; plan_id: string; allowed: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [filterProv, setFilterProv] = useState<string>("");
  const [q, setQ] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [p, m, a] = await Promise.all([
        fnProviders(),
        fnModels({ data: { includeHidden: true } }),
        fnPlans(),
      ]);
      setProviders(p.providers);
      setModels(m.models as ModelRow[]);
      setAccess(a.rows as typeof access);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [fnProviders, fnModels, fnPlans]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const accessMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const r of access) m.set(`${r.model_id}::${r.plan_id}`, r.allowed);
    return m;
  }, [access]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return models.filter(
      (m) =>
        (!filterProv || m.provider_id === filterProv) &&
        (!term || m.id.toLowerCase().includes(term) || m.name.toLowerCase().includes(term)),
    );
  }, [models, filterProv, q]);

  const patch = async (id: string, patch: Partial<CatalogModel>) => {
    setBusy(id);
    try {
      const cur = models.find((m) => m.id === id);
      if (!cur) return;
      await fnUpModel({ data: { ...cur, ...patch } as Parameters<typeof fnUpModel>[0]["data"] });
      setModels((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
      toast.success("Saved");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const toggleAccess = async (modelId: string, planId: string, allowed: boolean) => {
    try {
      await fnSetAcc({ data: { model_id: modelId, plan_id: planId, allowed } });
      setAccess((rows) => {
        const others = rows.filter((r) => !(r.model_id === modelId && r.plan_id === planId));
        return [...others, { model_id: modelId, plan_id: planId, allowed }];
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const [newProv, setNewProv] = useState({ id: "", name: "", website: "" });
  const addProvider = async () => {
    if (!newProv.id.trim() || !newProv.name.trim()) return;
    try {
      await fnUpProv({
        data: {
          id: newProv.id.trim(),
          name: newProv.name.trim(),
          website: newProv.website.trim() || null,
        },
      });
      setNewProv({ id: "", name: "", website: "" });
      await refresh();
      toast.success("Provider added");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const [newModel, setNewModel] = useState({ id: "", provider_id: "", name: "", context: 128000 });
  const addModel = async () => {
    if (!newModel.id.trim() || !newModel.provider_id || !newModel.name.trim()) return;
    try {
      await fnUpModel({
        data: {
          id: newModel.id.trim(),
          provider_id: newModel.provider_id,
          name: newModel.name.trim(),
          context_window: Number(newModel.context) || 128000,
          status: "stable",
          enabled: true,
          hidden: false,
          priority: 100,
        },
      });
      setNewModel({ id: "", provider_id: "", name: "", context: 128000 });
      await refresh();
      toast.success("Model added");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const removeModel = async (id: string) => {
    if (!confirm(`Delete model ${id}?`)) return;
    try {
      await fnDelModel({ data: { id } });
      setModels((rows) => rows.filter((r) => r.id !== id));
      toast.success("Deleted");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Providers */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Providers</h3>
            <p className="text-xs text-muted-foreground">{providers.length} configured</p>
          </div>
          <button
            onClick={refresh}
            className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-accent"
          >
            <RefreshCw className="mr-1 inline h-3 w-3" /> Refresh
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {providers.map((p) => (
            <div key={p.id} className="rounded-lg border border-border bg-background px-3 py-2 text-xs">
              <div className="font-medium">{p.name}</div>
              <div className="font-mono text-[10px] text-muted-foreground">{p.id}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <input
            placeholder="provider-id"
            value={newProv.id}
            onChange={(e) => setNewProv({ ...newProv, id: e.target.value })}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          />
          <input
            placeholder="Display name"
            value={newProv.name}
            onChange={(e) => setNewProv({ ...newProv, name: e.target.value })}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          />
          <input
            placeholder="https://…"
            value={newProv.website}
            onChange={(e) => setNewProv({ ...newProv, website: e.target.value })}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          />
          <button
            onClick={addProvider}
            className="rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground"
          >
            <Plus className="mr-1 inline h-3 w-3" />
            Add provider
          </button>
        </div>
      </section>

      {/* Add model */}
      <section className="rounded-xl border border-border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold">Add model</h3>
        <div className="grid gap-2 sm:grid-cols-5">
          <input
            placeholder="provider/model-id"
            value={newModel.id}
            onChange={(e) => setNewModel({ ...newModel, id: e.target.value })}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs sm:col-span-2"
          />
          <select
            value={newModel.provider_id}
            onChange={(e) => setNewModel({ ...newModel, provider_id: e.target.value })}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          >
            <option value="">Provider…</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Display name"
            value={newModel.name}
            onChange={(e) => setNewModel({ ...newModel, name: e.target.value })}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          />
          <button
            onClick={addModel}
            className="rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground"
          >
            <Plus className="mr-1 inline h-3 w-3" /> Add
          </button>
        </div>
      </section>

      {/* Model catalog */}
      <section className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search models…"
            className="flex-1 min-w-[180px] rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          />
          <select
            value={filterProv}
            onChange={(e) => setFilterProv(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5 text-xs"
          >
            <option value="">All providers</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <div className="text-xs text-muted-foreground">
            {loading ? "Loading…" : `${filtered.length} model(s)`}
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Model</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-center">Enabled</th>
                <th className="px-3 py-2 text-center">Hidden</th>
                <th className="px-3 py-2 text-center">Priority</th>
                {PLANS.map((p) => (
                  <th key={p} className="px-2 py-2 text-center capitalize">
                    {p}
                  </th>
                ))}
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-t border-border/60">
                  <td className="px-3 py-2">
                    <div className="font-medium">{m.name}</div>
                    <div className="font-mono text-[10px] text-muted-foreground">{m.id}</div>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={m.status}
                      onChange={(e) =>
                        patch(m.id, { status: e.target.value as CatalogModel["status"] })
                      }
                      disabled={busy === m.id}
                      className="rounded-md border border-border bg-background px-1.5 py-1 text-[10px]"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={m.enabled}
                      onChange={(e) => patch(m.id, { enabled: e.target.checked })}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={m.hidden}
                      onChange={(e) => patch(m.id, { hidden: e.target.checked })}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input
                      type="number"
                      defaultValue={m.priority}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== m.priority) patch(m.id, { priority: v });
                      }}
                      className="w-16 rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                    />
                  </td>
                  {PLANS.map((p) => {
                    const allowed = accessMap.get(`${m.id}::${p}`) ?? false;
                    return (
                      <td key={p} className="px-2 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={allowed}
                          onChange={(e) => toggleAccess(m.id, p, e.target.checked)}
                        />
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-right">
                    <button
                      onClick={() => removeModel(m.id)}
                      className="rounded-md border border-border p-1 text-destructive hover:bg-destructive/10"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">
                    No models
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="text-[10px] text-muted-foreground">
        Changes apply immediately to all users. Toggle plan checkboxes to grant/revoke access per
        subscription tier. Save individual fields via focus-blur (priority) or the inline controls.
        <Save className="ml-1 inline h-3 w-3" />
      </div>
    </div>
  );
}
