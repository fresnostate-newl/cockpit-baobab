import React, { useMemo, useState } from 'react';
import { Button, Progress, ProgressMeasureLocation, ProgressSize } from '@patternfly/react-core';
import { Table, Tbody, Td, Th, Thead, Tr } from '@patternfly/react-table';
import {
    AngleDownIcon,
    AngleRightIcon,
    FileIcon,
    FolderIcon,
    SearchPlusIcon,
    TrashIcon,
} from '@patternfly/react-icons';
import { DiskNode, SortDirection, SortField } from '../types/baobab';
import { formatBytes, formatDate, isProtectedPath } from '../scanner';
import { BAOBAB_PALETTE } from './RingsChart';

interface TreeViewProps {
    root: DiskNode;
    filterText: string;
    hoveredId: string | null;
    selectedId: string | null;
    onHover: (node: DiskNode | null) => void;
    onSelect: (node: DiskNode) => void;
    onZoomIn: (node: DiskNode) => void;
    onRequestDelete: (node: DiskNode) => void;
}

interface FlatRow {
    node: DiskNode;
    depth: number;
    color?: string;
}

export const TreeView: React.FC<TreeViewProps> = ({
    root,
    filterText,
    hoveredId,
    selectedId,
    onHover,
    onSelect,
    onZoomIn,
    onRequestDelete,
}) => {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
    const [sortField, setSortField] = useState<SortField>('size');
    const [sortDir, setSortDir] = useState<SortDirection>('desc');

    const toggleExpand = (id: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDir(d => (d === 'desc' ? 'asc' : 'desc'));
        } else {
            setSortField(field);
            setSortDir(field === 'name' ? 'asc' : 'desc');
        }
    };

    const rows = useMemo(() => {
        const result: FlatRow[] = [];
        const needle = filterText.trim().toLowerCase();

        function sortNodes(nodes: DiskNode[]): DiskNode[] {
            return [...nodes].sort((a, b) => {
                let cmp = 0;
                if (sortField === 'name') cmp = a.name.localeCompare(b.name);
                else if (sortField === 'size') cmp = a.size - b.size;
                else if (sortField === 'items') cmp = a.items - b.items;
                else cmp = a.mtime - b.mtime;
                return sortDir === 'asc' ? cmp : -cmp;
            });
        }

        function walk(nodes: DiskNode[] | undefined, depth: number, topColor?: string) {
            if (!nodes) return;
            const sorted = sortNodes(nodes);
            sorted.forEach((node, idx) => {
                const color = depth === 0 ? BAOBAB_PALETTE[idx % BAOBAB_PALETTE.length] : topColor;
                const matches = !needle || node.name.toLowerCase().includes(needle);
                if (matches) {
                    result.push({ node, depth, color });
                }
                if (node.isDir && node.children && (expandedIds.has(node.id) || needle.length > 0)) {
                    walk(node.children, depth + 1, color);
                }
            });
        }

        walk(root.children, 0);
        return result;
    }, [root, expandedIds, filterText, sortField, sortDir]);

    const sortArrow = (field: SortField) => {
        if (sortField !== field) return '';
        return sortDir === 'desc' ? ' ▼' : ' ▲';
    };

    return (
        <div className="baobab-tree-wrapper">
            <Table aria-label="Directory disk usage tree" variant="compact" isStickyHeader>
                <Thead>
                    <Tr>
                        <Th width={40} onClick={() => handleSort('name')} className="baobab-sortable-th">
                            Folder / File{sortArrow('name')}
                        </Th>
                        <Th width={20} onClick={() => handleSort('size')} className="baobab-sortable-th">
                            Size{sortArrow('size')}
                        </Th>
                        <Th width={15} onClick={() => handleSort('items')} className="baobab-sortable-th">
                            Contents{sortArrow('items')}
                        </Th>
                        <Th width={15} onClick={() => handleSort('mtime')} className="baobab-sortable-th">
                            Modified{sortArrow('mtime')}
                        </Th>
                        <Th width={10} screenReaderText="Actions" />
                    </Tr>
                </Thead>
                <Tbody>
                    {rows.length === 0 ? (
                        <Tr>
                            <Td colSpan={5} className="baobab-empty-row">
                                {filterText ? 'No matching files or folders.' : 'This folder is empty.'}
                            </Td>
                        </Tr>
                    ) : (
                        rows.map(({ node, depth, color }) => {
                            const pct = root.size > 0 ? Math.round((node.size / root.size) * 1000) / 10 : 0;
                            const isExpanded = expandedIds.has(node.id);
                            const hasKids = node.isDir && node.children && node.children.length > 0;
                            const isHighlighted = hoveredId === node.id || selectedId === node.id;
                            const isOther = node.id.endsWith('/__other__');

                            return (
                                <Tr
                                    key={node.id}
                                    isClickable
                                    isRowSelected={isHighlighted}
                                    onMouseEnter={() => onHover(node)}
                                    onMouseLeave={() => onHover(null)}
                                    onClick={() => onSelect(node)}
                                    onDoubleClick={() => {
                                        if (node.isDir && !isOther) onZoomIn(node);
                                    }}
                                >
                                    <Td dataLabel="Name">
                                        <div
                                            className="baobab-tree-name"
                                            style={{ paddingLeft: `${depth * 18}px` }}
                                        >
                                            {hasKids ? (
                                                <button
                                                    type="button"
                                                    className="baobab-expand-btn"
                                                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleExpand(node.id);
                                                    }}
                                                >
                                                    {isExpanded ? <AngleDownIcon /> : <AngleRightIcon />}
                                                </button>
                                            ) : (
                                                <span className="baobab-expand-spacer" />
                                            )}
                                            {color && (
                                                <span
                                                    className="baobab-color-dot"
                                                    style={{ backgroundColor: color }}
                                                />
                                            )}
                                            <span className="baobab-node-icon">
                                                {node.isDir ? <FolderIcon /> : <FileIcon />}
                                            </span>
                                            <span className="baobab-node-label" title={node.path}>
                                                {node.name}
                                            </span>
                                            {node.error && (
                                                <span className="baobab-node-error" title={node.error}>
                                                    (restricted)
                                                </span>
                                            )}
                                        </div>
                                    </Td>
                                    <Td dataLabel="Size">
                                        <div className="baobab-size-cell">
                                            <span className="baobab-size-text">{formatBytes(node.size)}</span>
                                            <Progress
                                                value={pct}
                                                size={ProgressSize.sm}
                                                measureLocation={ProgressMeasureLocation.none}
                                                aria-label={`${pct}% of current directory`}
                                            />
                                        </div>
                                    </Td>
                                    <Td dataLabel="Contents">
                                        {node.isDir ? `${node.items.toLocaleString()} items` : '1 file'}
                                    </Td>
                                    <Td dataLabel="Modified">{formatDate(node.mtime)}</Td>
                                    <Td isActionCell>
                                        <div className="baobab-row-actions">
                                            {node.isDir && !isOther && (
                                                <Button
                                                    variant="plain"
                                                    size="sm"
                                                    aria-label={`Zoom into ${node.name}`}
                                                    title="Zoom into folder"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onZoomIn(node);
                                                    }}
                                                >
                                                    <SearchPlusIcon />
                                                </Button>
                                            )}
                                            {!isOther && !isProtectedPath(node.path) && (
                                                <Button
                                                    variant="plain"
                                                    size="sm"
                                                    isDanger
                                                    aria-label={`Delete ${node.name}`}
                                                    title="Delete"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onRequestDelete(node);
                                                    }}
                                                >
                                                    <TrashIcon />
                                                </Button>
                                            )}
                                        </div>
                                    </Td>
                                </Tr>
                            );
                        })
                    )}
                </Tbody>
            </Table>
        </div>
    );
};
