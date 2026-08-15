export async function adminFetch<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (init?.body) headers["Content-Type"] = "application/json";
  if (init?.headers) {
    Object.assign(headers, init.headers as Record<string, string>);
  }
  const response = await fetch(url, { ...init, headers });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : `请求失败（${response.status}）`;
    throw new Error(message);
  }
  return data as T;
}
