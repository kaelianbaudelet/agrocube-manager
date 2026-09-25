import type {
	ApiKey,
	AuthResponse,
	ChangePasswordDto,
	Command,
	CreateApiKeyDto,
	CreatedApiKey,
	CreatedDevice,
	Device,
	DeviceNameDto,
	LampCommandDto,
	LoginDto,
	ReadingRange,
	RegisterDto,
	SensorReading,
	UpdateProfileDto,
	User,
	WaterCommandDto,
	WateringSchedule,
	WateringScheduleDto
} from "@repo/shared";
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

export const apiKeysApi = {
	list: () => api<ApiKey[]>("/api-keys"),
	create: (dto: CreateApiKeyDto) => api<CreatedApiKey>("/api-keys", json("POST", dto)),
	remove: (id: string) => api<null>(`/api-keys/${id}`, { method: "DELETE" })
};

export const plantApi = {
	devices: () => api<Device[]>("/devices"),
	createDevice: (dto: DeviceNameDto) => api<CreatedDevice>("/devices", json("POST", dto)),
	renameDevice: (deviceId: string, dto: DeviceNameDto) => api<Device>(`/devices/${deviceId}`, json("PATCH", dto)),
	deleteDevice: (deviceId: string) => api<null>(`/devices/${deviceId}`, { method: "DELETE" }),
	readings: (deviceId: string, range: ReadingRange) =>
		api<SensorReading[]>(`/devices/${deviceId}/readings?range=${range}`),
	commands: (deviceId: string) => api<Command[]>(`/devices/${deviceId}/commands`),
	water: (deviceId: string, dto: WaterCommandDto) => api<Command>(`/devices/${deviceId}/water`, json("POST", dto)),
	lamp: (deviceId: string, dto: LampCommandDto) => api<Command>(`/devices/${deviceId}/lamp`, json("POST", dto)),
	schedules: (deviceId: string) => api<WateringSchedule[]>(`/devices/${deviceId}/schedules`),
	createSchedule: (deviceId: string, dto: WateringScheduleDto) =>
		api<WateringSchedule>(`/devices/${deviceId}/schedules`, json("POST", dto)),
	updateSchedule: (deviceId: string, id: string, dto: WateringScheduleDto) =>
		api<WateringSchedule>(`/devices/${deviceId}/schedules/${id}`, json("PUT", dto)),
	deleteSchedule: (deviceId: string, id: string) =>
		api<null>(`/devices/${deviceId}/schedules/${id}`, { method: "DELETE" })
};
