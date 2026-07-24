import { useEffect, useState } from "react";
import { Megaphone, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Announcement = { message: string; enabled: boolean };

export function AnnouncementBanner({ settingKey }: { settingKey: "homepage_announcement" | "chat_announcement" }) {
  const [data, setData] = useState<Announcement | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: rows } = await supabase
        .from("app_settings" as never)
        .select("value")
        .eq("key" as never, settingKey as never)
        .maybeSingle();
      if (cancel) return;
      const v = (rows as { value: Announcement } | null)?.value ?? null;
      setData(v);
      // Dismiss state is per-announcement-message so a new message re-shows
      const dismissedMsg = typeof window !== "undefined" ? localStorage.getItem(`ann-dismissed-${settingKey}`) : null;
      if (v && dismissedMsg === v.message) setDismissed(true);
    })();
    return () => {
      cancel = true;
    };
  }, [settingKey]);

  if (!data || !data.enabled || !data.message || dismissed) return null;

  return (
    <div className="relative z-20 border-b border-brand/30 bg-brand/10 px-4 py-2.5 text-sm text-foreground">
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <Megaphone className="h-4 w-4 shrink-0 text-brand" />
        <p className="flex-1 leading-snug">{data.message}</p>
        <button
          onClick={() => {
            localStorage.setItem(`ann-dismissed-${settingKey}`, data.message);
            setDismissed(true);
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Dismiss announcement"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
