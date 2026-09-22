import type { AuthResponse, ChangePasswordDto, LoginDto, RegisterDto, UpdateProfileDto, User } from "@repo/shared";
import { api } from "./api";

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const authApi = {
	login: (dto: LoginDto) => api<AuthResponse>("/auth/login", json("POST", dto)),
	register: (dto: RegisterDto) => api<AuthResponse>("/auth/register", json("POST", dto)),
	logout: () => api<null>("/auth/logout", { method: "POST" })
};

export const usersApi = {
	me: () => api<User>("/users/me"),
	updateProfile: (dto: UpdateProfileDto) => api<User>("/users/me", json("PATCH", dto)),
	changePassword: (dto: ChangePasswordDto) => api<null>("/users/me/password", json("PATCH", dto))
};
