import type { NavBarConfig, NavBarLink, NavBarSearchConfig } from "../types/navBarConfig";
import { NavBarSearchMethod } from "../types/navBarConfig";

// ============================================================================
// 导航栏配置（复刻 fqzlr 结构）
// 桌面端：左侧站点名 / 中间菜单（主页、文章▾、网站导航、动态▾、记录▾、关于▾）/
//         右侧明暗切换按钮 + 搜索按钮
// 移动端：右上角菜单按钮打开面板，所有导航项合并在同一个面板里（分组可展开）
// 注意：菜单项不设置 icon 字段即不显示图标
// ============================================================================

const links: NavBarLink[] = [
	{
		name: "主页",
		url: "/",
	},
	{
		name: "文章",
		url: "#",
		children: [
			{
				name: "文章列表",
				url: "/posts/",
			},
			{
				name: "归档",
				url: "/archive/",
			},
			{
				name: "写文章",
				url: "/write/",
			},
		],
	},
	{
		name: "网站导航",
		url: "/projects/",
	},
	{
		name: "记录",
		url: "#",
		children: [
			{
				name: "番剧",
				url: "/bangumi/",
				pageKey: "bangumi",
			},
			{
				name: "图库",
				url: "/gallery/",
			},
		],
	},
];

export const navBarConfig: NavBarConfig = {
	links,
};

// 导航栏搜索配置（使用 Pagefind 全文搜索）
export const navBarSearchConfig: NavBarSearchConfig = {
	method: NavBarSearchMethod.PageFind,
};
