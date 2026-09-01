<script lang="ts">
interface SortOption {
	value: string;
	label: string;
}

interface Props {
	options: SortOption[];
	activeSort: string;
	onSortChange: (sort: string) => void;
}

const { options, activeSort, onSortChange }: Props = $props();
</script>

<div class="flex flex-wrap items-center gap-1.5 mb-4">
	<span class="text-xs font-medium text-(--content-meta) mr-1">排序</span>
	{#each options as opt}
		<button
			class="px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 {opt.value === activeSort
				? 'bg-(--primary) text-white shadow-md'
				: 'bg-(--btn-regular-bg) text-(--btn-content) hover:bg-(--btn-regular-bg-hover)'}"
			onclick={() => onSortChange(opt.value)}
			type="button"
		>
			{opt.label}
		</button>
	{/each}
</div>
