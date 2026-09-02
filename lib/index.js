/**
 * dsh-personalization: a DeepSeek Harness (dsh) bundle that lets the user
 * personalize their assistant from the settings UI — custom instructions,
 * what the assistant calls them, the assistant's own name, and a persona
 * description — and injects the content into EVERY agent turn's system
 * prompt, so it applies to all tasks.
 *
 * How it works: dsh mounts a `systemPrompt` service that keeps an ordered
 * registry of prompt sections. Sections with a function `text` provider are
 * re-evaluated at every assembly (each step of each turn), so we register one
 * section (`personalization:user`, order 1 — right after the deployment
 * persona at order 0) whose provider reads the persisted preferences. Saving
 * in the settings UI takes effect from the very next message; nothing needs
 * to restart.
 *
 * The preferences live in ~/.dsh/personalization.json. The settings page
 * (client half, lib/client.js) talks to this half over same-origin HTTP
 * endpoints (/personalization-config, /personalization-config-save).
 *
 * This module is also directly runnable for a self test:
 *
 *     node lib/index.js --self-test
 */
import { pathToFileURL } from "node:url";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { statSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

/** Plugin id; must match the cordis.patch.yml insert id. */
const name = "personalization";

/** Services required before this plugin can mount: web routes + prompt registry + settings. */
const inject = ["webServer", "systemPrompt", "settings"];

/** Same-origin endpoints the Personalization settings page (client half) talks to. */
const CONFIG_ENDPOINT = "/personalization-config";
const CONFIG_SAVE_ENDPOINT = "/personalization-config-save";

/** Optional per-machine settings file; every field may be omitted. */
const SETTINGS_PATH = resolve(homedir(), ".dsh", "personalization.json");

/** Identity of the injected prompt section.
 *  The name must NOT be `deployment:persona` — that global seat belongs to
 *  the harness itself and registering it from a global bundle fails loud.
 *  Order convention in dsh: -100 harness identity, 0 deployment persona,
 *  100+ tool guidance — 1 lands right after the persona, before tool docs. */
const SECTION_NAME = "personalization:user";
const SECTION_ORDER = 1;

/** Character ceilings, enforced here (host) and mirrored by the settings UI. */
const LIMITS = Object.freeze({
	nickname: 80,
	aiName: 80,
	instructions: 1500,
	persona: 2000
});

/** Default preferences: everything empty means the section renders nothing. */
const DEFAULT_SETTINGS = Object.freeze({
	/** Master switch; false stops the section from rendering at all. */
	enabled: true,
	/** What the assistant should call the user ("怎么称呼你"). */
	nickname: "",
	/** The assistant's own display name ("AI 的名字"). */
	aiName: "",
	/** Standing rules that apply to every task ("自定义指令"). */
	instructions: "",
		/** Freeform persona / character description ("人设 / 人格描述"). */
		persona: ""
});

/** Settings cache shared by the HTTP routes and the per-turn prompt provider.
 *  `statMtime` lets the provider notice manual edits to the JSON file without
 *  paying a full read on every turn — one stat() per assembly is the cost. */
let settingsCache;
let cacheStatMtime = null;
let cacheChecked = false;

/** Coerce one stored text field: strings are trimmed and length-clamped. */
function clampText(value, limit) {
	if (typeof value !== "string") return "";
	return value.trim().slice(0, limit);
}

/** Merge a stored record onto the defaults, field by field. */
function normalizeSettings(raw) {
	const obj = (raw && typeof raw === "object") ? raw : {};
	return {
		enabled: typeof obj.enabled === "boolean" ? obj.enabled : DEFAULT_SETTINGS.enabled,
		nickname: clampText(obj.nickname, LIMITS.nickname),
		aiName: clampText(obj.aiName, LIMITS.aiName),
		instructions: clampText(obj.instructions, LIMITS.instructions),
		persona: clampText(obj.persona, LIMITS.persona)
	};
}

/** Load ~/.dsh/personalization.json; missing or broken files keep defaults. */
async function loadSettings() {
	try {
		const info = await stat(SETTINGS_PATH);
		if (cacheChecked && settingsCache && info.mtimeMs === cacheStatMtime) return settingsCache;
		cacheStatMtime = info.mtimeMs;
		const raw = await readFile(SETTINGS_PATH, "utf8");
		settingsCache = normalizeSettings(JSON.parse(raw));
	} catch {
		// Missing file is the normal first-run path; malformed file keeps defaults.
		settingsCache = (settingsCache && cacheChecked) ? settingsCache : { ...DEFAULT_SETTINGS };
		cacheStatMtime = null;
	}
	cacheChecked = true;
	return settingsCache;
}

/** Synchronous variant for the prompt-section provider (cache + mtime stat). */
function loadSettingsSync() {
	let info;
	try {
		info = statSync(SETTINGS_PATH);
	} catch {
		return (settingsCache && cacheChecked) ? settingsCache : { ...DEFAULT_SETTINGS };
	}
	if (cacheChecked && settingsCache && info.mtimeMs === cacheStatMtime) return settingsCache;
	try {
		settingsCache = normalizeSettings(JSON.parse(readFileSync(SETTINGS_PATH, "utf8")));
		cacheStatMtime = info.mtimeMs;
	} catch {
		settingsCache = (settingsCache && cacheChecked) ? settingsCache : { ...DEFAULT_SETTINGS };
	}
	cacheChecked = true;
	return settingsCache;
}

/** Persist a partial patch (validated + clamped) and refresh the cache. */
async function saveSettings(patch) {
	const current = await loadSettings();
	const raw = (patch && typeof patch === "object") ? patch : {};
	const next = normalizeSettings({
		enabled: typeof raw.enabled === "boolean" ? raw.enabled : current.enabled,
		nickname: raw.nickname !== undefined ? raw.nickname : current.nickname,
		aiName: raw.aiName !== undefined ? raw.aiName : current.aiName,
		instructions: raw.instructions !== undefined ? raw.instructions : current.instructions,
		persona: raw.persona !== undefined ? raw.persona : current.persona
	});
	await mkdir(resolve(SETTINGS_PATH, ".."), { recursive: true });
	await writeFile(SETTINGS_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
	try {
		const info = await stat(SETTINGS_PATH);
		cacheStatMtime = info.mtimeMs;
	} catch {
		// The write just succeeded; a stat failure here changes nothing.
	}
	settingsCache = next;
	cacheChecked = true;
	return next;
}

/** True when at least one personalization field holds content. */
function hasContent(s) {
	return Boolean(s.nickname || s.aiName || s.instructions || s.persona);
}

/** Quote one line of user text so it cannot forge list markers in the prompt. */
function quoteLine(text) {
	return text.replace(/\r\n/g, "\n").split("\n").map((line) => `- ${line}`).join("\n");
}

/**
 * Render the personalization prompt section. Only non-empty parts are
 * emitted; when nothing is configured (or the master switch is off) the
 * empty string is returned and dsh drops the section from the prompt.
 * @param {object} s - normalized settings snapshot.
 * @returns {string}
 */
function buildSectionText(s) {
	if (!s || !s.enabled || !hasContent(s)) return "";
	const blocks = [];
	blocks.push(
		"Personalization (configured by the user in dsh settings; applies to every task and every reply):"
	);
	if (s.nickname || s.aiName) {
		const lines = [];
		if (s.nickname) lines.push(quoteLine(`Address the user as: ${s.nickname}`));
		if (s.aiName) lines.push(quoteLine(`Your name is: ${s.aiName} — use it when referring to yourself`));
		blocks.push("Addressing\n" + lines.join("\n"));
	}
	if (s.persona) blocks.push("Your persona / character (stay in character)\n" + quoteLine(s.persona));
	if (s.instructions) blocks.push("Standing instructions from the user\n" + quoteLine(s.instructions));
	return blocks.join("\n\n");
}

/** Read one request body as UTF-8 text (small payloads only). */
function readBody(req) {
	return new Promise((resolveBody, rejectBody) => {
		const chunks = [];
		req.on("data", (chunk) => {
			chunks.push(chunk);
			if (chunks.reduce((sum, c) => sum + c.length, 0) > 64 * 1024) {
				rejectBody(new Error("request body too large"));
				req.destroy();
			}
		});
		req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
		req.on("error", rejectBody);
	});
}

/** Cordis plugin entry: register the prompt section + serve the settings page. */
function apply(ctx) {
	/** The prompt section: re-evaluated at every assembly, so saving in the
	 *  settings UI applies from the user's very next message. */
	ctx.effect(() => ctx.systemPrompt.section({
		name: SECTION_NAME,
		order: SECTION_ORDER,
		text: () => buildSectionText(loadSettingsSync())
	}), "personalization: prompt section");

	/** GET: current preferences for the Personalization settings page. */
	ctx.effect(() => {
		const dispose = ctx.webServer.register({
			kind: "prefix",
			path: CONFIG_ENDPOINT,
			handler: async (req, res) => {
				const url = new URL(req.url ?? "/", "http://x");
				if (req.method !== "GET" || url.pathname !== CONFIG_ENDPOINT) {
					res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
					res.end(JSON.stringify({ ok: false, error: "not found" }));
					return;
				}
				try {
					res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
					res.end(JSON.stringify({ ok: true, config: await loadSettings(), limits: LIMITS }));
				} catch (error) {
					res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
					res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }));
				}
			}
		});
		return dispose;
	}, "personalization: config read route");

	/** POST: merge a partial patch into the persisted preferences. */
	ctx.effect(() => {
		const dispose = ctx.webServer.register({
			kind: "prefix",
			path: CONFIG_SAVE_ENDPOINT,
			handler: async (req, res) => {
				const url = new URL(req.url ?? "/", "http://x");
				if (req.method !== "POST" || url.pathname !== CONFIG_SAVE_ENDPOINT) {
					res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
					res.end(JSON.stringify({ ok: false, error: "not found" }));
					return;
				}
				try {
					const patch = JSON.parse((await readBody(req)) || "{}");
					const config = await saveSettings(patch);
					res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
					res.end(JSON.stringify({ ok: true, config, limits: LIMITS }));
				} catch (error) {
					res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
					res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }));
				}
			}
		});
		return dispose;
	}, "personalization: config write route");

	/** A quiet startup line helps users confirm the section is mounted. */
	ctx.effect(() => {
		try {
			ctx?.logger?.("personalization")?.info?.(
				`prompt section "${SECTION_NAME}" (order ${SECTION_ORDER}) registered`
			);
		} catch {
			// Logging is best-effort only.
		}
	}, "personalization: startup log");
}

