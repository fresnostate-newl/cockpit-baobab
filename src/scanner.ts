import cockpit, { SpawnProcess } from 'cockpit';
import { DiskNode, MountLocation, ScanProgress } from './baobab';

const VIRTUAL_MOUNTS = new Set(['/proc', '/sys', '/dev', '/run']);

const SCANNER_PY = `
import json, os, stat, sys

root_path = os.path.abspath(sys.argv[1])
one_fs = sys.argv[2] == '1'
max_depth = int(sys.argv[3])
max_children = int(sys.argv[4])

seen_inodes = set()
stats = {'files': 0, 'dirs': 0, 'bytes': 0}

try:
    root_stat = os.lstat(root_path)
    root_dev = root_stat.st_dev
except OSError as e:
    print(json.dumps({
        'id': root_path,
        'name': os.path.basename(root_path) or root_path,
        'path': root_path,
        'size': 0,
        'allocatedSize': 0,
        'items': 0,
        'isDir': True,
        'mtime': 0,
        'error': str(e),
        'children': []
    }))
    sys.exit(0)

SKIP_VIRTUAL = {'/proc', '/sys', '/dev', '/run'}

def scan(path, name, depth, st=None):
    if st is None:
        try:
            st = os.lstat(path)
        except OSError as e:
            return {
                'id': path, 'name': name, 'path': path,
                'size': 0, 'allocatedSize': 0, 'items': 0,
                'isDir': False, 'mtime': 0, 'error': str(e)
            }

    is_dir = stat.S_ISDIR(st.st_mode)
    if not is_dir:
        ino_key = (st.st_dev, st.st_ino)
        if st.st_nlink > 1 and ino_key in seen_inodes:
            size = 0
            alloc = 0
        else:
            if st.st_nlink > 1:
                seen_inodes.add(ino_key)
            size = st.st_size
            alloc = getattr(st, 'st_blocks', 0) * 512
        stats['files'] += 1
        stats['bytes'] += size
        if stats['files'] % 400 == 0:
            sys.stderr.write(f"PROGRESS:{stats['files']}:{stats['dirs']}:{stats['bytes']}:{path}\\n")
            sys.stderr.flush()
        return {
            'id': path,
            'name': name,
            'path': path,
            'size': size,
            'allocatedSize': alloc,
            'items': 1,
            'isDir': False,
            'mtime': int(st.st_mtime)
        }

    stats['dirs'] += 1
    if stats['dirs'] % 100 == 0:
        sys.stderr.write(f"PROGRESS:{stats['files']}:{stats['dirs']}:{stats['bytes']}:{path}\\n")
        sys.stderr.flush()

    total_size = 0
    total_alloc = 0
    total_items = 0
    children = []
    err_msg = None

    try:
        with os.scandir(path) as it:
            for entry in it:
                epath = entry.path
                if epath in SKIP_VIRTUAL and root_path == '/':
                    continue
                try:
                    est = entry.stat(follow_symlinks=False)
                except OSError:
                    continue
                if one_fs and est.st_dev != root_dev:
                    continue
                child = scan(epath, entry.name, depth + 1, est)
                total_size += child['size']
                total_alloc += child['allocatedSize']
                total_items += child['items']
                if depth < max_depth:
                    children.append(child)
    except OSError as e:
        err_msg = str(e)

    if children:
        children.sort(key=lambda c: c['size'], reverse=True)
        if len(children) > max_children:
            kept = children[:max_children]
            rest = children[max_children:]
            other_size = sum(c['size'] for c in rest)
            other_alloc = sum(c['allocatedSize'] for c in rest)
            other_items = sum(c['items'] for c in rest)
            if other_size > 0 or other_items > 0:
                kept.append({
                    'id': path + '/__other__',
                    'name': f'Other ({len(rest)} items)',
                    'path': path,
                    'size': other_size,
                    'allocatedSize': other_alloc,
                    'items': other_items,
                    'isDir': False,
                    'mtime': int(st.st_mtime)
                })
            children = kept

    node = {
        'id': path,
        'name': name,
        'path': path,
        'size': total_size,
        'allocatedSize': total_alloc,
        'items': total_items,
        'isDir': True,
        'mtime': int(st.st_mtime),
        'children': children
    }
    if err_msg:
        node['error'] = err_msg
    return node

tree = scan(root_path, os.path.basename(root_path) or root_path, 0, root_stat)
sys.stderr.write(f"PROGRESS:{stats['files']}:{stats['dirs']}:{stats['bytes']}:{root_path}\\n")
sys.stderr.flush()
print(json.dumps(tree))
`;

