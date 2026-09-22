import type { AuthTokens } from "@repo/shared";
import { env } from "@/env";
import { useAuthStore } from "@/stores/useAuthStore";

const BASE_URL = env.VITE_API_URL;

/**
 * On these endpoints a 401 means "bad credentials", not "expired token": never try to refresh.
 */
const PUBLIC_AUTH_ENDPOINTS = ["/auth/login", "/auth/register", "/auth/refresh"];

export class ApiError extends Error {
	status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "ApiError";
		this.status = status;
	}
}

let refreshPromise: Promise<string> | null = null;

/**
 * Single-flight refresh: concurrent 401s share one /auth/refresh call.
 */
function refreshAccessToken(): Promise<string> {
	if (!refreshPromise) {
		refreshPromise = (async () => {
			const { refreshToken, setTokens } = useAuthStore.getState();
			if (!refreshToken) throw new ApiError("Session expirée", 401);
			const response = await fetch(`${BASE_URL}/auth/refresh`, {
				method: "POST",
				headers: { Authorization: `Bearer ${refreshToken}` }
			});
			if (!response.ok) throw new ApiError("Session expirée", response.status);
			const tokens = (await response.json()) as AuthTokens;
			setTokens(tokens.accessToken, tokens.refreshToken);
			return tokens.accessToken;
		})().finally(() => {
			refreshPromise = null;
		});
	}
	return refreshPromise;
}

async function toApiError(response: Response): Promise<ApiError> {
	const data = await response.json().catch(() => ({}));
	const message = Array.isArray(data.message) ? data.message.join("\n") : data.message;
	return new ApiError(message || response.statusText, response.status);
}

export async function api<T>(endpoint: string, init: RequestInit = {}, retried = false): Promise<T> {
	const { token, logout } = useAuthStore.getState();
	const headers = new Headers(init.headers);
	if (init.body !== undefined) headers.set("Content-Type", "application/json");
	if (token) headers.set("Authorization", `Bearer ${token}`);

	const response = await fetch(`${BASE_URL}${endpoint}`, { cache: "no-store", ...init, headers });

	if (response.status === 401 && !retried && !PUBLIC_AUTH_ENDPOINTS.includes(endpoint)) {
		try {
			await refreshAccessToken();
		} catch (error) {
			logout();
			throw error;
		}
		return api<T>(endpoint, init, true);
	}

	if (!response.ok) throw await toApiError(response);
	if (response.status === 204) return null as T;
	return (await response.json()) as T;
}
