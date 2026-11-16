export interface DiskNode {
    id: string;
    name: string;
    path: string;
    size: number;
    allocatedSize: number;
    items: number;
    isDir: boolean;
    mtime: number;
    error?: string;
    children?: DiskNode[];
}

export interface MountLocation {
    id: string;
    label: string;
    path: string;
    device: string;
    fsType: string;
    totalBytes: number;
    usedBytes: number;
    availBytes: number;
    usedPercent: number;
    isHome?: boolean;
    isRoot?: boolean;
}

export interface ScanProgress {
    scannedFiles: number;
    scannedDirs: number;
    scannedBytes: number;
    currentPath: string;
}

export type ChartMode = 'rings' | 'treemap';

export type SortField = 'size' | 'name' | 'items' | 'mtime';
export type SortDirection = 'asc' | 'desc';
