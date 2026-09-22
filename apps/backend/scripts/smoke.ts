import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

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

const suffix = randomUUID().slice(0, 8);
const PASSWORD = "Password123!x";
const makeUser = (name: string) => ({
	username: `${name}_${suffix}`,
	email: `${name}_${suffix}@test.dev`,
	firstName: name,
	lastName: "Test",
	password: PASSWORD
});

const alice = makeUser("alice");
const bob = makeUser("bob");
const auth: { access?: string; refresh?: string } = {};

test("register : crée l'utilisateur et renvoie les tokens", async () => {
	const r = await call("POST", "/auth/register", { body: { ...alice, email: alice.email.toUpperCase() } });
	assert.equal(r.status, 201, JSON.stringify(r.body));
	assert.equal(r.body.user.email, alice.email, "email stocké en minuscules");
	assert.equal(r.body.user.username, alice.username);
	assert.equal(r.body.user.password, undefined, "pas de mot de passe dans la réponse");
	assert.ok(r.body.accessToken && r.body.refreshToken);
	const r2 = await call("POST", "/auth/register", { body: bob });
	assert.equal(r2.status, 201);
});

test("register : email déjà utilisé → 409", async () => {
	const r = await call("POST", "/auth/register", { body: { ...alice, username: `other_${suffix}` } });
	assert.equal(r.status, 409);
	assert.match(String(r.body.message), /email/i);
});

test("register : username déjà utilisé → 409", async () => {
	const r = await call("POST", "/auth/register", { body: { ...alice, email: `other_${suffix}@test.dev` } });
	assert.equal(r.status, 409);
	assert.match(String(r.body.message), /utilisateur/i);
});

test("register : données invalides → 400", async () => {
	const r = await call("POST", "/auth/register", { body: { ...makeUser("carol"), password: "court" } });
	assert.equal(r.status, 400);
});

test("login : email en majuscules accepté", async () => {
	const r = await call("POST", "/auth/login", { body: { email: alice.email.toUpperCase(), password: PASSWORD } });
	assert.equal(r.status, 200, JSON.stringify(r.body));
	assert.equal(r.body.user.email, alice.email);
	auth.access = r.body.accessToken;
	auth.refresh = r.body.refreshToken;
});

test("login : mauvais mot de passe → 401", async () => {
	const r = await call("POST", "/auth/login", { body: { email: alice.email, password: "Wrong123!pass" } });
	assert.equal(r.status, 401);
});

test("refresh : renvoie de nouveaux tokens, l'ancien refresh token est refusé après rotation", async () => {
	const old = auth.refresh;
	const r = await call("POST", "/auth/refresh", { token: old });
	assert.equal(r.status, 200, JSON.stringify(r.body));
	assert.ok(r.body.accessToken && r.body.refreshToken);
	assert.notEqual(r.body.refreshToken, old);
	auth.access = r.body.accessToken;
	auth.refresh = r.body.refreshToken;
	const reuse = await call("POST", "/auth/refresh", { token: old });
	assert.equal(reuse.status, 401, "réutilisation refusée");
});

test("refresh : un access token n'est pas accepté comme refresh token", async () => {
	const r = await call("POST", "/auth/refresh", { token: auth.access });
	assert.equal(r.status, 401);
});

test("logout : supprime la session (refresh et access invalidés)", async () => {
	const r = await call("POST", "/auth/logout", { token: auth.access });
	assert.equal(r.status, 204);
	assert.equal((await call("POST", "/auth/refresh", { token: auth.refresh })).status, 401);
	assert.equal((await call("POST", "/auth/logout", { token: auth.access })).status, 401);
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
