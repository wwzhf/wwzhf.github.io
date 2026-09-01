<script lang="ts">
import ClientPagination from "@/components/common/ClientPagination.svelte";
import FilterControls from "@/components/common/FilterControls.svelte";
import SortControls from "@/components/common/SortControls.svelte";
import I18nKey from "@/i18n/i18nKey";
import { i18n } from "@/i18n/translation";
import type { UserSubjectCollection } from "@/types/bangumi";
import type { NsfwMode } from "@/types/nsfw";
import { filterNsfw, isBangumiNsfw } from "@/utils/nsfw-utils";
import Card from "./Card.svelte";

interface Props {
	sectionId: string;
	items: UserSubjectCollection[];
	isActive: boolean;
	itemsPerPage?: number;
	subjectBaseUrl?: string;
	nsfw?: NsfwMode; // NSFW 处理："off" | "blur" | "hide"
}

const {
	sectionId,
	items,
	isActive,
	itemsPerPage = 24,
	subjectBaseUrl,
	nsfw = "off",
}: Props = $props();

const STATUS_MAP: Record<number, string> = {
	1: "wish",
	2: "collect",
	3: "doing",
	4: "on_hold",
	5: "dropped",
};

const isGame = $derived(sectionId === "game");
const isBook = $derived(sectionId === "book");
const isMusic = $derived(sectionId === "music");

function getFilterLabel(type: "collect" | "doing" | "wish"): string {
	if (isGame) {
		switch (type) {
			case "collect":
				return i18n(I18nKey.bangumiFilterGamePlayed);
			case "doing":
				return i18n(I18nKey.bangumiFilterGamePlaying);
			case "wish":
				return i18n(I18nKey.bangumiFilterGameWish);
		}
	}
	if (isBook) {
		switch (type) {
			case "collect":
				return i18n(I18nKey.bangumiFilterBookRead);
			case "doing":
				return i18n(I18nKey.bangumiFilterBookReading);
			case "wish":
				return i18n(I18nKey.bangumiFilterBookWish);
		}
	}
	if (isMusic) {
		switch (type) {
			case "collect":
				return i18n(I18nKey.bangumiFilterMusicListened);
			case "doing":
				return i18n(I18nKey.bangumiFilterMusicListening);
			case "wish":
				return i18n(I18nKey.bangumiFilterMusicWish);
		}
	}
	switch (type) {
		case "collect":
			return i18n(I18nKey.bangumiFilterWatched);
		case "doing":
			return i18n(I18nKey.bangumiFilterWatching);
		case "wish":
			return i18n(I18nKey.bangumiFilterWish);
	}
}

// NSFW 拦截：mode === "hide" 时过滤掉命中条目
const safeItems = $derived(filterNsfw(items, nsfw, isBangumiNsfw));

const statusCounts = $derived(() => {
	const counts: Record<string, number> = {};
	for (const item of safeItems) {
		const status =
			STATUS_MAP[item.type as keyof typeof STATUS_MAP] || "unknown";
		counts[status] = (counts[status] || 0) + 1;
	}
	return counts;
});

const filters = $derived(() => {
	const counts = statusCounts();
	// 全部状态栏目常驻显示（含计数为 0 的，如"在看"），便于用户感知完整栏目
	return [
		{
			value: "all",
			label: i18n(I18nKey.bangumiFilterAll),
			count: safeItems.length,
		},
		{
			value: "collect",
			label: getFilterLabel("collect"),
			count: counts.collect || 0,
		},
		{
			value: "doing",
			label: getFilterLabel("doing"),
			count: counts.doing || 0,
		},
		{ value: "wish", label: getFilterLabel("wish"), count: counts.wish || 0 },
		{
			value: "on_hold",
			label: i18n(I18nKey.bangumiFilterOnHold),
			count: counts.on_hold || 0,
		},
		{
			value: "dropped",
			label: i18n(I18nKey.bangumiFilterDropped),
			count: counts.dropped || 0,
		},
	];
});

let activeFilter = $state("all");
// 排序模式：added=最近添加时间，rate=评分，date=开播时间（默认）
let sortMode = $state("date");
let currentPage = $state(1);

const sortOptions = [
	{ value: "added", label: "最近添加" },
	{ value: "rate", label: "评分" },
	{ value: "date", label: "开播时间" },
];

const filteredItems = $derived(
	activeFilter === "all"
		? safeItems
		: safeItems.filter(
				(item) =>
					(STATUS_MAP[item.type as keyof typeof STATUS_MAP] || "unknown") ===
					activeFilter,
			),
);

// 排序：开播时间(date)/最近添加(added) 按降序（新→旧），评分(rate) 高分在前；
// 缺失日期/评分的条目排最后
const sortedItems = $derived(
	[...filteredItems].sort((a, b) => {
		if (sortMode === "rate") {
			const ar = a.subject?.score || 0;
			const br = b.subject?.score || 0;
			return br - ar;
		}
		const key = sortMode === "added" ? "added" : "date";
		const av = key === "added" ? a.updated_at : a.subject?.date || "";
		const bv = key === "added" ? b.updated_at : b.subject?.date || "";
		if (!av && !bv) return 0;
		if (!av) return 1; // a 无日期排后
		if (!bv) return -1;
		return av < bv ? 1 : av > bv ? -1 : 0;
	}),
);

const totalPages = $derived(
	Math.max(1, Math.ceil(filteredItems.length / itemsPerPage)),
);

const pagedItems = $derived(
	sortedItems.slice(
		(currentPage - 1) * itemsPerPage,
		currentPage * itemsPerPage,
	),
);

function handleFilterChange(filter: string) {
	activeFilter = filter;
	currentPage = 1;
}

function handleSortChange(sort: string) {
	sortMode = sort;
	currentPage = 1;
}

function goToPage(page: number) {
	if (page >= 1 && page <= totalPages) {
		currentPage = page;
	}
}
</script>

<div class="media-section" class:hidden={!isActive} data-section={sectionId}>
  {#if safeItems.length > 0}
    <SortControls
      options={sortOptions}
      activeSort={sortMode}
      onSortChange={handleSortChange}
    />
    <FilterControls
      filters={filters()}
      activeFilter={activeFilter}
      onFilterChange={handleFilterChange}
    />

    <div class="media-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
      {#each pagedItems as item (item.subject_id)}
        <div
          class="media-item"
          data-item-section={sectionId}
          data-item-status={STATUS_MAP[item.type as keyof typeof STATUS_MAP] || "unknown"}
        >
          <Card item={item} loadImage={isActive} {subjectBaseUrl} {nsfw} />
        </div>
      {/each}
    </div>

    <ClientPagination
      totalItems={filteredItems.length}
      itemsPerPage={itemsPerPage}
      currentPage={currentPage}
      onPageChange={goToPage}
    />
  {:else}
    <div class="text-center py-12">
      <h3 class="text-xl font-medium text-gray-600 dark:text-gray-400 mb-2">{i18n(I18nKey.bangumiNoData)}</h3>
      <p class="text-gray-500 dark:text-gray-500">{i18n(I18nKey.bangumiNoDataDescription)}</p>
    </div>
  {/if}
</div>

