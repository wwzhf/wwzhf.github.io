<script lang="ts">
	// /projects/ 网站导航编辑（fqzlr 风格内联编辑模式）
	// 点击侧边栏「编辑网站导航」/ 锚点 #edit-nav → 页面进入编辑模式：
	// 每个书签卡片叠加 上移/下移/编辑/删除，分组可排序/改名/删除，支持添加书签/分组
	// 保存：GitHub Contents API 标记替换 NAV-DATA-START/END 数据区（PAT 复用 write-github-pat）

	interface NavItem {
		title: string;
		url: string;
		desc?: string;
		icon?: string;
		weight?: number;
	}
	interface NavGroup {
		id: string;
		name: string;
		desc?: string;
		icon?: string;
		weight?: number;
		items: NavItem[];
	}

	const REPO = "wwzhf/wwzhf.github.io";
	const BRANCH = "master";
	const FILE = "src/config/booknavConfig.ts";
	const START_MARK = "// ===== NAV-DATA-START =====";
	const END_MARK = "// ===== NAV-DATA-END =====";
	const PAT_KEY = "write-github-pat";

	let { groups = [] }: { groups: NavGroup[] } = $props();

	let editing = $state(false);
	let saving = $state(false);
	let error = $state("");
	let okMsg = $state("");
	let editGroups: NavGroup[] = $state([]);
	// 正在编辑的卡片表单："gi-ii"；正在添加书签的分组索引
	let editingCard = $state<string | null>(null);
	let addingIn = $state<number | null>(null);
	// 正在编辑的分组名表单
	let editingGroupName = $state<number | null>(null);
	let addingGroup = $state(false);

	function uid(): string {
		return Math.random().toString(36).slice(2, 8);
	}

	function hideStatic(): void {
		document.querySelector(".booknav-static")?.classList.add("hidden");
	}
	function showStatic(): void {
		document.querySelector(".booknav-static")?.classList.remove("hidden");
	}

	function startEdit(): void {
		if (editing) return;
		editGroups = structuredClone(groups);
		editing = true;
		error = "";
		okMsg = "";
		hideStatic();
		// 打开后平滑滚动到编辑工具栏（避免用户停留在页面底部看不到编辑列表）
		requestAnimationFrame(() => {
			document
				.querySelector(".en-toolbar")
				?.scrollIntoView({ behavior: "smooth", block: "start" });
		});
	}

	function exitEdit(): void {
		editing = false;
		editingCard = null;
		addingIn = null;
		addingGroup = false;
		showStatic();
	}

	function checkHash(): void {
		if (window.location.hash === "#edit-nav") startEdit();
	}
	$effect(() => {
		if (typeof window === "undefined") return;
		checkHash();
		// 直接捕获侧边栏「编辑页面导航」按钮点击（capture 阶段，先于 swup 拦截）：
		// 不依赖 EditBooknavCard 的脚本/自定义事件链路，即使按钮是旧版 <a> 也能生效
		const onDocClick = (e: MouseEvent) => {
			const btn = (e.target as Element | null)?.closest?.("#edit-booknav-trigger");
			if (!btn) return;
			e.preventDefault();
			e.stopPropagation();
			startEdit();
		};
		const onHash = () => checkHash();
		const onEvent = () => startEdit();
		document.addEventListener("click", onDocClick, true);
		window.addEventListener("hashchange", onHash);
		window.addEventListener("fqzlr:edit-nav", onEvent);
		return () => {
			document.removeEventListener("click", onDocClick, true);
			window.removeEventListener("hashchange", onHash);
			window.removeEventListener("fqzlr:edit-nav", onEvent);
		};
	});

	// ── 分组操作 ──
	function moveGroup(gi: number, dir: -1 | 1): void {
		const to = gi + dir;
		if (to < 0 || to >= editGroups.length) return;
		const arr = editGroups;
		const tmp = arr[gi];
		arr[gi] = arr[to];
		arr[to] = tmp;
		editGroups = [...arr];
	}
	function delGroup(gi: number): void {
		const g = editGroups[gi];
		if (!confirm('删除分组「' + (g.name || "未命名") + '」及其全部书签？')) return;
		editGroups = editGroups.filter((_, i) => i !== gi);
	}
	function renameGroup(gi: number): void {
		editingGroupName = editingGroupName === gi ? null : gi;
	}

	// ── 书签操作 ──
	function moveItem(gi: number, ii: number, dir: -1 | 1): void {
		const items = editGroups[gi].items;
		const to = ii + dir;
		if (to < 0 || to >= items.length) return;
		const tmp = items[ii];
		items[ii] = items[to];
		items[to] = tmp;
		editGroups = [...editGroups];
	}
	function delItem(gi: number, ii: number): void {
		const it = editGroups[gi].items[ii];
		if (!confirm('删除书签「' + (it.title || "未命名") + '」？')) return;
		editGroups[gi].items = editGroups[gi].items.filter((_, i) => i !== ii);
		editGroups = [...editGroups];
	}
	function beginEditItem(gi: number, ii: number): void {
		editingCard = gi + "-" + ii;
	}
	function beginAddItem(gi: number): void {
		addingIn = addingIn === gi ? null : gi;
	}
	function confirmAddItem(gi: number): void {
		const items = editGroups[gi].items;
		const title = (document.getElementById("en-new-title") as HTMLInputElement | null)?.value.trim() || "";
		const url = (document.getElementById("en-new-url") as HTMLInputElement | null)?.value.trim() || "";
		const desc = (document.getElementById("en-new-desc") as HTMLInputElement | null)?.value.trim() || "";
		if (!title || !url) {
			error = "新书签的标题和网址必填";
			return;
		}
		items.push({ title, url, desc: desc || undefined });
		editGroups = [...editGroups];
		addingIn = null;
		error = "";
	}
	function addGroup(): void {
		editGroups = [
			...editGroups,
			{ id: "group-" + uid(), name: "新分组", desc: "", items: [] },
		];
		editingGroupName = editGroups.length - 1;
	}

	// 表单保存（编辑中的卡片）——通过 DOM 读取输入值
	function saveCard(gi: number, ii: number): void {
		const item = editGroups[gi].items[ii];
		const get = (id: string): string =>
			(document.getElementById(id) as HTMLInputElement | null)?.value.trim() || "";
		item.title = get("en-title-" + gi + "-" + ii) || item.title;
		item.url = get("en-url-" + gi + "-" + ii) || item.url;
		item.desc = get("en-desc-" + gi + "-" + ii) || undefined;
		editGroups = [...editGroups];
		editingCard = null;
	}

	function saveGroupName(gi: number): void {
		const g = editGroups[gi];
		const el = document.getElementById("en-group-name-" + gi) as HTMLInputElement | null;
		if (el && el.value.trim()) g.name = el.value.trim();
		editGroups = [...editGroups];
		editingGroupName = null;
	}

	// ── 保存到 GitHub ──
	function pat(): string {
		return localStorage.getItem(PAT_KEY) || "";
	}

	function serializeData(): string {
		return JSON.stringify(editGroups, null, "\t");
	}

	async function save(): Promise<void> {
		error = "";
		okMsg = "";
		const token = pat();
		if (!token) {
			error = "未检测到 GitHub Token：请先在 /write/ 页导入密钥（或粘贴到下方输入框）";
			return;
		}
		for (const g of editGroups) {
			if (!g.name.trim()) {
				error = "存在未命名的分组，请填写分组名称";
				return;
			}
			for (const it of g.items) {
				if (!it.title.trim() || !it.url.trim()) {
					error = '分组「' + g.name + '」中存在未填写的书签（标题/网址必填）';
					return;
				}
			}
		}
		saving = true;
		try {
			const apiUrl =
				"https://api.github.com/repos/" + REPO + "/contents/" + FILE + "?ref=" + BRANCH;
			const getRes = await fetch(apiUrl, {
				headers: { Authorization: "token " + token },
			});
			if (!getRes.ok) throw new Error("拉取失败 HTTP " + getRes.status);
			const data = await getRes.json();
			const text = atob(data.content.replace(/\n/g, ""));
			const m = text.match(
				new RegExp(START_MARK + "\\n([\\s\\S]*?)\\n" + END_MARK),
			);
			if (!m) throw new Error("未找到数据区标记");
			const newText =
				text.slice(0, m.index) +
				START_MARK +
				"\n" +
				serializeData() +
				"\n" +
				END_MARK +
				text.slice(m.index + m[0].length);

			const putRes = await fetch(
				"https://api.github.com/repos/" + REPO + "/contents/" + FILE,
				{
					method: "PUT",
					headers: {
						Authorization: "token " + token,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						message: "Update website nav via /projects/ inline edit",
						content: btoa(unescape(encodeURIComponent(newText))),
						sha: data.sha,
						branch: BRANCH,
					}),
				},
			);
			if (!putRes.ok) {
				const err = await putRes.json().catch(() => null);
				throw new Error("提交失败 HTTP " + putRes.status + (err?.message ? " " + err.message : ""));
			}
			okMsg = "✅ 已提交！网站导航将在 1-2 分钟后自动部署生效。";
		} catch (e) {
			error = "保存失败：" + (e as Error).message;
		}
		saving = false;
	}

	// 客户端 favicon 辅助：icon 为 URL 直接显示，否则用 favicon.im
	function itemIcon(item: NavItem): string | null {
		if (item.icon && /^(https?:|\/)/.test(item.icon)) return item.icon;
		try {
			const domain = new URL(item.url).hostname;
			return "https://a.favicon.im/" + domain;
		} catch {
			return null;
		}
	}
	function domainOf(url: string): string {
		try {
			return new URL(url).hostname;
		} catch {
			return url;
		}
	}
	function titleLetter(t: string): string {
		return (t.trim()[0] || "?").toUpperCase();
	}