export function formatBytes(bytes: number): string {
    if (typeof cockpit !== 'undefined' && typeof cockpit.format_bytes === 'function') {
        return cockpit.format_bytes(bytes, { base2: true, precision: 1 });
    }
    if (bytes === 0) return '0 B';
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const val = bytes / Math.pow(1024, i);
    return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(epochSec: number): string {
    if (!epochSec) return '—';
    const d = new Date(epochSec * 1000);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export async function listLocations(): Promise<MountLocation[]> {
    const locations: MountLocation[] = [];
    let homePath = '';

    try {
        const user = await cockpit.user();
        if (user?.home) {
            homePath = user.home;
        }
    } catch {
        // ignore if user info unavailable
    }

    const dfOut = await cockpit.spawn(
        [
            'df', '-PB1',
            '--output=source,fstype,size,used,avail,pcent,target',
            '-x', 'tmpfs', '-x', 'devtmpfs', '-x', 'squashfs', '-x', 'overlay', '-x', 'efivarfs',
        ],
        { err: 'message' },
    );

    const lines = dfOut.trim().split('\n').slice(1);
    const seenTargets = new Set<string>();

    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length < 7) continue;
        const [source, fsType, sizeStr, usedStr, availStr, pcentStr, ...targetParts] = parts;
        const target = targetParts.join(' ');
        if (VIRTUAL_MOUNTS.has(target) || seenTargets.has(target)) continue;
        seenTargets.add(target);

        const totalBytes = Number(sizeStr) || 0;
        const usedBytes = Number(usedStr) || 0;
        const availBytes = Number(availStr) || 0;
        const usedPercent = parseInt(pcentStr.replace('%', ''), 10) || 0;

        locations.push({
            id: `mount:${target}`,
            label: target === '/' ? 'Computer (Root Filesystem)' : target,
            path: target,
            device: source,
            fsType,
            totalBytes,
            usedBytes,
            availBytes,
            usedPercent,
            isRoot: target === '/',
        });
    }

    if (homePath) {
        locations.unshift({
            id: `home:${homePath}`,
            label: 'Home Folder',
            path: homePath,
            device: 'User Home',
            fsType: 'Directory',
            totalBytes: 0,
            usedBytes: 0,
            availBytes: 0,
            usedPercent: 0,
            isHome: true,
        });
    }

    return locations;
}

export interface ScanHandle {
    promise: Promise<DiskNode>;
    cancel: () => void;
}

export function startScan(
    targetPath: string,
    options: {
        oneFileSystem?: boolean;
        maxDepth?: number;
        maxChildren?: number;
        onProgress?: (progress: ScanProgress) => void;
    } = {},
): ScanHandle {
    const oneFs = options.oneFileSystem !== false ? '1' : '0';
    const maxDepth = String(options.maxDepth ?? 6);
    const maxChildren = String(options.maxChildren ?? 60);

    let proc: SpawnProcess | null = null;
    let stderrBuf = '';

    const promise = new Promise<DiskNode>((resolve, reject) => {
        proc = cockpit.spawn(
            ['python3', '-c', SCANNER_PY, targetPath, oneFs, maxDepth, maxChildren],
            { superuser: 'try', err: 'out' },
        );

        let stdoutBuf = '';
        proc.stream((chunk: string) => {
            for (const line of chunk.split('\n')) {
                if (line.startsWith('PROGRESS:')) {
                    const [, files, dirs, bytes, ...pParts] = line.split(':');
                    if (options.onProgress) {
                        options.onProgress({
                            scannedFiles: Number(files) || 0,
                            scannedDirs: Number(dirs) || 0,
                            scannedBytes: Number(bytes) || 0,
                            currentPath: pParts.join(':'),
                        });
                    }
                } else {
                    stdoutBuf += line;
                }
            }
            stderrBuf = stdoutBuf;
        });

        proc.then((finalOut) => {
            const raw = (finalOut || stderrBuf).trim();
            const jsonStart = raw.indexOf('{');
            if (jsonStart === -1) {
                reject(new Error('Scanner did not return valid JSON output.'));
                return;
            }
            try {
                const parsed = JSON.parse(raw.slice(jsonStart)) as DiskNode;
                resolve(parsed);
            } catch (e) {
                reject(new Error(`Failed to parse scan output: ${(e as Error).message}`));
            }
        }).catch((err: unknown) => {
            reject(err instanceof Error ? err : new Error(String(err)));
        });
    });

    return {
        promise,
        cancel: () => {
            if (proc) {
                proc.close('cancelled');
            }
        },
    };
}

const PROTECTED_PATHS = new Set([
    '/', '/bin', '/boot', '/dev', '/etc', '/home', '/lib', '/lib64',
    '/opt', '/proc', '/root', '/run', '/sbin', '/srv', '/sys', '/tmp', '/usr', '/var',
]);

export function isProtectedPath(path: string): boolean {
    const normalized = path.replace(/\/+$/, '') || '/';
    return PROTECTED_PATHS.has(normalized);
}

export async function deletePath(path: string): Promise<void> {
    if (!path || isProtectedPath(path)) {
        throw new Error(`Refusing to delete protected system path: ${path}`);
    }
    await cockpit.spawn(['rm', '-rf', '--', path], { superuser: 'try', err: 'message' });
}
