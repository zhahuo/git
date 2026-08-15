"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Wallet } from "lucide-react";
import type { BalanceLog } from "@/lib/types";
import { ApiRequestError, fetchJson, isUnauthorized } from "./api";
import { formatCents, formatSignedCents, formatTime } from "./format";
import { BalanceTypeBadge } from "./status-badge";
import { EmptyState, ErrorState, LoadingState } from "./states";

const RECHARGE_PRESETS = [
  { amountCents: 1000, label: "¥10" },
  { amountCents: 5000, label: "¥50" },
  { amountCents: 10000, label: "¥100" },
];

export function BalancePanel() {
  const [balanceCents, setBalanceCents] = useState<number | null>(null);
  const [logs, setLogs] = useState<BalanceLog[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [recharging, setRecharging] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchJson<{ balance_cents: number; logs: BalanceLog[] }>("/api/balance");
      setBalanceCents(res.balance_cents);
      setLogs(res.logs);
    } catch (err) {
      if (isUnauthorized(err)) {
        window.location.assign("/auth/login?next=%2Faccount%2Fbalance");
        return;
      }
      setError(err instanceof Error ? err.message : "加载失败，请稍后重试");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  async function handleRecharge(amountCents: number) {
    setRecharging(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetchJson<{ balance_cents: number }>("/api/balance/recharge", {
        method: "POST",
        body: JSON.stringify({ amount_cents: amountCents }),
      });
      setBalanceCents(res.balance_cents);
      setNotice(`充值成功，当前余额 ${formatCents(res.balance_cents)}`);
      load();
    } catch (err) {
      if (isUnauthorized(err)) {
        window.location.assign("/auth/login?next=%2Faccount%2Fbalance");
        return;
      }
      setError(err instanceof ApiRequestError ? err.message : "充值失败，请稍后重试");
    } finally {
      setRecharging(false);
    }
  }

  if (error && balanceCents === null) {
    return <ErrorState message={error} onRetry={() => setReloadKey((key) => key + 1)} />;
  }
  if (balanceCents === null || logs === null) {
    return <LoadingState label="正在加载余额" />;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs text-slate-500">当前余额</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {formatCents(balanceCents)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {RECHARGE_PRESETS.map((preset) => (
              <button
                key={preset.amountCents}
                type="button"
                onClick={() => handleRecharge(preset.amountCents)}
                disabled={recharging}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition-colors hover:border-emerald-300 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {recharging ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Plus className="h-4 w-4" aria-hidden="true" />
                )}
                {preset.label}
              </button>
            ))}
          </div>
        </div>
        {notice ? (
          <p className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error}
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          <Wallet className="h-4 w-4 text-slate-400" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-slate-900">余额流水</h3>
        </div>
        {logs.length === 0 ? (
          <EmptyState title="暂无流水" />
        ) : (
          <>
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full min-w-130 text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      时间
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      类型
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      变动
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      余额
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      备注
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                        {formatTime(log.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <BalanceTypeBadge type={log.type} />
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 font-semibold ${
                          log.change_cents >= 0 ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {formatSignedCents(log.change_cents)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {formatCents(log.balance_after_cents)}
                      </td>
                      <td className="max-w-56 px-4 py-3">
                        <span className="line-clamp-1 text-slate-500">{log.note || "—"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-slate-100 sm:hidden">
              {logs.map((log) => (
                <li key={log.id} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <BalanceTypeBadge type={log.type} />
                    <p className="text-xs text-slate-400">{formatTime(log.created_at)}</p>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between gap-3">
                    <p
                      className={`text-base font-semibold ${
                        log.change_cents >= 0 ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {formatSignedCents(log.change_cents)}
                    </p>
                    <p className="text-sm text-slate-600">{formatCents(log.balance_after_cents)}</p>
                  </div>
                  {log.note ? <p className="mt-1 text-xs text-slate-500">{log.note}</p> : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
