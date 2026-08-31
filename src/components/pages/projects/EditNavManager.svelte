<script lang="ts">
	// /projects/ 网站导航编辑面板：可视化添加/删除分组与书签
	// 数据读写：GitHub Contents API 操作 src/config/booknavConfig.ts
	// （NAV-DATA-START/END 标记之间为 JSON 数据区，客户端整体替换）

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
		icon?: string;
		desc?: string;
		weight?: number;
		items: NavItem[];
	}

	const REPO = "wwzhf/wwzhf.github.io";
	const BRANCH = "master";
	const FILE = "src/config/booknavConfig.ts";
	const START_MARK = "// ===== NAV-DATA-START =====";
	const END_MARK = "// ===== NAV-DATA-END =====";
	const PAT_KEY = "write-github-pat";

	let open = $state(false);
	let loading = $state(false);
	let saving = $state(false);
	let error = $state("");
	let okMsg = $state("");
	let groups: NavGroup[] = $state([]);

	function pat(): string {
		return localStorage.getItem(PAT_KEY) || "";
	}

	// 打开面板：从 GitHub 拉取当前 booknavConfig.ts 并解析数据区
	async function openPanel(): Promise<void> {
		open = true;
		error = "";
		okMsg = "";
		const token = pat();
		if (!token) {
			error = "请先在 /write/ 编辑器导入 GitHub Token（或本页下方输入）";
			return;
		}
		loading = true;
		try {
			const res = await fetch(
				"https://api.github.com/repos/" + REPO + "/contents/" + FILE + "?ref=" + BRANCH,
				{ headers: { Authorization: "token " + token } },
			);
			if (!res.ok) throw new Error("拉取失败 HTTP " + res.status);
			const data = await res.json();
			const text = atob(data.content.replace(/\n/g, ""));
			const m = text.match(
				new RegExp(START_MARK + "\\n([\\s\\S]*?)\\n" + END_MARK),
			);
			if (!m) throw new Error("未找到数据区标记（NAV-DATA-START/END）");
			groups = JSON.parse(m[1]);
			// 归一化：id 缺失则补
			groups.forEach((g) => {
				if (!g.id) g.id = "group-" + Math.random().toString(36).slice(2, 8);
				if (!g.items) g.items = [];
			});
		} catch (e) {
			error = "加载失败：" + (e as Error).message;
		}
		loading = false;
	}

	function uid(): string {
		return Math.random().toString(36).slice(2, 8);
	}

	function addGroup(): void {
		groups.push({
			id: "group-" + uid(),
			name: "新分组",
			desc: "",
			icon: "material-symbols:folder-open-rounded",
			weight: 100,
			items: [],
		});
	}

	function delGroup(gi: number): void {
		if (!confirm('删除分组「' + (groups[gi].name || "未命名") + '」及其全部书签？')) return;
		groups.splice(gi, 1);
	}

	function addItem(gi: number): void {
		groups[gi].items.push({ title: "", url: "https://", desc: "" });
	}

	function delItem(gi: number, ii: number): void {
		const item = groups[gi].items[ii];
		if (!confirm('删除书签「' + (item.title || "未命名") + '」？')) return;
		groups[gi].items.splice(ii, 1);
	}

	// 序列化数据区（JSON，美化缩进）
	function serializeData(): string {
		return JSON.stringify(groups, null, "\t");
	}

	// 保存：拉最新文件 → 替换数据区 → PUT 提交
	async function save(): Promise<void> {
		error = "";
		okMsg = "";
		const token = pat();
		if (!token) {
			error = "请先导入 GitHub Token";
			return;
		}
		// 校验必填
		for (const g of groups) {
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

			const body = {
				message: "Update website nav via /projects/ edit panel",
				content: btoa(unescape(encodeURIComponent(newText))),
				sha: data.sha,
				branch: BRANCH,
			};
			const putRes = await fetch(
				"https://api.github.com/repos/" + REPO + "/contents/" + FILE,
				{
					method: "PUT",
					headers: {
						Authorization: "token " + token,
						"Content-Type": "application/json",
					},
					body: JSON.stringify(body),
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

	// 页面锚点 #edit-nav 触发打开
	function checkHash(): void {
		if (window.location.hash === "#edit-nav" && !open) {
			openPanel();
		}
	}
	$effect(() => {
		if (typeof window === "undefined") return;
		checkHash();
		window.addEventListener("hashchange", checkHash);
		return () => window.removeEventListener("hashchange", checkHash);
	});
</script>

<div id="edit-nav" class="edit-nav-manager">
	<div class="edit-nav-header">
		<div>
			<div class="edit-nav-title">网站导航管理</div>
			<div class="edit-nav-sub">可视化添加 / 删除分组与书签，保存后自动提交部署</div>
		</div>
		<button class="en-btn en-primary" onclick={open ? save : openPanel} disabled={loading || saving}>
			{open ? (saving ? "保存中..." : "💾 保存到 GitHub") : "✏️ 编辑页面导航"}
		</button>
	</div>

	{#if open}
		{#if error}
			<div class="en-toast en-error">{error}</div>
		{/if}
		{#if okMsg}
			<div class="en-toast en-ok">{okMsg}</div>
		{/if}
		{#if loading}
			<div class="en-loading">正在从 GitHub 加载导航配置...</div>
		{:else}
			<div class="en-tip">未导入 Token？点右上角「编辑页面导航」后会提示，也可先在 /write/ 页导入。每次进入编辑会自动拉取最新配置。</div>
			<div class="en-groups">
				{#each groups as group, gi (group.id)}
					<div class="en-group">
						<div class="en-group-head">
							<input
								class="en-input en-input-name"
								placeholder="分组名称"
								bind:value={group.name}
							/>
							<input
								class="en-input en-input-icon"
								placeholder="图标(可选) iconify名"
								bind:value={group.icon}
							/>
							<button class="en-btn en-danger" onclick={() => delGroup(gi)} title="删除分组">🗑 删除分组</button>
						</div>
						<input
							class="en-input en-input-desc"
							placeholder="分组描述（可选）"
							bind:value={group.desc}
						/>
						<div class="en-items">
							{#each group.items as item, ii (gi + "-" + ii)}
								<div class="en-item">
									<input class="en-input" placeholder="标题 *" bind:value={item.title} />
									<input class="en-input" placeholder="网址 * https://..." bind:value={item.url} />
									<input class="en-input" placeholder="描述（可选）" bind:value={item.desc} />
									<button class="en-btn en-danger" onclick={() => delItem(gi, ii)} title="删除书签">✕</button>
								</div>
							{/each}
							<button class="en-btn en-add" onclick={() => addItem(gi)}>＋ 添加书签</button>
						</div>
					</div>
				{/each}
				<button class="en-btn en-add en-add-group" onclick={addGroup}>＋ 添加分组</button>
			</div>
		{/if}
	{/if}
</div>

<style>
	.edit-nav-manager {
		margin-top: 1rem;
		background: var(--card-bg, #fff);
		border: 1px solid var(--line-divider, #e5e7eb);
		border-radius: 0.9rem;
		padding: 1rem 1.25rem;
	}
	.edit-nav-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.edit-nav-title {
		font-weight: 700;
		font-size: 1.05rem;
	}
	.edit-nav-sub {
		font-size: 0.8rem;
		color: var(--content-meta, #6b7280);
		margin-top: 0.15rem;
	}
	.en-btn {
		padding: 0.45rem 0.9rem;
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
	.en-danger {
		color: #ef4444;
		border-color: rgba(239, 68, 68, 0.35);
	}
	.en-add {
		color: var(--primary, #10b981);
		border-style: dashed;
		width: 100%;
		margin-top: 0.4rem;
	}
	.en-add-group {
		margin-top: 0.9rem;
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
	.en-loading {
		padding: 1.5rem 0;
		text-align: center;
		color: var(--content-meta, #6b7280);
		font-size: 0.9rem;
	}
	.en-tip {
		font-size: 0.75rem;
		color: var(--content-meta, #6b7280);
		margin-bottom: 0.8rem;
	}
	.en-groups {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.en-group {
		border: 1px solid var(--line-divider, #e5e7eb);
		border-radius: 0.7rem;
		padding: 0.8rem;
	}
	.en-group-head {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		align-items: center;
	}
	.en-input {
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--line-divider, #e5e7eb);
		border-radius: 0.4rem;
		background: transparent;
		color: inherit;
		font-size: 0.85rem;
		flex: 1 1 0;
		min-width: 6rem;
		outline: none;
	}
	.en-input:focus {
		border-color: var(--primary, #10b981);
	}
	.en-input-name {
		flex: 2;
	}
	.en-input-icon {
		flex: 1;
	}
	.en-input-desc {
		width: 100%;
		margin-top: 0.45rem;
	}
	.en-items {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		margin-top: 0.6rem;
	}
	.en-item {
		display: flex;
		gap: 0.45rem;
		align-items: center;
	}
	.en-item .en-input:nth-child(1) {
		flex: 1.2;
	}
	.en-item .en-input:nth-child(2) {
		flex: 1.6;
	}
	.en-item .en-input:nth-child(3) {
		flex: 1.4;
	}
	.en-item .en-danger {
		flex: 0 0 auto;
		padding: 0.35rem 0.6rem;
	}
</style>
