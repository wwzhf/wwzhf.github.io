<script lang="ts">
	import { onMount } from "svelte";

	// /write/ 在线 Markdown 编辑器（复刻 fqzlr /write/）
	// 功能：导入 MD、格式工具栏、字数统计、草稿（localStorage）、发布（GitHub Contents API + PAT）

	type Mode = "new" | "edit";
	type Collection = "posts" | "pages" | "dynamic";

	const REPO = "wwzhf/wwzhf.github.io";
	const BRANCH = "master";
	const PAT_KEY = "write-github-pat";
	const DRAFT_KEY = "write-draft";
	const DRAFT_META_KEY = "write-draft-meta";

	let mode: Mode = $state("new");
	let collection: Collection = $state("posts");
	let entry = $state("");
	let loading = $state(false);
	let toast: { type: string; text: string } | null = $state(null);

	let title = $state("");
	let slug = $state("");
	let cover = $state("");
	let description = $state("");
	let tagsText = $state("");
	let category = $state("");
	let published = $state(new Date().toISOString().slice(0, 10));
	let draft = $state(false);
	let pinned = $state(false);
	let content = $state("");
	let showPreview = $state(false);
	let hasKey = $state(false);
	let keyUser = $state("");

	const charCount = $derived(content.length);
	const wordCount = $derived(content.trim() ? content.trim().split(/\s+/).length : 0);
	const canPublish = $derived(
		hasKey && title.trim().length > 0 && content.trim().length > 0,
	);

	let textareaEl: HTMLTextAreaElement | null = $state(null);

	function readUrl() {
		const params = new URLSearchParams(window.location.search);
		mode = (params.get("mode") as Mode) || "new";
		collection = (params.get("collection") as Collection) || "posts";
		entry = params.get("entry") || "";
	}

	function insertText(before: string, after = "", placeholder = "") {
		if (!textareaEl) return;
		const start = textareaEl.selectionStart;
		const end = textareaEl.selectionEnd;
		const selected = content.slice(start, end) || placeholder;
		const newText = before + selected + after;
		content = content.slice(0, start) + newText + content.slice(end);
		setTimeout(() => {
			if (!textareaEl) return;
			const pos = start + before.length + selected.length;
			textareaEl.focus();
			textareaEl.setSelectionRange(pos, pos);
		}, 0);
	}

	function wrapLine(prefix: string) {
		if (!textareaEl) return;
		const start = textareaEl.selectionStart;
		const end = textareaEl.selectionEnd;
		const before = content.slice(0, start);
		const lineStart = before.lastIndexOf("\n") + 1;
		content = content.slice(0, lineStart) + prefix + content.slice(lineStart);
		setTimeout(() => {
			if (!textareaEl) return;
			textareaEl.focus();
			textareaEl.setSelectionRange(start + prefix.length, end + prefix.length);
		}, 0);
	}

	function doBold() { insertText("**", "**", "加粗文本"); }
	function doItalic() { insertText("*", "*", "斜体文本"); }
	function doStrike() { insertText("~~", "~~", "删除线"); }
	function doH2() { wrapLine("## "); }
	function doH3() { wrapLine("### "); }
	function doQuote() { wrapLine("> "); }
	function doInlineCode() { insertText("`", "`", "代码"); }
	function doCodeBlock() { insertText("\n```\n", "\n```\n", "代码块内容"); }
	function doUL() { wrapLine("- "); }
	function doOL() { wrapLine("1. "); }
	function doLink() { insertText("[", "](https://)", "链接文字"); }
	function doImage() { insertText("![", "](https://)", "图片描述"); }
	function doHR() { insertText("\n---\n", "", ""); }

	function onKeyDown(e: KeyboardEvent) {
		if (!(e.ctrlKey || e.metaKey)) return;
		const k = e.key.toLowerCase();
		if (k === "b") {
			e.preventDefault();
			doBold();
		} else if (k === "i") {
			e.preventDefault();
			doItalic();
		} else if (k === "k") {
			e.preventDefault();
			doLink();
		} else if (k === "s") {
			e.preventDefault();
			saveDraft();
		}
	}

	function importMD() {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".md,.markdown,.mdx,text/markdown,text/plain";
		input.onchange = async () => {
			const file = input.files && input.files[0];
			if (!file) return;
			const text = await file.text();
			const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
			if (fmMatch) {
				const fm = fmMatch[1];
				const body = fmMatch[2];
				const get = (k: string): string => {
					const m = fm.match(new RegExp("^" + k + ":\\s*(.+(?:\\n\\s+.+)*)", "m"));
					return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
				};
				title = get("title") || title;
				slug = get("slug") || slug;
				cover = get("image") || get("cover") || cover;
				description = get("description") || get("desc") || description;
				tagsText = get("tags") || tagsText;
				category = get("category") || category;
				published = get("published") || get("date") || published;
				pinned = get("pinned") === "true";
				draft = get("draft") === "true";
				content = body.trim();
			} else {
				content = text;
			}
			showToast("success", "已导入");
		};
		input.click();
	}

	function saveDraft() {
		try {
			localStorage.setItem(DRAFT_KEY, content);
			localStorage.setItem(
				DRAFT_META_KEY,
				JSON.stringify({
					title,
					slug,
					cover,
					description,
					tagsText,
					category,
					published,
					draft,
					pinned,
					mode,
					collection,
					entry,
					savedAt: new Date().toISOString(),
				}),
			);
			showToast("success", "草稿已保存到 localStorage");
		} catch (e) {
			showToast("error", "保存失败：" + (e as Error).message);
		}
	}

	function loadDraft(): boolean {
		try {
			const metaStr = localStorage.getItem(DRAFT_META_KEY);
			const body = localStorage.getItem(DRAFT_KEY);
			if (!metaStr || !body) return false;
			const m = JSON.parse(metaStr);
			const saved = new Date(m.savedAt);
			const ago = Math.round((Date.now() - saved.getTime()) / 60000);
			const timeStr =
				ago < 1
					? "刚刚"
					: ago < 60
						? ago + " 分钟前"
						: Math.round(ago / 60) + " 小时前";
			if (
				!confirm(
					"检测到" +
						timeStr +
						"保存的草稿：\n标题：" +
						(m.title || "(无)") +
						"\n是否恢复？\n（点取消将丢弃草稿）",
				)
			)
				return false;
			title = m.title || "";
			slug = m.slug || "";
			cover = m.cover || "";
			description = m.description || "";
			tagsText = m.tagsText || "";
			category = m.category || "";
			published = m.published || new Date().toISOString().slice(0, 10);
			draft = !!m.draft;
			pinned = !!m.pinned;
			content = body;
			return true;
		} catch {
			return false;
		}
	}

	function clearDraft() {
		if (!confirm("确认清空本地草稿？")) return;
		localStorage.removeItem(DRAFT_KEY);
		localStorage.removeItem(DRAFT_META_KEY);
		showToast("info", "草稿已清空");
	}

	function importKey() {
		const pat = prompt(
			"请输入 GitHub Personal Access Token (classic)\n需要 repo 权限。\nPAT 将仅保存在浏览器 localStorage 中。",
		);
		if (!pat || !pat.trim()) return;
		localStorage.setItem(PAT_KEY, pat.trim());
		void checkKey();
		showToast("success", "密钥已导入");
	}

	function clearKey() {
		if (!confirm("确认清除已保存的 GitHub Token？")) return;
		localStorage.removeItem(PAT_KEY);
		hasKey = false;
		keyUser = "";
		showToast("info", "密钥已清除");
	}

	async function checkKey() {
		const pat = localStorage.getItem(PAT_KEY);
		if (!pat) {
			hasKey = false;
			keyUser = "";
			return;
		}
		try {
			const res = await fetch("https://api.github.com/user", {
				headers: { Authorization: "token " + pat },
			});
			if (res.ok) {
				const u = await res.json();
				hasKey = true;
				keyUser = u.login;
			} else {
				hasKey = false;
				keyUser = "";
				showToast("error", "Token 无效或已过期");
			}
		} catch {
			hasKey = true;
			keyUser = "未知";
		}
	}

	function titleToSlug(t: string): string {
		return t
			.trim()
			.toLowerCase()
			.replace(/[\s_]+/g, "-")
			.replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "")
			.slice(0, 60);
	}

	function getTargetPath(): string {
		if (collection === "posts") {
			const finalSlug = slug || titleToSlug(title);
			return "src/content/posts/" + (finalSlug || "untitled") + ".md";
		}
		if (collection === "dynamic") {
			const finalSlug = slug || titleToSlug(title) || ("dynamic-" + Date.now());
			return "src/content/dynamic/" + finalSlug + ".json";
		}
		return "src/content/spec/" + (entry || slug || titleToSlug(title) || "untitled") + ".md";
	}

	function buildFrontmatter(): string {
		const lines: string[] = ["---"];
		lines.push("title: " + JSON.stringify(title));
		if (slug) lines.push("slug: " + slug);
		if (cover) lines.push("image: " + JSON.stringify(cover));
		if (description) lines.push("description: " + JSON.stringify(description));
		if (tagsText.trim()) {
			const tags = tagsText
				.split(/[,，]/)
				.map((t) => t.trim())
				.filter(Boolean);
			lines.push("tags: " + JSON.stringify(tags));
		}
		if (category.trim()) lines.push("category: " + JSON.stringify(category.trim()));
		lines.push("published: " + published);
		if (draft) lines.push("draft: true");
		if (pinned) lines.push("pinned: true");
		lines.push("---", "");
		return lines.join("\n");
	}

	async function publish() {
		if (!canPublish) {
			showToast("error", "请先导入密钥并填写标题/内容");
			return;
		}
		const pat = localStorage.getItem(PAT_KEY);
		if (!pat) return;

		const path = getTargetPath();
		const body = buildFrontmatter() + content;
		const contentBase64 = btoa(unescape(encodeURIComponent(body)));
		const message = (draft ? "draft: " : "") + title + " via /write/";
		const apiUrl =
			"https://api.github.com/repos/" + REPO + "/contents/" + path + "?ref=" + BRANCH;

		let sha: string | undefined;
		try {
			const getRes = await fetch(apiUrl, {
				headers: { Authorization: "token " + pat },
			});
			if (getRes.ok) {
				const data = await getRes.json();
				sha = data.sha;
			}
		} catch {
			/* ignore */
		}

		showToast("info", "正在提交到 GitHub...");
		try {
			const payload: { [k: string]: unknown } = {
				message,
				content: contentBase64,
				branch: BRANCH,
			};
			if (sha) payload.sha = sha;

			const putRes = await fetch(
				"https://api.github.com/repos/" + REPO + "/contents/" + path,
				{
					method: "PUT",
					headers: {
						Authorization: "token " + pat,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(payload),
				},
			);

			if (putRes.ok) {
				const data = await putRes.json();
				showToast(
					"success",
					"发布成功！\n提交：" +
						data.commit.sha.slice(0, 7) +
						"\n文件：" +
						path,
				);
			} else {
				const err = await putRes.json().catch(() => ({}));
				showToast(
					"error",
					"发布失败：" + putRes.status + " " + (err.message || JSON.stringify(err)),
				);
			}
		} catch (e) {
			showToast("error", "网络错误：" + (e as Error).message);
		}
	}

	async function loadFromGithub() {
		if (mode !== "edit" || !entry) return;
		const pat = localStorage.getItem(PAT_KEY);
		if (!pat) {
			showToast("info", "编辑模式需要先导入 GitHub Token");
			return;
		}
		const path = getTargetPath();
		loading = true;
		try {
			const res = await fetch(
				"https://api.github.com/repos/" +
					REPO +
					"/contents/" +
					path +
					"?ref=" +
					BRANCH,
				{ headers: { Authorization: "token " + pat } },
			);
			if (!res.ok) {
				showToast("error", "加载失败：" + res.status);
				loading = false;
				return;
			}
			const data = await res.json();
			const text = atob(data.content.replace(/\n/g, ""));
			const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
			if (fmMatch) {
				const fm = fmMatch[1];
				const body = fmMatch[2];
				const get = (k: string): string => {
					const m = fm.match(new RegExp("^" + k + ":\\s*(.+(?:\\n\\s+.+)*)", "m"));
					return m ? m[1].trim().replace(/^["']|["']$/g, "") : "";
				};
				title = get("title") || "";
				slug = get("slug") || entry;
				cover = get("image") || get("cover") || "";
				description = get("description") || "";
				tagsText = get("tags") || "";
				category = get("category") || "";
				published = get("published") || get("date") || new Date().toISOString().slice(0, 10);
				draft = get("draft") === "true";
				pinned = get("pinned") === "true";
				content = body.trim();
			} else {
				content = text;
			}
			showToast("success", "已加载原文件");
		} catch (e) {
			showToast("error", "加载失败：" + (e as Error).message);
		}
		loading = false;
	}

	function showToast(type: string, text: string) {
		toast = { type, text };
		setTimeout(() => {
			if (toast && toast.text === text) toast = null;
		}, 5000);
	}

	function goBack() {
		if (window.history.length > 1) window.history.back();
		else window.location.href = "/";
	}

	// 用 String.fromCharCode 拼接 HTML 标签，避开 Svelte 5 parser 对 JS 字符串中 < > 的误判
	const LT = String.fromCharCode(60);
	const GT = String.fromCharCode(62);
	const AMP = "&amp;";
	const LT_ENT = "&lt;";
	const GT_ENT = "&gt;";
	const PRE_OPEN = LT + "pre" + GT + LT + "code" + GT;
	const PRE_CLOSE = LT + "/code" + GT + LT + "/pre" + GT;
	const H1_OPEN = LT + "h1" + GT;
	const H1_CLOSE = LT + "/h1" + GT;
	const H2_OPEN = LT + "h2" + GT;
	const H2_CLOSE = LT + "/h2" + GT;
	const H3_OPEN = LT + "h3" + GT;
	const H3_CLOSE = LT + "/h3" + GT;
	const H4_OPEN = LT + "h4" + GT;
	const H4_CLOSE = LT + "/h4" + GT;
	const H5_OPEN = LT + "h5" + GT;
	const H5_CLOSE = LT + "/h5" + GT;
	const H6_OPEN = LT + "h6" + GT;
	const H6_CLOSE = LT + "/h6" + GT;
	const BQ_OPEN = LT + "blockquote" + GT;
	const BQ_CLOSE = LT + "/blockquote" + GT;
	const P_OPEN = LT + "p" + GT;
	const P_CLOSE = LT + "/p" + GT;
	const UL_OPEN = LT + "ul" + GT;
	const UL_CLOSE = LT + "/ul" + GT;
	const OL_OPEN = LT + "ol" + GT;
	const OL_CLOSE = LT + "/ol" + GT;
	const LI_OPEN = LT + "li" + GT;
	const LI_CLOSE = LT + "/li" + GT;
	const HR = LT + "hr/" + GT;
	const CODE_OPEN = LT + "code" + GT;
	const CODE_CLOSE = LT + "/code" + GT;

	function escapeHtml(s: string): string {
		return s
			.replace(/&/g, AMP)
			.replace(/\u003c/g, LT_ENT)
			.replace(/\u003e/g, GT_ENT);
	}

	function inlineMd(s: string): string {
		return escapeHtml(s);
	}

	function renderPreview(text: string): string {
		return P_OPEN + escapeHtml(text) + P_CLOSE;
	}

	// 以下是原 renderPreview 实现，先注释掉

	// 初始化（onMount）
// 从"编辑本页"注入的数据填充表单（localStorage，无需 GitHub Token）
		const EDIT_KEY = "write-edit-article";
		function fillFromEditData(d: any) {
			title = d.title || "";
			slug = d.slug || d.entry || "";
			cover = d.cover || "";
			description = d.description || "";
			tagsText = d.tags || "";
			category = d.category || "";
			published = d.published || new Date().toISOString().slice(0, 10);
			draft = !!d.draft;
			pinned = !!d.pinned;
			content = d.body || "";
			if (d.collection) collection = d.collection;
			if (d.entry) entry = d.entry;
		}

		function start() {
			readUrl();
			checkKey();
			// 编辑模式：优先加载"编辑本页"注入的文章数据（localStorage），无需 GitHub Token
			if (mode === "edit") {
				const injected = localStorage.getItem(EDIT_KEY);
				if (injected) {
					try {
						const d = JSON.parse(injected);
						fillFromEditData(d);
						localStorage.removeItem(EDIT_KEY);
						showToast("success", "已加载当前文章，可直接编辑");
						return;
					} catch {
						/* 解析失败则继续走草稿/GitHub 流程 */
					}
				}
			}
			const hasDraft = localStorage.getItem(DRAFT_KEY);
			if (hasDraft) loadDraft();
			else if (mode === "edit") loadFromGithub();
		}
		onMount(start);
</script>

<div class="write-page">
	<div class="write-toolbar">
		<button class="tb-btn" onclick={goBack} title="返回列表">
			<span class="tb-icon">←</span>
			<span>返回列表</span>
		</button>
		<button class="tb-btn" onclick={importMD} title="导入本地 .md 文件">
			<span class="tb-icon">⬆</span>
			<span>导入MD</span>
		</button>
		<button
			class="tb-btn"
			class:tb-active={showPreview}
			onclick={() => (showPreview = !showPreview)}
			title="预览"
		>
			<span class="tb-icon">◉</span>
			<span>预览</span>
		</button>
		<button class="tb-btn tb-primary" onclick={saveDraft} title="保存到 localStorage（Ctrl+S）">
			<span class="tb-icon">💾</span>
			<span>保存草稿</span>
		</button>
		{#if hasKey}
			<button class="tb-btn" onclick={clearKey} title="清除已保存的 Token">
				<span class="tb-icon">🔑</span>
				<span>已导入密钥 {keyUser}</span>
			</button>
		{:else}
			<button class="tb-btn tb-accent" onclick={importKey} title="需要 GitHub Token 才能发布">
				<span class="tb-icon">🔑</span>
				<span>导入密钥</span>
			</button>
		{/if}
		<button
			class="tb-btn tb-accent"
			disabled={!canPublish}
			onclick={publish}
			title={canPublish ? "提交到 GitHub 仓库" : "需要先导入密钥并填写标题/内容"}
		>
			<span class="tb-icon">⬆</span>
			<span>需密钥</span>
		</button>
	</div>

	<input
		type="text"
		class="title-input"
		placeholder="输入文章标题..."
		bind:value={title}
	/>

	<div class="format-toolbar">
		<button class="fmt-btn" onclick={doBold} title="加粗 (Ctrl+B)"><b>B</b></button>
		<button class="fmt-btn" onclick={doItalic} title="斜体 (Ctrl+I)"><i>I</i></button>
		<button class="fmt-btn" onclick={doStrike} title="删除线"><s>S</s></button>
		<span class="fmt-sep"></span>
		<button class="fmt-btn" onclick={doH2} title="二级标题">H2</button>
		<button class="fmt-btn" onclick={doH3} title="三级标题">H3</button>
		<span class="fmt-sep"></span>
		<button class="fmt-btn" onclick={doQuote} title="引用">"</button>
		<button class="fmt-btn" onclick={doInlineCode} title="行内代码">‹›</button>
		<button class="fmt-btn" onclick={doCodeBlock} title="代码块">{'{}'}</button>
		<span class="fmt-sep"></span>
		<button class="fmt-btn" onclick={doUL} title="无序列表">• ≡</button>
		<button class="fmt-btn" onclick={doOL} title="有序列表">1.</button>
		<span class="fmt-sep"></span>
		<button class="fmt-btn" onclick={doLink} title="链接 (Ctrl+K)">🔗</button>
		<button class="fmt-btn" onclick={doImage} title="图片">🖼</button>
		<span class="fmt-sep"></span>
		<button class="fmt-btn" onclick={doHR} title="分割线">—</button>
	</div>

	{#if showPreview}
		<div class="preview-area">{@html renderPreview(content)}</div>
	{:else}
		<textarea
			bind:this={textareaEl}
			class="editor-area"
			placeholder={`开始写作... 支持 Markdown 语法\n快捷键: Ctrl+B 加粗 / Ctrl+I 斜体 / Ctrl+K 链接 / Ctrl+S 保存草稿`}
			bind:value={content}
			onkeydown={onKeyDown}
		></textarea>
	{/if}

	<div class="status-bar">
		<span>{charCount} 字 · {wordCount} 词</span>
		<span class="shortcuts">Ctrl+B 加粗 | Ctrl+I 斜体 | Ctrl+K 链接 | Ctrl+S 保存草稿</span>
	</div>

	{#if !hasKey}
		<div class="key-warning">
			⚠ 请先点击工具栏「导入密钥」按钮导入 GitHub Token（需要 repo 权限），否则只能保存为本地草稿。
		</div>
	{/if}

	<details class="meta-form">
		<summary>📋 元数据（点击展开）</summary>
		<div class="meta-grid">
			<label>
				<span>文章 Slug</span>
				<input type="text" bind:value={slug} placeholder="留空将自动从标题生成" />
			</label>
			<label>
				<span>封面图片 URL</span>
				<input type="text" bind:value={cover} placeholder="https://example.com/cover.jpg" />
			</label>
			<label>
				<span>文章描述</span>
				<input
					type="text"
					bind:value={description}
					placeholder="简短描述文章内容，用于SEO和列表展示"
				/>
			</label>
			<label>
				<span>标签（逗号分隔）</span>
				<input type="text" bind:value={tagsText} placeholder="Astro, 博客, 教程" />
			</label>
			<label>
				<span>分类</span>
				<input type="text" bind:value={category} placeholder="教程" />
			</label>
			<label>
				<span>发布日期</span>
				<input type="date" bind:value={published} />
			</label>
			<label class="check">
				<input type="checkbox" bind:checked={draft} />
				<span>草稿（不发布）</span>
			</label>
			<label class="check">
				<input type="checkbox" bind:checked={pinned} />
				<span>置顶文章</span>
			</label>
		</div>
		<div class="meta-actions">
			<button class="tb-btn" onclick={clearDraft} title="清除 localStorage 草稿">清空草稿</button>
			<button class="tb-btn" onclick={() => navigator.clipboard.writeText(content)}>
				复制正文
			</button>
			<button
				class="tb-btn"
				onclick={() => {
					const blob = new Blob([content], { type: "text/markdown" });
					const a = document.createElement("a");
					a.href = URL.createObjectURL(blob);
					a.download = (slug || titleToSlug(title) || "article") + ".md";
					a.click();
				}}
			>
				导出 .md
			</button>
		</div>
	</details>

	{#if toast}
		<div
			class="toast"
			class:toast-success={toast.type === "success"}
			class:toast-error={toast.type === "error"}
		>
			{toast.text}
		</div>
	{/if}

	{#if loading}<div class="loading-mask">加载中...</div>{/if}
</div>

<style>
	.write-page {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.write-toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0.5rem;
		background: var(--card-bg, #fff);
		border: 1px solid var(--line-divider, #e5e7eb);
		border-radius: 0.75rem;
	}
	.tb-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.4rem 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		background: transparent;
		border: 1px solid var(--line-divider, #e5e7eb);
		border-radius: 0.5rem;
		color: inherit;
		cursor: pointer;
		transition: all 0.15s;
	}
	.tb-btn:hover:not(:disabled) {
		background: var(--btn-regular-bg-hover, #f3f4f6);
		border-color: var(--primary, #10b981);
	}
	.tb-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.tb-btn.tb-primary {
		background: var(--primary, #10b981);
		color: #fff;
		border-color: var(--primary, #10b981);
	}
	.tb-btn.tb-active {
		background: var(--primary, #10b981);
		color: #fff;
		border-color: var(--primary, #10b981);
	}
	.tb-btn.tb-accent {
		border-color: #f59e0b;
		color: #d97706;
	}
	:global(.dark) .tb-btn.tb-accent {
		color: #fbbf24;
	}
	.tb-icon {
		font-size: 1rem;
		line-height: 1;
	}
	.title-input {
		width: 100%;
		padding: 0.75rem 1rem;
		font-size: 1.25rem;
		font-weight: 600;
		background: var(--card-bg, #fff);
		border: 1px solid var(--line-divider, #e5e7eb);
		border-radius: 0.5rem;
		color: inherit;
		outline: none;
	}
	.title-input:focus {
		border-color: var(--primary, #10b981);
	}
	.format-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem;
		padding: 0.4rem 0.5rem;
		background: var(--card-bg, #fff);
		border: 1px solid var(--line-divider, #e5e7eb);
		border-radius: 0.5rem;
	}
	.fmt-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 2rem;
		height: 2rem;
		padding: 0 0.4rem;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 0.375rem;
		color: inherit;
		cursor: pointer;
		font-size: 0.875rem;
	}
	.fmt-btn:hover {
		background: var(--btn-regular-bg-hover, #f3f4f6);
		border-color: var(--line-divider, #e5e7eb);
	}
	.fmt-sep {
		width: 1px;
		height: 1.25rem;
		background: var(--line-divider, #e5e7eb);
		margin: 0 0.25rem;
	}
	.editor-area {
		width: 100%;
		min-height: 50vh;
		padding: 1rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.95rem;
		line-height: 1.7;
		background: var(--card-bg, #fff);
		border: 1px solid var(--line-divider, #e5e7eb);
		border-radius: 0.5rem;
		color: inherit;
		outline: none;
		resize: vertical;
	}
	.editor-area:focus {
		border-color: var(--primary, #10b981);
	}
	.preview-area {
		min-height: 50vh;
		padding: 1rem 1.25rem;
		background: var(--card-bg, #fff);
		border: 1px solid var(--line-divider, #e5e7eb);
		border-radius: 0.5rem;
	}
	.preview-area :global(h1),
	.preview-area :global(h2),
	.preview-area :global(h3) {
		margin: 1em 0 0.5em;
		font-weight: 700;
	}
	.preview-area :global(p) {
		margin: 0.5em 0;
		line-height: 1.7;
	}
	.preview-area :global(blockquote) {
		margin: 0.5em 0;
		padding: 0.5em 1em;
		border-left: 3px solid var(--primary, #10b981);
		background: var(--btn-regular-bg, #f3f4f6);
	}
	.preview-area :global(code) {
		padding: 0.15em 0.35em;
		background: var(--btn-regular-bg, #f3f4f6);
		border-radius: 0.25rem;
		font-size: 0.9em;
	}
	.preview-area :global(pre) {
		padding: 0.75em 1em;
		background: var(--btn-regular-bg, #f3f4f6);
		border-radius: 0.5rem;
		overflow-x: auto;
	}
	.preview-area :global(pre code) {
		padding: 0;
		background: transparent;
	}
	.preview-area :global(ul),
	.preview-area :global(ol) {
		padding-left: 1.5em;
		margin: 0.5em 0;
	}
	.preview-area :global(hr) {
		border: 0;
		border-top: 1px solid var(--line-divider, #e5e7eb);
		margin: 1.5em 0;
	}
	.preview-area :global(img) {
		max-width: 100%;
		border-radius: 0.5rem;
	}
	.status-bar {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: var(--content-meta, #6b7280);
	}
	.key-warning {
		padding: 0.6rem 0.9rem;
		background: #fef3c7;
		color: #92400e;
		border-radius: 0.5rem;
		font-size: 0.85rem;
	}
	:global(.dark) .key-warning {
		background: #422006;
		color: #fde68a;
	}
	.meta-form {
		background: var(--card-bg, #fff);
		border: 1px solid var(--line-divider, #e5e7eb);
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
	}
	.meta-form summary {
		cursor: pointer;
		font-weight: 500;
		padding: 0.25rem 0;
	}
	.meta-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 0.6rem;
		margin-top: 0.6rem;
	}
	.meta-grid label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.8rem;
	}
	.meta-grid label.check {
		flex-direction: row;
		align-items: center;
		gap: 0.4rem;
		align-self: end;
	}
	.meta-grid input[type="text"],
	.meta-grid input[type="date"] {
		padding: 0.4rem 0.6rem;
		background: var(--card-bg, #fff);
		border: 1px solid var(--line-divider, #e5e7eb);
		border-radius: 0.375rem;
		color: inherit;
		font-size: 0.875rem;
		outline: none;
	}
	.meta-grid input[type="text"]:focus,
	.meta-grid input[type="date"]:focus {
		border-color: var(--primary, #10b981);
	}
	.meta-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.75rem;
	}
	.toast {
		position: fixed;
		right: 1rem;
		top: 1rem;
		z-index: 70;
		padding: 0.75rem 1rem;
		background: var(--card-bg, #fff);
		border: 1px solid var(--line-divider, #e5e7eb);
		border-left: 4px solid #6b7280;
		border-radius: 0.5rem;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		max-width: 28rem;
		white-space: pre-wrap;
		font-size: 0.875rem;
	}
	.toast-success {
		border-left-color: #10b981;
	}
	.toast-error {
		border-left-color: #ef4444;
	}
	.loading-mask {
		position: absolute;
		inset: 0;
		background: rgba(255, 255, 255, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 5;
	}
	:global(.dark) .loading-mask {
		background: rgba(0, 0, 0, 0.6);
	}
</style>