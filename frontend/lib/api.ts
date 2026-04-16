export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://10.109.25.97:8000/api";

const TOKEN_KEY = "iot_auth_token";
const USER_KEY  = "iot_auth_user";

export type DashboardResponse = {
  summary: {
    total_devices: number;
    total_errors: number;
    pending_errors: number;
    completed_errors: number;
  };
  devices_by_factory: Array<{ factory: string; total: number }>;
  devices_by_status: Array<{ status: string; total: number }>;
  errors_by_factory: Array<{ factory: string; total: number }>;
  devices_by_type_machine: Array<{ type_machine: string; total: number }>;
  errors_by_type_machine: Array<{ type_machine: string; total: number }>;
};

export type Device = {
  id: string;
  mcid: string;
  mac_address: string;
  factory: string;
  line: string;
  type_machine: string;
  model_machine: string;
  type_iot: string;
  status: "active" | "repair" | "broken" | "nonaktif";
  last_update: string;
  created_at: string;
};

export type Repair = {
  id: string;
  device: string;
  mcid: string;
  mac_address: string;
  factory: string;
  line: string;
  date: string;
  problem: string;
  action: string;
  technician_name: string;
  photo_url?: string | null;
  status: "pending" | "completed" | "approved" | "dicopot";
  created_at: string;
  // Info mesin dari device terkait (read-only, dari SerializerMethodField)
  device_type_machine: string;
  device_model_machine: string;
  device_type_iot: string;
};

export type Installation = {
  id: string;
  mcid: string;
  mac_address: string;
  factory: string;
  line: string;
  date_install: string;
  technician: string;
  device: string | null;
  created_at: string;
};

export type InstallationPayload = {
  mcid: string;
  mac_address: string;
  factory: string;
  line: string;
  date_install: string;
  technician: string;
  device?: string;
};

export type HistoryResponse = {
  repairs: Repair[];
  installations: Installation[];
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "teknisi" | "supervisor" | "admin";
  factory_access: string[];
  created_at: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = {
  name: string;
  email: string;
  password: string;
  role?: "teknisi" | "supervisor" | "admin";
  factory_access?: string[];
};

export type AuthResponse = {
  token?: string;
  access_token?: string;
  token_type?: string;
  user: AuthUser;
};

export type ErrorPayload = {
  device: string;
  mcid: string;
  mac_address: string;
  factory: string;
  line: string;
  date: string;
  problem: string;
  action: string;
  technician_name: string;
  status: "pending" | "completed" | "approved";
  photo_url?: string;
};

export function getAuthToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setAuthToken(token: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

/** Simpan info user (role, name, dll.) ke localStorage setelah login. */
export function saveCurrentUser(user: AuthUser) {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/** Baca info user dari localStorage. Null jika belum login atau tidak tersimpan. */
export function loadCurrentUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

/** Hapus info user dari localStorage saat logout. */
export function clearCurrentUser() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USER_KEY);
}

function makeHeaders() {
  const headers: Record<string, string> = {};
  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

const FETCH_TIMEOUT_MS = 12000;

function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() =>
    clearTimeout(timer)
  );
}

async function assertOk(response: Response) {
  if (!response.ok) {
    const payload = await response.text();
    throw new Error(`Request gagal: ${response.status} ${payload}`);
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
      cache: "no-store",
      headers: makeHeaders(),
    });
    await assertOk(response);
    return response.json() as Promise<T>;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timeout — server tidak merespons. Coba lagi.");
    }
    throw err;
  }
}

export async function apiPost<TBody extends object, TResp = unknown>(
  path: string,
  body: TBody
): Promise<TResp> {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...makeHeaders(),
      },
      body: JSON.stringify(body),
    });
    await assertOk(response);
    if (response.status === 204) {
      return undefined as TResp;
    }
    return response.json() as Promise<TResp>;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timeout — server tidak merespons. Coba lagi.");
    }
    throw err;
  }
}

export async function apiPatch<TBody extends object, TResp = unknown>(
  path: string,
  body: TBody
): Promise<TResp> {
  try {
    const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...makeHeaders(),
      },
      body: JSON.stringify(body),
    });
    await assertOk(response);
    if (response.status === 204) {
      return undefined as TResp;
    }
    return response.json() as Promise<TResp>;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timeout — server tidak merespons. Coba lagi.");
    }
    throw err;
  }
}

/** POST multipart/form-data (untuk upload foto dll). Jangan set Content-Type; browser akan set boundary. */
export async function apiPostFormData<TResp = unknown>(path: string, formData: FormData): Promise<TResp> {
  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: makeHeaders(),
    body: formData,
  });
  await assertOk(response);
  if (response.status === 204) return undefined as TResp;
  return response.json() as Promise<TResp>;
}

/** PATCH multipart/form-data (untuk update dengan upload foto). */
export async function apiPatchFormData<TResp = unknown>(path: string, formData: FormData): Promise<TResp> {
  const response = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: makeHeaders(),
    body: formData,
  });
  await assertOk(response);
  if (response.status === 204) return undefined as TResp;
  return response.json() as Promise<TResp>;
}

export async function apiUpload(path: string, file: File): Promise<{ imported: number }> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: makeHeaders(),
    body: formData,
  });
  await assertOk(response);
  return response.json() as Promise<{ imported: number }>;
}

async function downloadFile(path: string, filename: string, timeoutMs = 12000): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      headers: makeHeaders(),
      signal: controller.signal,
    });
    await assertOk(response);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } finally {
    clearTimeout(timer);
  }
}

export async function downloadCsv(path: string, filename: string): Promise<void> {
  return downloadFile(path, filename);
}

export async function downloadSql(): Promise<void> {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return downloadFile("/export/database.sql", `backup_${date}.sql`, 120000);
}

export async function login(payload: LoginPayload): Promise<AuthResponse> {
  const response = await apiPost<LoginPayload, AuthResponse>("/auth/login/", payload);
  const token = response.access_token ?? response.token ?? "";
  if (token) setAuthToken(token);
  if (response.user) saveCurrentUser(response.user);
  return response;
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
  const response = await apiPost<RegisterPayload, AuthResponse>("/auth/register/", payload);
  const token = response.access_token ?? response.token ?? "";
  if (token) setAuthToken(token);
  return response;
}

export async function logout(): Promise<void> {
  clearAuthToken();
  clearCurrentUser();
  apiPost("/auth/logout/", {}).catch(() => {});
}
