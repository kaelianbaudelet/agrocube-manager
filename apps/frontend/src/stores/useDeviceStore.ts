import type { Device } from "@repo/shared";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type DeviceDialog = "create" | "info" | "rename" | "delete" | null;

interface DeviceState {
	/** Cube shown on the dashboard (remembered per browser). */
	selectedId: string | null;
	dialog: DeviceDialog;
	select: (id: string | null) => void;
	openDialog: (dialog: DeviceDialog) => void;
}

export const useDeviceStore = create<DeviceState>()(
	persist(
		(set) => ({
			selectedId: null,
			dialog: null,
			select: (selectedId) => set({ selectedId }),
			openDialog: (dialog) => set({ dialog })
		}),
		{
			name: "workshop.selectedDevice",
			storage: createJSONStorage(() => localStorage),
			partialize: (s) => ({ selectedId: s.selectedId })
		}
	)
);

/**
 * The picked cube if it still exists, else the one currently streaming, else the first registered.
 */
export function resolveDevice(devices: Device[] | undefined, selectedId: string | null) {
	if (!devices?.length) return undefined;
	return devices.find((d) => d.id === selectedId) ?? devices.find((d) => d.online) ?? devices[0];
}
