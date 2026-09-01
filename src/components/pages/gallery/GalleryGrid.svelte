<script lang="ts">
	// /gallery/ 图库：浏览图片，可一键「设为壁纸 / 设为头像」，也可上传新图
	// 生效方式：GitHub Contents API 修改配置文件 → 自动推送部署（PAT 复用 write-github-pat）
	// 设壁纸：backgroundWallpaper.ts 的 desktop 字段；设头像：profileConfig.ts 的 avatar 字段

	let { images = [] }: { images: string[] } = $props();

	const REPO = "wwzhf/wwzhf.github.io";
	const BRANCH = "master";
	const GALLERY_DIR = "public/gallery";
	const PAT_KEY = "write-github-pat";

	let list = $state([...images]);
	let busy = $state(false);
	let busyFor = $state<string | null>(null);
	let msg = $state("");
	let msgErr = $state(false);
	let uploading = $state(false);

	function pat(): string {
		return localStorage.getItem(PAT_KEY) || "";
	}

	async function api(path: string, method = "GET", body?: unknown): Promise<any> {
		const token = pat();
		const resp = await fetch(
			`https://api.github.com/repos/${REPO}/contents/${path}?ref=${BRANCH}`,
			{
				method,
				headers: {
					Authorization: `token ${token}`,
					Accept: "application/vnd.github+json",
					...(body ? { "Content-Type": "application/json" } : {}),
				},
				body: body ? JSON.stringify(body) : undefined,
			},
		);
		if (!resp.ok) {
			const err = await resp.json().catch(() => null);
			throw new Error(`HTTP ${resp.status}${err?.message ? " " + err.message : ""}`);
		}
		return resp.json();
	}

	async function fetchFile(path: string) {
		const data = await api(path);
		return { sha: data.sha, text: atob(data.content.replace(/\n/g, "")) };
	}

	async function pushFile(
		path: string,
		text: string,
		sha: string | null,
		message: string,
	) {
		await api(path, "PUT", {
			message,
			content: btoa(unescape(encodeURIComponent(text))),
			sha: sha ?? undefined,
			branch: BRANCH,
		});
	}

	function requirePat(): boolean {
		if (!pat()) {
			msgErr = true;
			msg = "未检测到 GitHub Token：请先在 /write/ 页导入密钥";
			return false;
		}
		return true;
	}

	function showOk(m: string) {
		msgErr = false;
		msg = m;
	}
	function showErr(m: string) {
		msgErr = true;
		msg = m;
	}

	// 提交后轮询 GitHub Actions：本次触发的 run 部署成功后自动刷新页面（带缓存穿透参数）
	function afterCommit(startTs: number) {
		showOk("✅ 已提交，部署完成后自动刷新页面…");
		const deadline = startTs + 6 * 60 * 1000;
		const poll = async () => {
			if (Date.now() > deadline) {
				showOk("部署较慢，可稍后手动刷新查看最新图库");
				return;
			}
			try {
				const resp = await fetch(
					`https://api.github.com/repos/${REPO}/actions/runs?per_page=1&event=push`,
					{
						headers: {
							Authorization: `token ${pat()}`,
							Accept: "application/vnd.github+json",
						},
					},
				);
				if (resp.ok) {
					const data = await resp.json();
					const run = data.workflow_runs?.[0];
					// 只看本次操作之后触发的 run
					if (run && new Date(run.created_at).getTime() >= startTs - 30 * 1000) {
						if (run.conclusion === "success") {
							location.href = location.pathname + "?t=" + Date.now();
							return;
						}
						if (run.status === "completed" && run.conclusion !== "success") {
							showErr("部署失败，请到 GitHub Actions 查看日志");
							return;
						}
					}
				}
			} catch {
				// 网络抖动继续轮询
			}
			setTimeout(poll, 15000);
		};
		setTimeout(poll, 15000);
	}

	async function setWallpaper(img: string) {
		if (!requirePat() || busy) return;
		busy = true;
		busyFor = img;
		msg = "";
		const startTs = Date.now();
		try {
			const FILE = "src/config/backgroundWallpaper.ts";
			const { sha, text } = await fetchFile(FILE);
			// 匹配 desktop 字段（数组或单字符串两种形式）
			const arrRe = /(\n\s*desktop:)\s*\[[\s\S]*?\]/;
			const strRe = /(\n\s*desktop:)\s*"[^"]*"/;
			let newText: string | null = null;
			if (arrRe.test(text)) newText = text.replace(arrRe, `$1 "/gallery/${img}"`);
			else if (strRe.test(text)) newText = text.replace(strRe, `$1 "/gallery/${img}"`);
			if (!newText) throw new Error("未找到 desktop 壁纸配置");
			await pushFile(FILE, newText, sha, `chore: 图库设置壁纸 /gallery/${img}`);
			afterCommit(startTs);
		} catch (e) {
			showErr("设置壁纸失败：" + (e as Error).message);
		}
		busy = false;
		busyFor = null;
	}

	async function setAvatar(img: string) {
		if (!requirePat() || busy) return;
		busy = true;
		busyFor = img;
		msg = "";
		const startTs = Date.now();
		try {
			const FILE = "src/config/profileConfig.ts";
			const { sha, text } = await fetchFile(FILE);
			const re = /(\n\s*avatar:)\s*"[^"]*"/;
			if (!re.test(text)) throw new Error("未找到 avatar 配置");
			const newText = text.replace(re, `$1 "/gallery/${img}"`);
			await pushFile(FILE, newText, sha, `chore: 图库设置头像 /gallery/${img}`);
			afterCommit(startTs);
		} catch (e) {
			showErr("设置头像失败：" + (e as Error).message);
		}
		busy = false;
		busyFor = null;
	}

	async function uploadImage(file: File) {
		if (!requirePat()) return;
		if (!/\.(webp|avif|png|jpe?g|gif|svg)$/i.test(file.name)) {
			showErr("仅支持图片文件（webp/avif/png/jpg/gif/svg）");
			return;
		}
		if (file.size > 8 * 1024 * 1024) {
			showErr("图片过大（限制 8MB）");
			return;
		}
		uploading = true;
		msg = "";
		const startTs = Date.now();
		try {
			const ext = file.name.split(".").pop()?.toLowerCase() || "png";
			const fname = `gallery-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
			const target = `${GALLERY_DIR}/${fname}`;
			const buf = await file.arrayBuffer();
			const b64 = base64FromBuffer(buf);
			await api(target, "PUT", {
				message: `chore: 图库上传 ${fname}`,
				content: b64,
				branch: BRANCH,
			});
			list = ["/gallery/" + fname, ...list];
			afterCommit(startTs);
		} catch (e) {
			showErr("上传失败：" + (e as Error).message);
		}
		uploading = false;
	}

	async function deleteImage(img: string) {
		if (!requirePat() || busy) return;
		const fname = img.replace(/^\/gallery\//, "");
		if (!confirm(`确定从图库删除「${fname}」？\n此操作不可撤销（仓库文件会被删除）。`)) return;
		busy = true;
		busyFor = img;
		msg = "";
		const startTs = Date.now();
		try {
			const target = `${GALLERY_DIR}/${fname}`;
			// 先取文件 sha，再 DELETE（Contents API 需要 sha）
			const meta = await api(target);
			await api(target, "DELETE", {
				message: `chore: 图库删除 ${fname}`,
				sha: meta.sha,
				branch: BRANCH,
			});
			list = list.filter((x) => x !== img);
			afterCommit(startTs);
		} catch (e) {
			showErr("删除失败：" + (e as Error).message);
		}
		busy = false;
		busyFor = null;
	}

	function base64FromBuffer(buf: ArrayBuffer): string {
		const bytes = new Uint8Array(buf);
		let bin = "";
		const CHUNK = 0x8000;
		for (let i = 0; i < bytes.length; i += CHUNK) {
			bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
		}
		return btoa(bin);
	}
</script>

<!-- 上传区 -->
<div class="gl-upload">
	<label class="gl-upload-btn">
		<span>{uploading ? "上传中..." : "＋ 上传图片到图库"}</span>
		<input
			type="file"
			accept="image/webp,image/avif,image/png,image/jpeg,image/gif,image/svg+xml"
			hidden
			disabled={uploading}
			onchange={(e) => {
				const f = (e.currentTarget as HTMLInputElement).files?.[0];
				if (f) uploadImage(f);
				(e.currentTarget as HTMLInputElement).value = "";
			}}
		/>
	</label>
	<span class="gl-upload-hint">支持 webp/avif/png/jpg/gif/svg，单张 ≤8MB，上传后自动部署</span>
</div>

<!-- 状态消息 -->
{#if msg}
	<div class:list={["gl-toast", msgErr ? "gl-err" : "gl-ok"]}>{msg}</div>
{/if}

<!-- 图片网格 -->
{#if list.length > 0}
	<div class="gl-grid">
		{#each list as img (img)}
			<div class="gl-card">
				<div class="gl-img-wrap">
					<img src={img} alt="" loading="lazy" class="gl-img" />
				</div>
				<div class="gl-ops">
					<button
						class="gl-btn gl-btn-primary"
						disabled={busy}
						onclick={() => setWallpaper(img)}
					>
						{busy && busyFor === img ? "处理中..." : "设为壁纸"}
					</button>
					<button
						class="gl-btn"
						disabled={busy}
						onclick={() => setAvatar(img)}
					>
						{busy && busyFor === img ? "处理中..." : "设为头像"}
					</button>
					<button
						class="gl-btn gl-btn-danger"
						disabled={busy}
						onclick={() => deleteImage(img)}
					>
						{busy && busyFor === img ? "处理中..." : "删除"}
					</button>
				</div>
			</div>
		{/each}
	</div>
{:else}
	<div class="gl-empty">
		<p>图库还是空的，点击上方「上传图片」添加第一张图吧～</p>
	</div>
{/if}

<style>
	.gl-upload {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
		margin-bottom: 1rem;
	}
	.gl-upload-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.5rem 1rem;
		border-radius: 999px;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		background: var(--primary, #10b981);
		color: #fff;
		transition: opacity 0.15s ease;
	}
	.gl-upload-btn:hover {
		opacity: 0.85;
	}
	.gl-upload-hint {
		font-size: 0.75rem;
		color: var(--content-meta, #6b7280);
	}
	.gl-toast {
		padding: 0.6rem 0.9rem;
		border-radius: 0.5rem;
		font-size: 0.85rem;
		margin-bottom: 0.75rem;
	}
	.gl-ok {
		background: rgba(16, 185, 129, 0.1);
		color: var(--primary, #10b981);
		border: 1px solid rgba(16, 185, 129, 0.3);
	}
	.gl-err {
		background: rgba(239, 68, 68, 0.1);
		color: #ef4444;
		border: 1px solid rgba(239, 68, 68, 0.3);
	}
	.gl-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 0.9rem;
	}
	.gl-card {
		border: 1px solid var(--line-divider, #e5e7eb);
		border-radius: 0.75rem;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	.gl-img-wrap {
		aspect-ratio: 4 / 3;
		background: rgba(127, 127, 127, 0.06);
		overflow: hidden;
	}
	.gl-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		transition: transform 0.3s ease;
	}
	.gl-card:hover .gl-img {
		transform: scale(1.04);
	}
	.gl-ops {
		display: flex;
		gap: 0.4rem;
		padding: 0.55rem;
	}
	.gl-btn {
		flex: 1;
		padding: 0.35rem 0.5rem;
		border-radius: 0.45rem;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		border: 1px solid var(--line-divider, #e5e7eb);
		background: transparent;
		color: inherit;
		transition: opacity 0.15s ease;
	}
	.gl-btn:hover {
		opacity: 0.8;
	}
	.gl-btn-primary {
		background: var(--primary, #10b981);
		border-color: var(--primary, #10b981);
		color: #fff;
	}
	.gl-btn-danger {
		color: #ef4444;
		border-color: rgba(239, 68, 68, 0.35);
	}
	.gl-btn-danger:hover {
		background: rgba(239, 68, 68, 0.08);
	}
	.gl-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.gl-empty {
		text-align: center;
		padding: 3rem 1rem;
		color: var(--content-meta, #6b7280);
		font-size: 0.9rem;
	}
</style>