</script>

{#if editing}
	<div class="en-toolbar">
		<div class="en-toolbar-left">
			<span class="en-badge">编辑模式</span>
			<span class="en-hint">上移/下移排序 · 编辑 · 删除 · 添加，完成后保存到 GitHub</span>
		</div>
		<div class="en-toolbar-actions">
			{#if !pat()}
				<input
					id="en-pat-input"
					class="en-pat-input"
					type="password"
					placeholder="粘贴 GitHub Token（写入浏览器本地）"
					onchange={(e) => {
						const v = (e.currentTarget as HTMLInputElement).value.trim();
						if (v) localStorage.setItem(PAT_KEY, v);
					}}
				/>
			{/if}
			<button class="en-btn en-ghost" onclick={exitEdit}>取消</button>
			<button class="en-btn en-primary" onclick={save} disabled={saving}>
				{saving ? "保存中..." : "💾 保存到 GitHub"}
			</button>
		</div>
	</div>

	{#if error}
		<div class="en-toast en-error">{error}</div>
	{/if}
	{#if okMsg}
		<div class="en-toast en-ok">{okMsg}</div>
	{/if}

	<div class="en-list">
		{#each editGroups as group, gi (group.id)}
			<section class="en-group">
				<div class="en-group-head">
					{#if editingGroupName === gi}
						<input
							id={"en-group-name-" + gi}
							class="en-input en-group-name"
							value={group.name}
							onkeydown={(e) => {
								if (e.key === "Enter") saveGroupName(gi);
							}}
						/>
						<button class="en-btn en-mini en-primary" onclick={() => saveGroupName(gi)}>✓</button>
					{:else}
						<span class="en-group-title">{group.name}</span>
						{#if group.desc}
							<span class="en-group-desc">{group.desc}</span>
						{/if}
					{/if}
					<span class="en-count">{group.items.length}</span>
					<div class="en-group-ops">
						<button class="en-btn en-mini" title="分组上移" onclick={() => moveGroup(gi, -1)}>↑</button>
						<button class="en-btn en-mini" title="分组下移" onclick={() => moveGroup(gi, 1)}>↓</button>
						<button class="en-btn en-mini" title="重命名" onclick={() => renameGroup(gi)}>✎</button>
						<button class="en-btn en-mini en-danger" title="删除分组" onclick={() => delGroup(gi)}>🗑</button>
						<button class="en-btn en-mini en-add2" title="添加书签" onclick={() => beginAddItem(gi)}>＋</button>
					</div>
				</div>

				<div class="en-grid">
					{#each group.items as item, ii (gi + "-" + ii)}
						{#if editingCard === gi + "-" + ii}
							<div class="en-card en-card-form">
								<input id={"en-title-" + gi + "-" + ii} class="en-input" value={item.title} placeholder="标题 *" />
								<input id={"en-url-" + gi + "-" + ii} class="en-input" value={item.url} placeholder="网址 * https://..." />
								<input id={"en-desc-" + gi + "-" + ii} class="en-input" value={item.desc || ""} placeholder="描述（可选）" />
								<div class="en-form-ops">
									<button class="en-btn en-mini en-primary" onclick={() => saveCard(gi, ii)}>完成</button>
									<button class="en-btn en-mini" onclick={() => (editingCard = null)}>取消</button>
								</div>
							</div>
						{:else}
							<div class="en-card">
								<div class="en-card-icon">
									{#if itemIcon(item)}
										<img src={itemIcon(item)!} alt="" loading="lazy" class="en-card-img" onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
									{:else}
										<span class="en-card-letter">{titleLetter(item.title)}</span>
									{/if}
								</div>
								<div class="en-card-body">
									<div class="en-card-title">{item.title}</div>
									<div class="en-card-desc">{item.desc || domainOf(item.url)}</div>
								</div>
								<div class="en-card-ops">
									<button class="en-btn en-mini" title="上移" onclick={() => moveItem(gi, ii, -1)}>↑</button>
									<button class="en-btn en-mini" title="下移" onclick={() => moveItem(gi, ii, 1)}>↓</button>
									<button class="en-btn en-mini" title="编辑" onclick={() => beginEditItem(gi, ii)}>✎</button>
									<button class="en-btn en-mini en-danger" title="删除" onclick={() => delItem(gi, ii)}>✕</button>
								</div>
							</div>
						{/if}
					{/each}

					{#if addingIn === gi}
						<div class="en-card en-card-form">
							<input id="en-new-title" class="en-input" placeholder="标题 *" />
							<input id="en-new-url" class="en-input" placeholder="网址 * https://..." />
							<input id="en-new-desc" class="en-input" placeholder="描述（可选）" />
							<div class="en-form-ops">
								<button class="en-btn en-mini en-primary" onclick={() => confirmAddItem(gi)}>添加</button>
								<button class="en-btn en-mini" onclick={() => (addingIn = null)}>取消</button>
							</div>
						</div>
					{/if}
				</div>
			</section>
		{/each}

		<button class="en-btn en-add-group" onclick={addGroup}>＋ 添加分组</button>
	</div>
{/if}

<style>
	.en-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		flex-wrap: wrap;
		padding: 0.75rem 1rem;
		margin-bottom: 1rem;
		background: var(--card-bg, #fff);
		border: 1px solid var(--line-divider, #e5e7eb);
		border-radius: 0.75rem;
	}
	.en-toolbar-left {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.en-badge {
		font-size: 0.75rem;
		font-weight: 700;
		padding: 0.15rem 0.5rem;
		border-radius: 999px;
		background: var(--primary, #10b981);
		color: #fff;
	}
	.en-hint {
		font-size: 0.78rem;
		color: var(--content-meta, #6b7280);
	}
	.en-toolbar-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.en-pat-input {
		padding: 0.35rem 0.6rem;
		border: 1px solid var(--line-divider, #e5e7eb);
		border-radius: 0.4rem;
		background: transparent;
		color: inherit;
		font-size: 0.8rem;
		width: 15rem;
		max-width: 40vw;
	}
	.en-btn {
		padding: 0.4rem 0.8rem;
		border-radius: 0.5rem;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		border: 1px solid var(--line-divider, #e5e7eb);
		background: transparent;
		color: inherit;
		transition: all 0.15s ease;
	}
	.en-btn:hover {
		opacity: 0.85;
	}
	.en-primary {
		background: var(--primary, #10b981);
		border-color: var(--primary, #10b981);
		color: #fff;
	}
	.en-ghost {
		opacity: 0.8;
	}
	.en-mini {
		padding: 0.2rem 0.45rem;
		font-size: 0.78rem;
		line-height: 1;
	}
	.en-danger {
		color: #ef4444;
		border-color: rgba(239, 68, 68, 0.35);
	}
	.en-add2 {
		color: var(--primary, #10b981);
		border-color: rgba(16, 185, 129, 0.35);
	}
	.en-toast {
		padding: 0.6rem 0.9rem;
		border-radius: 0.5rem;
		font-size: 0.85rem;
		margin-bottom: 0.75rem;
	}
	.en-error {
		background: rgba(239, 68, 68, 0.1);
		color: #ef4444;
		border: 1px solid rgba(239, 68, 68, 0.3);
	}
	.en-ok {
		background: rgba(16, 185, 129, 0.1);
		color: var(--primary, #10b981);
		border: 1px solid rgba(16, 185, 129, 0.3);
	}
	.en-list {
		display: flex;
		flex-direction: column;
		gap: 1.2rem;
	}
	.en-group {
		border: 1px solid var(--line-divider, #e5e7eb);
		border-radius: 0.75rem;
		padding: 0.9rem;
	}
	.en-group-head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-bottom: 0.7rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid var(--line-divider, #e5e7eb);
	}
	.en-group-title {
		font-weight: 700;
		font-size: 1rem;
	}
	.en-group-desc {
		font-size: 0.78rem;
		color: var(--content-meta, #6b7280);
	}
	.en-group-name {
		width: 12rem;
	}
	.en-count {
		font-size: 0.72rem;
		color: var(--content-meta, #6b7280);
		background: rgba(127, 127, 127, 0.1);
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
	}
	.en-group-ops {
		margin-left: auto;
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}
	.en-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 0.6rem;
	}
	.en-card {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.55rem 0.7rem;
		border: 1px solid var(--line-divider, #e5e7eb);
		border-radius: 0.6rem;
		background: transparent;
	}
	.en-card-icon {
		width: 2.4rem;
		height: 2.4rem;
		border-radius: 0.5rem;
		overflow: hidden;
		background: rgba(127, 127, 127, 0.08);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.en-card-img {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}
	.en-card-letter {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--primary, #10b981);
	}
	.en-card-body {
		flex: 1;
		min-width: 0;
	}
	.en-card-title {
		font-weight: 600;
		font-size: 0.9rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.en-card-desc {
		font-size: 0.76rem;
		color: var(--content-meta, #6b7280);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.en-card-ops {
		display: flex;
		gap: 0.25rem;
		flex-shrink: 0;
		opacity: 0.65;
	}
	.en-card-ops:hover {
		opacity: 1;
	}
	.en-card-form {
		flex-direction: column;
		align-items: stretch;
		gap: 0.4rem;
		background: rgba(127, 127, 127, 0.05);
	}
	.en-form-ops {
		display: flex;
		gap: 0.4rem;
		justify-content: flex-end;
	}
	.en-input {
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--line-divider, #e5e7eb);
		border-radius: 0.4rem;
		background: transparent;
		color: inherit;
		font-size: 0.85rem;
		outline: none;
		width: 100%;
	}
	.en-input:focus {
		border-color: var(--primary, #10b981);
	}
	.en-add-group {
		width: 100%;
		padding: 0.6rem;
		border-radius: 0.6rem;
		border: 1px dashed var(--primary, #10b981);
		color: var(--primary, #10b981);
		background: transparent;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
	}
	.en-add-group:hover {
		background: rgba(16, 185, 129, 0.06);
	}
</style>
