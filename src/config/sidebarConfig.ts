import type { SidebarLayoutConfig } from "../types/sidebarConfig";

/**
 * 侧边栏布局配置（复刻 fqzlr：单左侧栏，profile + 编辑卡 + 信息组件）
 */
export const sidebarLayoutConfig: SidebarLayoutConfig = {
	// 是否启用侧边栏功能
	enable: true,

	// 侧边栏位置：
	// both: 双侧栏（左侧信息流 + 右侧日历/目录，用户需求：除文章列表页外其他页面右侧显示日历）
	position: "both",

	// 平板端(769-1279px)显示哪侧侧边栏，仅position为both时生效
	tabletSidebar: "left",

	// 文章详情页隐藏侧边栏，设为 true 则只在首页等非文章页显示
	hideSidebarOnPostPage: false,

	// 文章详情页保持双侧栏（文章页右侧显示当前文章目录 sidebarToc）
	showBothSidebarsOnPostPage: true,

	// 左侧边栏组件配置列表
	leftComponents: [
		{
			// 组件类型：用户资料组件
			type: "profile",
			enable: true,
			position: "top",
			showOnPostPage: true,
		},
		{
			// 组件类型：编辑卡（复刻 fqzlr 左侧「编辑」卡，跳转内容后台）
			type: "editCard",
			enable: true,
			position: "top",
			showOnPostPage: true,
		},
	],

	// 右侧边栏组件配置列表
	// 文章详情页：只显示 sidebarToc 目录；其他页面：只显示 calendar 日历
	rightComponents: [
		{
			type: "stats",
			enable: false,
			position: "top",
			showOnPostPage: false,
		},
		{
			type: "siteInfo",
			enable: false,
			position: "top",
			showOnPostPage: false,
			specificConfig: {
				siteInfo: {
					unknownBuildPlatform: "Unknown CI",
				},
			},
		},
		{
			type: "calendar",
			enable: true,
			showTitle: true,
			position: "sticky",
			// 文章页（详情/列表）隐藏日历，其他页面（主页/归档/关于等）显示
			showOnPostPage: false,
			specificConfig: {
				calendar: {
					showHeatmap: true,
				},
			},
		},
		{
			type: "sidebarToc",
			enable: true,
			position: "sticky",
			showOnPostPage: true,
			hideOnNonPostPage: true,
		},
		{
			type: "advertisement",
			enable: false,
			showTitle: false,
			position: "sticky",
			showOnPostPage: true,
			specificConfig: {
				ad: {
					image: {
						src: "/assets/images/ad/ad1.webp",
						alt: "广告横幅",
						link: "https://haoka.lot-ml.com/plugreg.html?agentid=1423316",
						external: true,
					},
					closable: false,
					displayCount: -1,
					padding: {
						all: "1rem",
					},
				},
			},
		},
		{
			type: "advertisement",
			enable: false,
			position: "sticky",
			showOnPostPage: true,
			specificConfig: {
				ad: {
					title: "支持博主",
					content:
						"如果您觉得本站内容对您有帮助，欢迎支持我们的创作！您的支持是我们持续更新的动力。",
					link: {
						text: "支持一下",
						url: "about/",
						external: false,
					},
					closable: false,
					displayCount: -1,
				},
			},
		},
	],

	// 移动端底部组件配置列表
	mobileBottomComponents: [
		{
			type: "profile",
			enable: true,
			showOnPostPage: true,
		},
		{
			type: "stats",
			enable: true,
			showOnPostPage: true,
		},
		{
			type: "siteInfo",
			enable: true,
			showOnPostPage: true,
			specificConfig: {
				siteInfo: {
					unknownBuildPlatform: "Unknown CI",
				},
			},
		},
	],
};
