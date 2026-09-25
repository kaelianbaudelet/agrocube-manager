import { QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { queryClient } from "@/lib/query-client";

export const Route = createRootRoute({
	component: RootLayout
});

function RootLayout() {
	return (
		<QueryClientProvider client={queryClient}>
			<Outlet />
			<Toaster theme="dark" position="top-right" />
		</QueryClientProvider>
	);
}
