import { NextResponse } from "next/server";

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status = 400, details?: unknown): NextResponse {
  return NextResponse.json({ error: message, ...(details === undefined ? {} : { details }) }, { status });
}

export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status = 400, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function handleError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return apiError(err.message, err.status, err.details);
  }
  console.error("[api] 未处理异常:", err);
  return apiError("服务器内部错误", 500);
}

export async function runRoute(handler: () => NextResponse | Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await handler();
  } catch (err) {
    return handleError(err);
  }
}
