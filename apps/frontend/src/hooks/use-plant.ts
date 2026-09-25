import {
	type Command,
	type Device,
	type DeviceStatusEvent,
	type LampCommandDto,
	type ReadingRange,
	type SchedulesChangedEvent,
	SOCKET_NAMESPACES,
	type TelemetryEvent,
	type WateringSchedule,
	type WateringScheduleDto
} from "@repo/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { toast } from "sonner";
import { create } from "zustand";
import { env } from "@/env";
import { refreshAccessToken } from "@/lib/api";
import { plantApi } from "@/lib/endpoints";
import { queryClient } from "@/lib/query-client";
import { useAuthStore } from "@/stores/useAuthStore";
import { resolveDevice, useDeviceStore } from "@/stores/useDeviceStore";

export const plantKeys = {
	devices: ["devices"] as const,
	readings: (deviceId: string, range: ReadingRange) => ["readings", deviceId, range] as const,
	commands: (deviceId: string) => ["commands", deviceId] as const,
	schedules: (deviceId: string) => ["schedules", deviceId] as const
};

/** History is averaged per bucket server-side: refetch once per bucket. */
const REFETCH_MS: Record<ReadingRange, number> = { "1h": 30_000, "24h": 300_000, "7d": 900_000 };

export const useDevices = () => useQuery({ queryKey: plantKeys.devices, queryFn: plantApi.devices });

/** The cube shown on the dashboard, see resolveDevice(). */
export function useSelectedDevice() {
	const devices = useDevices();
	const selectedId = useDeviceStore((s) => s.selectedId);
	return { devices, device: resolveDevice(devices.data, selectedId) };
}

const refetchDevices = () => queryClient.invalidateQueries({ queryKey: plantKeys.devices });

export const useCreateDevice = () =>
	useMutation({
		mutationFn: (name: string) => plantApi.createDevice({ name }),
		onSuccess: ({ device }) => {
			useDeviceStore.getState().select(device.id);
			return refetchDevices();
		}
	});

export const useRenameDevice = () =>
	useMutation({
		mutationFn: ({ id, name }: { id: string; name: string }) => plantApi.renameDevice(id, { name }),
		onSuccess: (device) => {
			toast.success(`Cube renommé en « ${device.name} »`);
			return refetchDevices();
		},
		onError: (error) => toast.error(error.message)
	});

export const useDeleteDevice = () =>
	useMutation({
		mutationFn: (device: Device) => plantApi.deleteDevice(device.id),
		onSuccess: (_, device) => {
			toast.success(`Cube « ${device.name} » supprimé`);
			if (useDeviceStore.getState().selectedId === device.id) useDeviceStore.getState().select(null);
			queryClient.removeQueries({ queryKey: ["readings", device.id] });
			queryClient.removeQueries({ queryKey: plantKeys.commands(device.id) });
			return refetchDevices();
		},
		onError: (error) => toast.error(error.message)
	});

export const useReadings = (deviceId: string | undefined, range: ReadingRange) =>
	useQuery({
		queryKey: plantKeys.readings(deviceId ?? "", range),
		queryFn: () => plantApi.readings(deviceId!, range),
		enabled: !!deviceId,
		refetchInterval: REFETCH_MS[range],
		placeholderData: (previous) => previous
	});

export const useCommands = (deviceId: string | undefined) =>
	useQuery({
		queryKey: plantKeys.commands(deviceId ?? ""),
		queryFn: () => plantApi.commands(deviceId!),
		enabled: !!deviceId
	});

export const useSchedules = (deviceId: string | undefined) =>
	useQuery({
		queryKey: plantKeys.schedules(deviceId ?? ""),
		queryFn: () => plantApi.schedules(deviceId!),
		enabled: !!deviceId
	});

const refetchSchedules = (deviceId: string) =>
	queryClient.invalidateQueries({ queryKey: plantKeys.schedules(deviceId) });

/** Creates the schedule, or replaces it when `id` is given (also used to enable / disable). */
export const useSaveSchedule = (deviceId: string) =>
	useMutation({
		mutationFn: ({ id, dto }: { id?: string; dto: WateringScheduleDto }) =>
			id ? plantApi.updateSchedule(deviceId, id, dto) : plantApi.createSchedule(deviceId, dto),
		onSuccess: () => refetchSchedules(deviceId),
		onError: (error) => toast.error(error.message)
	});

export const useDeleteSchedule = (deviceId: string) =>
	useMutation({
		mutationFn: (schedule: WateringSchedule) => plantApi.deleteSchedule(deviceId, schedule.id),
		onSuccess: () => {
			toast.success("Programmation supprimée");
			return refetchSchedules(deviceId);
		},
		onError: (error) => toast.error(error.message)
	});

