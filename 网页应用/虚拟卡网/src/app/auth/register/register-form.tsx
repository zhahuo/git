"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  User,
  UserPlus,
} from "lucide-react";
import { ApiRequestError, fetchJson } from "@/components/account/api";
import { safeNext } from "@/components/account/format";

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

export function RegisterForm({ next }: { next?: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (!USERNAME_PATTERN.test(username.trim())) {
      return "用户名需为 3-20 位字母、数字或下划线";
    }
    if (password.length < 6 || password.length > 32) {
      return "密码长度需为 6-32 位";
    }
    if (nickname.trim() && (nickname.trim().length < 2 || nickname.trim().length > 20)) {
      return "昵称长度需为 2-20 位";
    }
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await fetchJson("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          username: username.trim(),
          password,
          nickname: nickname.trim(),
        }),
      });
      window.location.assign(safeNext(next));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "注册失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-md bg-slate-900 text-white">
            <UserPlus className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="mt-3 text-xl font-semibold text-slate-900">注册账号</h1>
          <p className="mt-1 text-sm text-slate-500">注册后自动登录，可直接下单</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">用户名</span>
            <div className="relative">
              <User
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                placeholder="3-20 位字母、数字或下划线"
                className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">密码</span>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="6-32 位密码"
                className="h-10 w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-10 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:text-slate-600"
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">
              昵称
              <span className="ml-1 font-normal text-slate-400">（选填）</span>
            </span>
            <div className="relative">
              <User
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="text"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                autoComplete="nickname"
                placeholder="2-20 位昵称"
                className="h-10 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
            </div>
          </label>

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <UserPlus className="h-4 w-4" aria-hidden="true" />
            )}
            注册
          </button>
        </form>

        <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4 text-sm">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-slate-500 transition-colors hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            返回商城
          </Link>
          <Link
            href="/auth/login"
            className="font-medium text-slate-700 transition-colors hover:text-slate-900"
          >
            已有账号，去登录
          </Link>
        </div>
      </div>
    </div>
  );
}
