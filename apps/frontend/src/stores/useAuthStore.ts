import type { User } from "@repo/shared";
import { create } from "zustand";

const KEYS = {
	token: "workshop.auth.token",
	refreshToken: "workshop.auth.refreshToken",
	user: "workshop.auth.user"
} as const;

function readUser(): User | null {
	try {
		const raw = localStorage.getItem(KEYS.user);
		return raw ? (JSON.parse(raw) as User) : null;
	} catch {
		return null;
	}
}

interface AuthState {
	token: string | null;
	refreshToken: string | null;
	user: User | null;
	isAuthenticated: boolean;
	setTokens: (token: string, refreshToken: string) => void;
	setUser: (user: User) => void;
	login: (user: User, token: string, refreshToken: string) => void;
	logout: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
	token: localStorage.getItem(KEYS.token),
	refreshToken: localStorage.getItem(KEYS.refreshToken),
	user: readUser(),
	isAuthenticated: !!localStorage.getItem(KEYS.token),

	setTokens: (token, refreshToken) => {
		localStorage.setItem(KEYS.token, token);
		localStorage.setItem(KEYS.refreshToken, refreshToken);
		set({ token, refreshToken, isAuthenticated: true });
	},

	setUser: (user) => {
		localStorage.setItem(KEYS.user, JSON.stringify(user));
		set({ user });
	},

	login: (user, token, refreshToken) => {
		localStorage.setItem(KEYS.user, JSON.stringify(user));
		localStorage.setItem(KEYS.token, token);
		localStorage.setItem(KEYS.refreshToken, refreshToken);
		set({ user, token, refreshToken, isAuthenticated: true });
	},

	logout: () => {
		for (const key of Object.values(KEYS)) localStorage.removeItem(key);
		set({ token: null, refreshToken: null, user: null, isAuthenticated: false });
	}
}));
