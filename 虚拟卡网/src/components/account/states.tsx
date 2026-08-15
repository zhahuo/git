import { AlertTriangle, Inbox, Loader2, RefreshCw } from "lucide-react";

export function LoadingState({ label = "加载中" }: { label?: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-10 text-sm text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin text-slate-400" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50/60 px-4 py-10 text-center">
      <AlertTriangle className="h-6 w-6 text-red-400" aria-hidden="true" />
      <p className="text-sm font-medium text-red-700">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 text-xs font-medium text-red-700 transition-colors hover:bg-red-50"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          重试
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
      <Inbox className="h-6 w-6 text-slate-300" aria-hidden="true" />
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {description ? <p className="text-xs text-slate-400">{description}</p> : null}
    </div>
  );
}
