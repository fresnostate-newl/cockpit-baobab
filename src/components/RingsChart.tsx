import React, { useMemo, useState } from 'react';
import { DiskNode } from '../types/baobab';
import { formatBytes } from '../scanner';

export const BAOBAB_PALETTE = [
    '#3584e4', // GNOME Blue
    '#2ec27e', // GNOME Green
    '#f5c211', // GNOME Yellow
    '#ff7800', // GNOME Orange
    '#e01b24', // GNOME Red
    '#9141ac', // GNOME Purple
    '#986a44', // GNOME Brown
    '#00a896', // Teal
    '#5e5c64', // Slate
    '#e66100', // Deep Orange
];

export function getNodeColor(index: number, depth: number, parentHue?: string): string {
    const base = parentHue || BAOBAB_PALETTE[index % BAOBAB_PALETTE.length];
    if (depth <= 1) return base;
    // Lighten outer rings slightly just like GNOME Baobab
    const factor = Math.min(0.45, (depth - 1) * 0.11);
    return blendWithWhite(base, factor);
}

function blendWithWhite(hex: string, factor: number): string {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    const nr = Math.round(r + (255 - r) * factor);
    const ng = Math.round(g + (255 - g) * factor);
    const nb = Math.round(b + (255 - b) * factor);
    return `rgb(${nr}, ${ng}, ${nb})`;
}

interface ArcSegment {
    node: DiskNode;
    depth: number;
    startAngle: number;
    endAngle: number;
    innerR: number;
    outerR: number;
    color: string;
}

interface RingsChartProps {
    root: DiskNode;
    canZoomOut: boolean;
    hoveredId: string | null;
    selectedId: string | null;
    onHover: (node: DiskNode | null) => void;
    onSelect: (node: DiskNode) => void;
    onZoomIn: (node: DiskNode) => void;
    onZoomOut: () => void;
}

const MAX_RINGS = 5;
const CENTER_R = 58;
const RING_WIDTH = 36;
const SIZE = (CENTER_R + MAX_RINGS * RING_WIDTH) * 2 + 24;
const CX = SIZE / 2;
const CY = SIZE / 2;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return {
        x: cx + r * Math.cos(rad),
        y: cy + r * Math.sin(rad),
    };
}

function describeArcSector(
    cx: number,
    cy: number,
    innerR: number,
    outerR: number,
    startAngle: number,
    endAngle: number,
): string {
    const sweep = Math.min(endAngle - startAngle, 359.99);
    const end = startAngle + sweep;
    const largeArc = sweep > 180 ? 1 : 0;

    const p1 = polarToCartesian(cx, cy, outerR, startAngle);
    const p2 = polarToCartesian(cx, cy, outerR, end);
    const p3 = polarToCartesian(cx, cy, innerR, end);
    const p4 = polarToCartesian(cx, cy, innerR, startAngle);

    return [
        `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
        `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
        'Z',
    ].join(' ');
}

