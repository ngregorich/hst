	<script lang="ts">
		import type { Comment, Sentiment } from '$lib/schema';

interface Props {
	comments: Comment[];
	selectedId: number | null;
	onSelect: (id: number) => void;
}

interface NodePosition {
	id: number;
	parentId: number | null;
	author: string;
	sentiment?: Sentiment;
	x: number;
	y: number;
}

interface EdgePosition {
	id: string;
	startX: number;
	startY: number;
	midX: number;
	endX: number;
	endY: number;
}

let { comments, selectedId, onSelect }: Props = $props();

const NODE_SIZE = 12;
const INDENT = 32;
const ROW_STEP = 28;
const PAD_X = 10;
const PAD_Y = 10;
const MIN_WIDTH = 220;
const MIN_HEIGHT = 120;

function nodeFill(sentiment?: string): string {
	switch (sentiment) {
		case 'promoter': return '#22c55e';
		case 'neutral': return '#64748b';
		case 'detractor': return 'url(#detractor-hatch)';
		default: return '#e5e7eb';
	}
}

let layout = $derived.by(() => {
	const nodes: NodePosition[] = [];
	let row = 0;
	let maxDepth = 0;

	const walk = (list: Comment[], depth: number) => {
		for (const c of list) {
			maxDepth = Math.max(maxDepth, depth);
			const x = PAD_X + depth * INDENT + NODE_SIZE / 2;
			const y = PAD_Y + row * ROW_STEP + NODE_SIZE / 2;
			nodes.push({
				id: c.id,
				parentId: c.parentId,
				author: c.author,
				sentiment: c.analysis?.sentiment,
				x,
				y
			});
			row += 1;
			walk(c.children, depth + 1);
		}
	};

	walk(comments, 0);

	const byId = new Map<number, NodePosition>();
	for (const n of nodes) byId.set(n.id, n);

	const edges: EdgePosition[] = [];
	for (const child of nodes) {
		if (child.parentId === null) continue;
		const parent = byId.get(child.parentId);
		if (!parent) continue;
		const startX = parent.x + NODE_SIZE / 2;
		const startY = parent.y;
		const endX = child.x - NODE_SIZE / 2;
		const endY = child.y;
		const midX = (startX + endX) / 2;
		edges.push({
			id: `${parent.id}-${child.id}`,
			startX,
			startY,
			midX,
			endX,
			endY
		});
	}

	const width = Math.max(MIN_WIDTH, PAD_X * 2 + maxDepth * INDENT + NODE_SIZE + 2);
	const height = Math.max(MIN_HEIGHT, PAD_Y * 2 + Math.max(0, row - 1) * ROW_STEP + NODE_SIZE + 2);
	return { nodes, edges, width, height };
});
</script>

<div class="w-max min-w-full pr-4">
	<svg width={layout.width} height={layout.height} class="block">
		<defs>
			<pattern id="detractor-hatch" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
				<rect width="4" height="4" fill="#ef4444"></rect>
				<line x1="0" y1="0" x2="0" y2="4" stroke="rgba(255,255,255,0.72)" stroke-width="1"></line>
			</pattern>
		</defs>

		{#each layout.edges as edge (edge.id)}
			<path
				d="M {edge.startX} {edge.startY} H {edge.midX} V {edge.endY} H {edge.endX}"
				fill="none"
				stroke="currentColor"
				class="text-gray-300 dark:text-gray-600"
				stroke-width="1"
				stroke-linecap="square"
				shape-rendering="geometricPrecision"
			></path>
		{/each}

		{#each layout.nodes as node (node.id)}
			<g
				id="tree-node-{node.id}"
				class="cursor-pointer"
				role="button"
				tabindex="0"
				onclick={() => onSelect(node.id)}
				onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(node.id)}
				aria-label="{node.author}: {node.sentiment || 'not analyzed yet'}"
			>
				<title>{node.author}: {node.sentiment || 'not analyzed yet'}</title>
				<rect
					x={node.x - NODE_SIZE / 2}
					y={node.y - NODE_SIZE / 2}
					width={NODE_SIZE}
					height={NODE_SIZE}
					rx="3"
					ry="3"
					fill={nodeFill(node.sentiment)}
					stroke={node.sentiment ? 'transparent' : '#9ca3af'}
					stroke-width={node.sentiment ? 0 : 1}
				></rect>
				{#if selectedId === node.id}
					<rect
						x={node.x - NODE_SIZE / 2 - 2}
						y={node.y - NODE_SIZE / 2 - 2}
						width={NODE_SIZE + 4}
						height={NODE_SIZE + 4}
						rx="5"
						ry="5"
						fill="none"
						stroke="#facc15"
						stroke-width="2"
					></rect>
				{/if}
			</g>
		{/each}
	</svg>
</div>
