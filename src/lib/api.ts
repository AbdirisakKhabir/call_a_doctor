import { getStoredToken, touchSessionActivity } from "@/types/auth";

export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getStoredToken();
  const headers: HeadersInit = {
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url, { ...options, headers });
  if (token && res.ok) {
    touchSessionActivity();
  }
  return res;
}