export { name, inject, apply, buildSectionText, normalizeSettings, LIMITS, SECTION_NAME, SECTION_ORDER, SETTINGS_PATH };

/** Standalone smoke test: render the prompt section and exit (run: node lib/index.js --self-test). */
async function selfTest() {
	const show = process.argv.includes("--sample");
	const snapshot = show
		? normalizeSettings({
			nickname: "阿伟",
			aiName: "小深",
			instructions: "回答先给结论，再展开细节。\n代码注释用中文。",
			persona: "严谨但不失幽默的资深工程师，讨厌空话。"
		})
		: normalizeSettings(JSON.parse(await readFile(SETTINGS_PATH, "utf8").catch(() => "{}")));
	console.log(`[dsh-personalization] settings file: ${SETTINGS_PATH}`);
	console.log(`[dsh-personalization] section: ${SECTION_NAME} (order ${SECTION_ORDER})`);
	console.log("[dsh-personalization] rendered prompt section:");
	console.log("-----");
	const text = buildSectionText(snapshot);
	console.log(text || "(empty — nothing configured)");
	console.log("-----");
	if (!text && !show) {
		console.log("[dsh-personalization] tip: run `node lib/index.js --self-test --sample` to preview with sample data.");
	}
}

const invokedDirectly = (() => {
	try {
		if (process.argv.includes("--self-test")) return true;
		const entry = resolve(process.argv[1] ?? "");
		return entry !== "" && import.meta.url === pathToFileURL(entry).href;
	} catch {
		return false;
	}
})();

if (invokedDirectly) {
	await selfTest();
}
