window.__ModuleLoader__.load({
	id: "dsh-personalization",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		// dsh's client bundler only exposes the classic React API, so we build
		// every node with React.createElement directly (no jsx-runtime).
		const e = react.createElement;

		/** Same-origin config endpoints exposed by the host half. */
		const CONFIG_ENDPOINT = "/personalization-config";
		const CONFIG_SAVE_ENDPOINT = "/personalization-config-save";

		/** Character ceilings; the GET config response echoes the authoritative values. */
		const FALLBACK_LIMITS = { nickname: 80, aiName: 80, instructions: 1500, persona: 2000 };

		/**
		 * Row styles. Inline-injected once per page like every dsh plugin bundle.
		 * All colors ride the host's --dsw-* design tokens so the panel matches
		 * both themes; layout mirrors the dsh settings look (label + hint, then
		 * rounded filled controls).
		 */
		const CSS_TAG = "dsh-personalization/section.css";
		const css = [
			".dshpz-root{display:flex;flex-direction:column;gap:28px;max-width:640px;}",
			".dshpz-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 0;border-bottom:1px solid var(--dsw-alias-border-l2)}",
			".dshpz-row:last-child{border-bottom:none}",
			".dshpz-text{display:flex;flex-direction:column;gap:4px;min-width:0}",
			".dshpz-title{font-size:14px;font-weight:500;color:var(--dsw-alias-label-primary)}",
			".dshpz-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}",
			".dshpz-switch{position:relative;width:36px;height:20px;border-radius:999px;background:var(--dsw-alias-label-dimmed);border:none;padding:0;cursor:pointer;transition:background .2s;flex-shrink:0}",
			".dshpz-switch[data-on='true']{background:#22c55e}",
			".dshpz-switch:disabled{opacity:.45;cursor:default}",
			".dshpz-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .2s}",
			".dshpz-switch[data-on='true'] .dshpz-knob{left:18px}",
			".dshpz-block{display:flex;flex-direction:column;gap:8px}",
			".dshpz-textarea{width:100%;box-sizing:border-box;min-height:96px;resize:vertical;padding:10px 12px;font-size:13px;line-height:20px;font-family:inherit;border-radius:10px;background:var(--dsw-alias-fill-l1);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);outline:none}",
			".dshpz-textarea:focus{border-color:var(--dsw-alias-brand-primary)}",
			".dshpz-textarea::placeholder{color:var(--dsw-alias-label-dimmed)}",
			".dshpz-counter{align-self:flex-end;font-size:11px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}",
			".dshpz-counter[data-over='true']{color:var(--dsw-alias-state-error-primary)}",
			".dshpz-card{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-fill-l1);padding:12px 14px;display:flex;flex-direction:column;gap:12px}",
			".dshpz-id-row{display:flex;align-items:center;justify-content:space-between;gap:12px}",
			".dshpz-id-label{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary);flex-shrink:0}",
			".dshpz-id-input{width:220px;box-sizing:border-box;padding:7px 10px;font-size:13px;text-align:right;border-radius:8px;background:var(--dsw-alias-fill-l2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);outline:none}",
			".dshpz-id-input:focus{border-color:var(--dsw-alias-brand-primary);text-align:left}",
			".dshpz-id-input::placeholder{color:var(--dsw-alias-label-dimmed)}",
			".dshpz-head{display:flex;align-items:center;justify-content:space-between;gap:12px}",
			".dshpz-head-text{display:flex;flex-direction:column;gap:2px;min-width:0}",
			".dshpz-edit{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--dsw-alias-label-secondary);background:none;border:none;padding:4px 6px;border-radius:6px;cursor:pointer;flex-shrink:0}",
			".dshpz-edit:hover{color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-fill-l1)}",
			".dshpz-edit svg{width:12px;height:12px;fill:currentColor}",
			".dshpz-preview{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word;max-height:96px;overflow:hidden}",
			".dshpz-preview-empty{font-size:13px;line-height:20px;color:var(--dsw-alias-label-dimmed)}",
			".dshpz-status{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);padding:24px 0}",
			".dshpz-status[data-kind='error']{color:var(--dsw-alias-state-error-primary)}",
			".dshpz-retry{font-size:12px;color:var(--dsw-alias-brand-primary);background:none;border:none;padding:0;cursor:pointer;text-decoration:underline}"
		].join("\n");
		if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${CSS_TAG}"]`) === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-personalization";
			tag.dataset.pluginCss = CSS_TAG;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		/** i18n namespace for this plugin's settings-section copy. */
		const LOCALE_NS = "settings.personalization";

		/** Bound locale translator; identity fallback keeps the panel crash-free. */
		function bindT(locale) {
			if (locale && typeof locale.bind === "function") return locale.bind(LOCALE_NS);
			return (key) => key;
		}

		/** Subscribe to the dsh locale snapshot and re-render on language switches. */
		function useLocaleSnapshot(locale) {
			return react.useSyncExternalStore(
				(callback) => locale.subscribe(callback),
				() => locale.getSnapshot(),
				() => locale.getSnapshot()
			);
		}

		/** Shared switch button (same geometry as the host's own toggles). */
		function SwitchButton(_ref) {
			const on = _ref.on;
			const disabled = _ref.disabled;
			const onClick = _ref.onClick;
			return e("button", {
				type: "button",
				className: "dshpz-switch",
				role: "switch",
				"aria-checked": String(on),
				"data-on": String(on),
				disabled,
				onClick,
				children: e("span", { className: "dshpz-knob" })
			});
		}

		/** Small pencil glyph used by the 编辑 buttons. */
		function PencilIcon() {
			return e("svg", { viewBox: "0 0 16 16", "aria-hidden": "true" },
				e("path", { d: "M11.5 1.5a2.1 2.1 0 0 1 3 3l-8.6 8.6-3.9 1 1-3.9 8.5-8.7z" })
			);
		}

		/** Char counter rendered under every multi-line editor. */
		function CharCounter(_ref2) {
			const value = _ref2.value;
			const limit = _ref2.limit;
			return e("span", { className: "dshpz-counter", "data-over": String((value || "").length > limit) },
				`${(value || "").length} / ${limit}`
			);
		}

		/**
		 * One collapsible big-text block (persona): a header
		 * with an 编辑 pencil that swaps the clamped read-only preview for a
		 * full textarea, mirroring the host's own settings look.
		 */
		function BigTextBlock(_ref3) {
			const t = _ref3.t;
			const title = _ref3.title;
			const hint = _ref3.hint;
			const emptyText = _ref3.emptyText;
			const value = _ref3.value;
			const limit = _ref3.limit;
			const disabled = _ref3.disabled;
			const onCommit = _ref3.onCommit;

			const [editing, setEditing] = react.useState(false);
			const [draft, setDraft] = react.useState(value || "");

			react.useEffect(() => {
				if (!editing) setDraft(value || "");
			}, [value, editing]);

			const open = () => {
				setDraft(value || "");
				setEditing(true);
			};
			const close = () => {
				setEditing(false);
				if ((draft || "") !== (value || "")) onCommit(draft);
			};

			return e("div", { className: "dshpz-block" },
				e("div", { className: "dshpz-head" },
					e("div", { className: "dshpz-head-text" },
						e("span", { className: "dshpz-title" }, title),
						hint ? e("span", { className: "dshpz-desc" }, hint) : null
					),
					e("button", {
						className: "dshpz-edit",
						type: "button",
						onClick: editing ? close : open
					},
						e(PencilIcon, null),
						editing ? t("done") : t("edit")
					)
				),
				editing
					? e(react.Fragment, null,
						e("textarea", {
							className: "dshpz-textarea",
							value: draft,
							placeholder: emptyText,
							maxLength: limit,
							autoFocus: true,
							onChange: (ev) => setDraft(ev.target.value),
							onBlur: () => { if ((draft || "") !== (value || "")) onCommit(draft); }
						}),
						e(CharCounter, { value: draft, limit })
					)
					: e("div", { className: "dshpz-card" },
						(value || "")
							? e("div", {
								className: "dshpz-preview",
								onClick: open,
								style: { cursor: "pointer" },
								title: t("edit")
							}, value)
							: e("div", { className: "dshpz-preview-empty", onClick: open, style: { cursor: "pointer" } }, emptyText)
					)
			);
		}

		/** The whole Personalization settings page this plugin contributes. */
		function PersonalizationSection(_ref4) {
			const locale = _ref4.locale;

			const snapshot = useLocaleSnapshot(locale);
			const t = bindT(locale);

			const [phase, setPhase] = react.useState("loading"); // loading | ready | error
			const [config, setConfig] = react.useState({
				enabled: true, nickname: "", aiName: "", instructions: "", persona: ""
			});
			const [limits, setLimits] = react.useState(FALLBACK_LIMITS);
			const [busy, setBusy] = react.useState(false);

			react.useEffect(() => {
				let alive = true;
				fetch(CONFIG_ENDPOINT)
					.then((res) => res.json())
					.then((body) => {
						if (!alive) return;
						if (body && body.ok && body.config) {
							setConfig({ ...config, ...body.config });
							if (body.limits && typeof body.limits === "object") setLimits({ ...FALLBACK_LIMITS, ...body.limits });
							setPhase("ready");
						} else {
							setPhase("error");
						}
					})
					.catch(() => { if (alive) setPhase("error"); });
				return () => { alive = false; };
			}, []);

			/** Persist one field; the server response is the source of truth. */
			const saveField = (patch) => {
				if (busy) return;
				setBusy(true);
				fetch(CONFIG_SAVE_ENDPOINT, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(patch)
				})
					.then((res) => res.json())
					.then((body) => {
						if (body && body.ok && body.config) setConfig({ ...config, ...body.config });
					})
					.catch(() => {})
					.finally(() => setBusy(false));
			};

			if (phase === "loading") {
				return e("div", { className: "dshpz-root" }, e("div", { className: "dshpz-status" }, t("loading")));
			}
			if (phase === "error") {
				return e("div", { className: "dshpz-root" },
					e("div", { className: "dshpz-status", "data-kind": "error" },
						t("loadError"), " ",
						e("button", { className: "dshpz-retry", type: "button", onClick: () => setPhase("loading") }, t("retry"))
					)
				);
			}

			return e("div", { className: "dshpz-root" },
				// Master switch — off stops the prompt injection entirely.
				e("div", { className: "dshpz-row" },
					e("div", { className: "dshpz-text" },
						e("div", { className: "dshpz-title" }, t("masterTitle")),
						e("div", { className: "dshpz-desc" }, t("masterDesc"))
					),
					e(SwitchButton, {
						on: config.enabled !== false,
						disabled: busy,
						onClick: () => saveField({ enabled: config.enabled === false })
					})
				),
				// Custom instructions — one textarea, hint, live counter.
				e("div", { className: "dshpz-block" },
					e("div", { className: "dshpz-head-text" },
						e("span", { className: "dshpz-title" }, t("instructionsTitle")),
						e("span", { className: "dshpz-desc" }, t("instructionsHint"))
					),
					e("textarea", {
						className: "dshpz-textarea",
						value: config.instructions || "",
						placeholder: t("instructionsPlaceholder"),
						maxLength: limits.instructions,
						disabled: busy,
						onChange: (ev) => setConfig({ ...config, instructions: ev.target.value }),
						onBlur: () => saveField({ instructions: config.instructions || "" })
					}),
					e(CharCounter, { value: config.instructions || "", limit: limits.instructions })
				),
				// Names & identity — two compact rows, input on the right.
				e("div", { className: "dshpz-block" },
					e("span", { className: "dshpz-title" }, t("identityTitle")),
					e("div", { className: "dshpz-card" },
						e("div", { className: "dshpz-id-row" },
							e("span", { className: "dshpz-id-label" }, t("nicknameLabel")),
							e("input", {
								className: "dshpz-id-input",
								type: "text",
								placeholder: t("nicknamePlaceholder"),
								maxLength: limits.nickname,
								value: config.nickname || "",
								disabled: busy,
								onChange: (ev) => setConfig({ ...config, nickname: ev.target.value }),
								onBlur: () => saveField({ nickname: config.nickname || "" })
							})
						),
						e("div", { className: "dshpz-id-row" },
							e("span", { className: "dshpz-id-label" }, t("aiNameLabel")),
							e("input", {
								className: "dshpz-id-input",
								type: "text",
								placeholder: t("aiNamePlaceholder"),
								maxLength: limits.aiName,
								value: config.aiName || "",
								disabled: busy,
								onChange: (ev) => setConfig({ ...config, aiName: ev.target.value }),
								onBlur: () => saveField({ aiName: config.aiName || "" })
							})
						)
					)
				),
				// Persona — collapsible big-text block.
				e(BigTextBlock, {
					t,
					title: t("personaTitle"),
					hint: t("personaHint"),
					emptyText: t("personaEmpty"),
					value: config.persona || "",
					limit: limits.persona,
					disabled: busy,
					onCommit: (text) => saveField({ persona: text })
				})
			);
		}

		/** Client services: slots registry plus the dsh locale service. */
		const inject = ["slots", "locale"];

		/**
		 * Client plugin body: register a whole settings section (sidebar entry +
		 * page) below the built-in Agent Presets section (order 20 → ours 25).
		 * @param ctx - client cordis context.
		 */
		function apply(ctx) {
			const locale = ctx.locale;
			locale && locale.register && locale.register(LOCALE_NS, {
				zh: {
					nav: "个性化",
					masterTitle: "启用个性化",
					masterDesc: "关闭后，以下所有个性化内容都不会注入对话",
					instructionsTitle: "自定义指令",
					instructionsHint: "给 AI 定几条规则，后续所有任务都生效",
					instructionsPlaceholder: "例如：回答先给结论再展开…",
					identityTitle: "称呼与身份",
					nicknameLabel: "AI 对你的称呼",
					nicknamePlaceholder: "暂无内容，点击添加",
					aiNameLabel: "AI 的名字",
					aiNamePlaceholder: "暂无内容，点击添加",
					personaTitle: "AI 的人设 / 人格描述",
					personaHint: "描述 AI 应该是什么样的角色与说话风格",
					personaEmpty: "暂无人设，点击「编辑」添加",
					edit: "编辑",
					done: "完成",
					loading: "正在加载个性化设置…",
					loadError: "个性化设置加载失败。",
					retry: "重试"
				},
				en: {
					nav: "Personalization",
					masterTitle: "Enable personalization",
					masterDesc: "When off, none of the content below is injected into conversations",
					instructionsTitle: "Custom instructions",
					instructionsHint: "Standing rules for the AI — applied to every task",
					instructionsPlaceholder: "e.g. lead with the conclusion, then elaborate…",
					identityTitle: "Names & identity",
					nicknameLabel: "What the AI calls you",
					nicknamePlaceholder: "Empty — click to add",
					aiNameLabel: "The AI's name",
					aiNamePlaceholder: "Empty — click to add",
					personaTitle: "AI persona / character",
					personaHint: "Describe the character and tone the AI should adopt",
					personaEmpty: "No persona yet — click Edit to add one",
					edit: "Edit",
					done: "Done",
					loading: "Loading personalization settings…",
					loadError: "Failed to load personalization settings.",
					retry: "Retry"
				}
			});

			const t = bindT(locale);
			ctx.slots.inject("settings.section", () =>
				ctx.slots.register(
					{
						name: "settings.section",
						id: "personalization",
						order: 25,
						label: () => t("nav")
					},
					(props) => e(PersonalizationSection, Object.assign({}, props, { locale }))
				)
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
