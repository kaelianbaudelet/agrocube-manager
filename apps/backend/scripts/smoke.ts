import assert from "node:assert/strict";

const API = process.env.API_URL ?? "http://localhost:3001";

type Json = Record<string, any>;

async function call(method: string, path: string, opts: { body?: unknown; token?: string } = {}) {
	const res = await fetch(`${API}${path}`, {
		method,
		headers: {
			"Content-Type": "application/json",
			...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {})
		},
		body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
	});
	const text = await res.text();
	return { status: res.status, body: (text ? JSON.parse(text) : null) as Json };
}

const tests: [string, () => Promise<void>][] = [];
const test = (name: string, fn: () => Promise<void>) => {
	tests.push([name, fn]);
};

// ---- tests ----

test("GET /health répond ok", async () => {
	const r = await call("GET", "/health");
	assert.equal(r.status, 200);
	assert.deepEqual(r.body, { status: "ok" });
});

// ---- runner ----

async function main() {
	let failed = 0;
	for (const [name, fn] of tests) {
		try {
			await fn();
			console.log(`✓ ${name}`);
		} catch (error) {
			failed++;
			console.error(`✗ ${name}\n  ${(error as Error).message}`);
		}
	}
	console.log(`\n${tests.length - failed}/${tests.length} OK`);
	process.exit(failed ? 1 : 0);
}

main();
