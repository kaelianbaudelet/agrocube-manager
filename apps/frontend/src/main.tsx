import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PageLoader } from "./components/page-loader";
import { routeTree } from "./routeTree.gen";
import "streamdown/styles.css";
import "./index.css";

const router = createRouter({
	routeTree,
	defaultPreload: "intent",
	defaultPendingComponent: PageLoader,
	defaultPendingMs: 100
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
	document.documentElement.classList.add("dark");
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>
);
