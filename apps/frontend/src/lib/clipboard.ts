/**
 * Copies a secret shown once (device key, API key). The Clipboard API needs a secure context
 * (not http://<pi-ip>): the text is then selected for Ctrl+C instead. Returns the message to show.
 */
export async function copyText(text: string, fallbackNode: HTMLElement | null) {
	try {
		await navigator.clipboard.writeText(text);
		return "Clé copiée";
	} catch {
		if (fallbackNode) window.getSelection()?.selectAllChildren(fallbackNode);
		return "Clé sélectionnée — Ctrl+C";
	}
}