const patchDevice = (deviceId: string, patch: (d: Device) => Device) =>
	queryClient.setQueryData<Device[]>(plantKeys.devices, (list) => list?.map((d) => (d.id === deviceId ? patch(d) : d)));

/**
 * Local time at which each in-flight order was received (HTTP response or socket), so countdowns
 * don't depend on the offset between this screen's clock and the API's.
 */
const receivedAt = new Map<string, number>();

/** When the order started, on this screen's clock. Falls back to createdAt for orders loaded mid-run. */
export const commandStartedAt = (c: Command) => receivedAt.get(c.id) ?? new Date(c.createdAt).getTime();

/** Same cap as the API's command history. */
const COMMAND_HISTORY = 50;

function upsertCommand(command: Command) {
	if (command.completedAt) receivedAt.delete(command.id);
	else if (!receivedAt.has(command.id)) receivedAt.set(command.id, Date.now());
	queryClient.setQueryData<Command[]>(plantKeys.commands(command.deviceId), (list = []) => {
		// The HTTP response (SENT) can arrive after the socket's completion: never go back in time.
		const known = list.find((c) => c.id === command.id);
		if (known?.completedAt && !command.completedAt) return list;
		return [command, ...list.filter((c) => c.id !== command.id)].slice(0, COMMAND_HISTORY);
	});
	// A confirmed lamp order is the cube's new lamp state (also stored server-side).
	if (command.type === "LAMP" && command.status === "DONE" && command.lampOn !== null)
		patchDevice(command.deviceId, (d) => ({
			...d,
			lampOn: command.lampOn ?? d.lampOn,
			lampColor: command.lampColor ?? d.lampColor
		}));
}

/** Runs the pump: the order completes when the cube acknowledges it. */
export const useWater = (deviceId: string | undefined) =>
	useMutation({
		mutationFn: (durationMs: number) => plantApi.water(deviceId!, { durationMs }),
		onSuccess: upsertCommand,
		onError: (error) => toast.error(error.message)
	});

export const useLamp = (deviceId: string | undefined) =>
	useMutation({
		mutationFn: (dto: LampCommandDto) => plantApi.lamp(deviceId!, dto),
		onSuccess: upsertCommand,
		onError: (error) => toast.error(error.message)
	});

/** Whether the realtime link to the API is up (the socket lives in the app layout). */
const useLinkStore = create<{ connected: boolean }>(() => ({ connected: false }));
const setConnected = (connected: boolean) => useLinkStore.setState({ connected });
export const useLinkUp = () => useLinkStore((s) => s.connected);

/**
 * Subscribes to the /dashboard socket and pushes live events into the query cache. Mounted once in the
 * app layout, so every page (dashboard, assistant, settings) stays live: cubes created, renamed or
 * deleted elsewhere (another tab, the assistant) show up in the tab bar right away.
 */
export function usePlantLive() {
	useEffect(() => {
		const socket = io(`${env.VITE_API_URL}${SOCKET_NAMESPACES.dashboard}`, {
			// Read on every (re)connection so a refreshed token is picked up.
			auth: (cb) => cb({ token: useAuthStore.getState().token })
		});

		socket.on("connect", () => {
			setConnected(true);
			// Catch up on anything missed while disconnected.
			queryClient.invalidateQueries({ queryKey: plantKeys.devices });
			queryClient.invalidateQueries({ queryKey: ["commands"] });
			queryClient.invalidateQueries({ queryKey: ["schedules"] });
		});
		socket.on("disconnect", () => setConnected(false));
		socket.on("connect_error", async (error) => {
			setConnected(false);
			if (error.message !== "unauthorized") return;
			try {
				await refreshAccessToken();
				socket.connect();
			} catch {
				useAuthStore.getState().logout();
			}
		});

		socket.on("telemetry", ({ deviceId, reading }: TelemetryEvent) =>
			patchDevice(deviceId, (d) => ({
				...d,
				// The first frame initializes the cube server-side too.
				state: "ACTIVE",
				initializedAt: d.initializedAt ?? reading.recordedAt,
				online: true,
				lastSeenAt: reading.recordedAt,
				latestReading: reading
			}))
		);
		socket.on("devices:changed", refetchDevices);
		socket.on("device:status", ({ deviceId, online, lastSeenAt }: DeviceStatusEvent) =>
			patchDevice(deviceId, (d) => ({ ...d, online, lastSeenAt }))
		);
		socket.on("command:update", upsertCommand);
		socket.on("schedules:changed", ({ deviceId }: SchedulesChangedEvent) => refetchSchedules(deviceId));

		return () => {
			socket.disconnect();
			setConnected(false);
		};
	}, []);
}

/** Re-renders every `ms` — for clocks and "x s ago" labels. */
export function useNow(ms = 1000) {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), ms);
		return () => clearInterval(id);
	}, [ms]);
	return now;
}