export const RingsChart: React.FC<RingsChartProps> = ({
    root,
    canZoomOut,
    hoveredId,
    selectedId,
    onHover,
    onSelect,
    onZoomIn,
    onZoomOut,
}) => {
    const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

    const segments = useMemo(() => {
        const list: ArcSegment[] = [];
        const totalSize = root.size || 1;

        function walk(
            node: DiskNode,
            depth: number,
            startAngle: number,
            endAngle: number,
            parentColor?: string,
        ) {
            if (depth > MAX_RINGS || !node.children || node.children.length === 0) return;
            const span = endAngle - startAngle;
            if (span < 0.8) return;

            const innerR = CENTER_R + (depth - 1) * RING_WIDTH;
            const outerR = innerR + RING_WIDTH - 2;
            const childrenTotal = node.children.reduce((acc, c) => acc + c.size, 0) || node.size || 1;

            let curAngle = startAngle;
            node.children.forEach((child, idx) => {
                const frac = child.size / childrenTotal;
                const childSpan = frac * span;
                if (childSpan >= 0.6) {
                    const color = getNodeColor(idx, depth, depth === 1 ? undefined : parentColor);
                    const segStart = curAngle;
                    const segEnd = curAngle + childSpan;
                    list.push({
                        node: child,
                        depth,
                        startAngle: segStart,
                        endAngle: segEnd,
                        innerR,
                        outerR,
                        color,
                    });
                    if (child.isDir && child.children && child.children.length > 0) {
                        const baseHex = depth === 1 ? BAOBAB_PALETTE[idx % BAOBAB_PALETTE.length] : parentColor;
                        walk(child, depth + 1, segStart, segEnd, baseHex);
                    }
                }
                curAngle += childSpan;
            });
        }

        walk(root, 1, 0, 360);
        return { list, totalSize };
    }, [root]);

    const hoveredSeg = useMemo(
        () => segments.list.find(s => s.node.id === hoveredId) || null,
        [segments.list, hoveredId],
    );

    const activeNode = hoveredSeg?.node ?? root;
    const activePct = root.size > 0 ? ((activeNode.size / root.size) * 100).toFixed(1) : '100.0';

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
                viewBox={`0 0 ${SIZE} ${SIZE}`}
                className="baobab-rings-svg"
                role="img"
                aria-label={`Disk usage rings chart for ${root.path}`}
            >
                {/* Center Circle (click to zoom out) */}
                <circle
                    cx={CX}
                    cy={CY}
                    r={CENTER_R - 3}
                    className={`baobab-center-circle ${canZoomOut ? 'is-clickable' : ''}`}
                    onClick={() => canZoomOut && onZoomOut()}
                />
                <text x={CX} y={CY - 8} textAnchor="middle" className="baobab-center-title">
                    {root.name.length > 14 ? `${root.name.slice(0, 12)}…` : root.name}
                </text>
                <text x={CX} y={CY + 12} textAnchor="middle" className="baobab-center-size">
                    {formatBytes(root.size)}
                </text>
                {canZoomOut && (
                    <text x={CX} y={CY + 28} textAnchor="middle" className="baobab-center-hint">
                        ↑ Up
                    </text>
                )}

                {/* Concentric Ring Sectors */}
                {segments.list.map((seg) => {
                    const isHovered = hoveredId === seg.node.id;
                    const isSelected = selectedId === seg.node.id;
                    return (
                        <path
                            key={seg.node.id}
                            d={describeArcSector(CX, CY, seg.innerR, seg.outerR, seg.startAngle, seg.endAngle)}
                            fill={seg.color}
                            className={`baobab-ring-slice ${isHovered ? 'is-hovered' : ''} ${isSelected ? 'is-selected' : ''} ${seg.node.isDir ? 'is-dir' : ''}`}
                            onMouseEnter={() => onHover(seg.node)}
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelect(seg.node);
                                if (seg.node.isDir && !seg.node.id.endsWith('/__other__')) {
                                    onZoomIn(seg.node);
                                }
                            }}
                        />
                    );
                })}
            </svg>

            {hoveredSeg && tooltipPos && (
                <div
                    className="baobab-tooltip"
                    style={{
                        left: Math.min(tooltipPos.x + 14, 280),
                        top: Math.max(tooltipPos.y - 12, 8),
                    }}
                >
                    <div className="baobab-tooltip-title">{hoveredSeg.node.name}</div>
                    <div className="baobab-tooltip-meta">
                        <span>{formatBytes(hoveredSeg.node.size)}</span>
                        <span>·</span>
                        <span>{activePct}%</span>
                        <span>·</span>
                        <span>{hoveredSeg.node.items.toLocaleString()} items</span>
                    </div>
                    {hoveredSeg.node.isDir && (
                        <div className="baobab-tooltip-hint">Click to zoom in</div>
                    )}
                </div>
            )}
        </div>
    );
};
