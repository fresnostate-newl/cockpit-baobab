import React, { useMemo, useState } from 'react';
import { DiskNode } from '../types/baobab';
import { formatBytes } from '../scanner';
import { BAOBAB_PALETTE } from './RingsChart';

interface RectNode {
    node: DiskNode;
    x: number;
    y: number;
    w: number;
    h: number;
    color: string;
    depth: number;
}

interface TreemapChartProps {
    root: DiskNode;
    hoveredId: string | null;
    selectedId: string | null;
    onHover: (node: DiskNode | null) => void;
    onSelect: (node: DiskNode) => void;
    onZoomIn: (node: DiskNode) => void;
}

const WIDTH = 560;
const HEIGHT = 420;

function layoutStrip(
    items: { node: DiskNode; area: number; color: string }[],
    x: number,
    y: number,
    w: number,
    h: number,
): { node: DiskNode; x: number; y: number; w: number; h: number; color: string }[] {
    const result: { node: DiskNode; x: number; y: number; w: number; h: number; color: string }[] = [];
    if (items.length === 0 || w <= 0 || h <= 0) return result;

    let remaining = [...items];
    let cx = x;
    let cy = y;
    let cw = w;
    let ch = h;

    while (remaining.length > 0) {
        const horizontal = cw >= ch;
        const side = horizontal ? ch : cw;
        const totalRemArea = remaining.reduce((s, it) => s + it.area, 0);
        if (totalRemArea <= 0) break;

        let row: typeof items = [];
        let rowArea = 0;
        let bestAspect = Infinity;

        for (let i = 0; i < remaining.length; i++) {
            const candidate = [...row, remaining[i]];
            const candArea = rowArea + remaining[i].area;
            const thickness = candArea / side;
            let worst = 0;
            for (const c of candidate) {
                const len = c.area / thickness;
                const aspect = Math.max(thickness / Math.max(len, 0.1), len / Math.max(thickness, 0.1));
                if (aspect > worst) worst = aspect;
            }
            if (worst <= bestAspect || row.length === 0) {
                bestAspect = worst;
                row = candidate;
                rowArea = candArea;
            } else {
                break;
            }
        }

        const thickness = rowArea / side;
        let offset = 0;
        for (const item of row) {
            const len = item.area / Math.max(thickness, 0.1);
            if (horizontal) {
                result.push({ node: item.node, x: cx, y: cy + offset, w: thickness, h: len, color: item.color });
            } else {
                result.push({ node: item.node, x: cx + offset, y: cy, w: len, h: thickness, color: item.color });
            }
            offset += len;
        }

        if (horizontal) {
            cx += thickness;
            cw -= thickness;
        } else {
            cy += thickness;
            ch -= thickness;
        }
        remaining = remaining.slice(row.length);
    }

    return result;
}

export const TreemapChart: React.FC<TreemapChartProps> = ({
    root,
    hoveredId,
    selectedId,
    onHover,
    onSelect,
    onZoomIn,
}) => {
    const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

    const rects = useMemo(() => {
        const out: RectNode[] = [];

        function build(node: DiskNode, x: number, y: number, w: number, h: number, depth: number, parentColor?: string) {
            if (!node.children || node.children.length === 0 || depth > 2 || w < 18 || h < 18) return;
            const valid = node.children.filter(c => c.size > 0);
            const total = valid.reduce((s, c) => s + c.size, 0);
            if (total <= 0) return;

            const area = w * h;
            const items = valid.map((c, idx) => ({
                node: c,
                area: (c.size / total) * area,
                color: depth === 0 ? BAOBAB_PALETTE[idx % BAOBAB_PALETTE.length] : (parentColor || BAOBAB_PALETTE[idx % BAOBAB_PALETTE.length]),
            }));

            const laid = layoutStrip(items, x, y, w, h);
            for (const r of laid) {
                out.push({ ...r, depth });
                if (r.node.isDir && r.node.children && r.node.children.length > 0 && r.w > 48 && r.h > 48 && depth < 2) {
                    const pad = 3;
                    const header = 16;
                    if (r.w - pad * 2 > 16 && r.h - header - pad > 16) {
                        build(r.node, r.x + pad, r.y + header, r.w - pad * 2, r.h - header - pad, depth + 1, r.color);
                    }
                }
            }
        }

        build(root, 2, 2, WIDTH - 4, HEIGHT - 4, 0);
        return out;
    }, [root]);

    const hoveredNode = useMemo(
        () => rects.find(r => r.node.id === hoveredId)?.node || null,
        [rects, hoveredId],
    );

    return (
        <div
            className="baobab-chart-container"
            onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
            }}
            onMouseLeave={() => {
                onHover(null);
                setTooltipPos(null);
            }}
        >
            <svg
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                className="baobab-treemap-svg"
                role="img"
                aria-label={`Disk usage treemap for ${root.path}`}
            >
                {rects.map((r) => {
                    const isHovered = hoveredId === r.node.id;
                    const isSelected = selectedId === r.node.id;
                    const showLabel = r.w > 64 && r.h > 28;
                    const showSize = r.w > 72 && r.h > 44;

                    return (
                        <g
                            key={`${r.depth}:${r.node.id}`}
                            className={`baobab-treemap-cell ${isHovered ? 'is-hovered' : ''} ${isSelected ? 'is-selected' : ''}`}
                            onMouseEnter={(e) => {
                                e.stopPropagation();
                                onHover(r.node);
                            }}
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelect(r.node);
                                if (r.node.isDir && !r.node.id.endsWith('/__other__')) {
                                    onZoomIn(r.node);
                                }
                            }}
                        >
                            <rect
                                x={r.x + 0.5}
                                y={r.y + 0.5}
                                width={Math.max(0, r.w - 1)}
                                height={Math.max(0, r.h - 1)}
                                rx={3}
                                fill={r.color}
                                fillOpacity={r.depth === 0 ? 0.85 : 0.72}
                                stroke="#ffffff"
                                strokeWidth={isHovered || isSelected ? 2 : 1}
                            />
                            {showLabel && (
                                <text
                                    x={r.x + 6}
                                    y={r.y + 14}
                                    className="baobab-treemap-label"
                                >
                                    {r.node.name.length > Math.floor(r.w / 7.5)
                                        ? `${r.node.name.slice(0, Math.max(3, Math.floor(r.w / 7.5) - 1))}…`
                                        : r.node.name}
                                </text>
                            )}
                            {showSize && (
                                <text
                                    x={r.x + 6}
                                    y={r.y + 30}
                                    className="baobab-treemap-size"
                                >
                                    {formatBytes(r.node.size)}
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>

            {hoveredNode && tooltipPos && (
                <div
                    className="baobab-tooltip"
                    style={{
                        left: Math.min(tooltipPos.x + 14, 280),
                        top: Math.max(tooltipPos.y - 12, 8),
                    }}
                >
                    <div className="baobab-tooltip-title">{hoveredNode.name}</div>
                    <div className="baobab-tooltip-meta">
                        <span>{formatBytes(hoveredNode.size)}</span>
                        <span>·</span>
                        <span>{root.size > 0 ? ((hoveredNode.size / root.size) * 100).toFixed(1) : '0'}%</span>
                        <span>·</span>
                        <span>{hoveredNode.items.toLocaleString()} items</span>
                    </div>
                    {hoveredNode.isDir && (
                        <div className="baobab-tooltip-hint">Click to zoom in</div>
                    )}
                </div>
            )}
        </div>
    );
};
