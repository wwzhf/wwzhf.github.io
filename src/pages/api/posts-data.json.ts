import { getCollection } from "astro:content";
import { removeFileExtension } from "@utils/url-utils";

// 文章浏览器数据源：全部文章（含渲染后的 HTML），供 /posts/ 前端使用
// 加密文章不导出正文，防止内容泄露
export async function GET(): Promise<Response> {
	const posts = await getCollection("posts", ({ data }) => !data.draft);

	const items = [];
	for (const entry of posts) {
		const encrypted = !!entry.data.password;
		items.push({
			id: removeFileExtension(entry.id),
			title: entry.data.title,
			category: entry.data.category || "",
			published: entry.data.published.getTime(),
			pinned: entry.data.pinned || false,
			encrypted,
			html: encrypted ? "" : (entry.rendered?.html ?? ""),
		});
	}

	items.sort(
		(a, b) => Number(b.pinned) - Number(a.pinned) || b.published - a.published,
	);

	return new Response(JSON.stringify(items), {
		headers: { "Content-Type": "application/json; charset=utf-8" },
	});
}
