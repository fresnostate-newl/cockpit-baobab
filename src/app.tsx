import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    Alert,
    Breadcrumb,
    BreadcrumbItem,
    Button,
    Card,
    CardBody,
    CardHeader,
    CardTitle,
    Checkbox,
    EmptyState,
    EmptyStateActions,
    EmptyStateBody,
    EmptyStateFooter,
    Flex,
    FlexItem,
    Grid,
    GridItem,
    Modal,
    ModalBody,
    ModalFooter,
    ModalHeader,
    Page,
    PageSection,
    Progress,
    SearchInput,
    Spinner,
    Split,
    SplitItem,
    TextInput,
    ToggleGroup,
    ToggleGroupItem,
    Toolbar,
    ToolbarContent,
    ToolbarItem,
} from '@patternfly/react-core';
import {
    ArrowLeftIcon,
    ChartPieIcon,
    FolderOpenIcon,
    HddIcon,
    HomeIcon,
    RedoIcon,
    ServerIcon,
    ThLargeIcon,
} from '@patternfly/react-icons';
import cockpit from 'cockpit';
import { ChartMode, DiskNode, MountLocation, ScanProgress } from './types/baobab';
import { deletePath, formatBytes, listLocations, ScanHandle, startScan } from './scanner';
import { RingsChart } from './components/RingsChart';
import { TreemapChart } from './components/TreemapChart';
import { TreeView } from './components/TreeView';

const _ = cockpit.gettext;

export const Application: React.FC = () => {
    const [locations, setLocations] = useState<MountLocation[]>([]);
    const [locationsLoading, setLocationsLoading] = useState(true);
    const [locationsError, setLocationsError] = useState<string | null>(null);

    const [customPath, setCustomPath] = useState('');
    const [oneFileSystem, setOneFileSystem] = useState(true);

    const [scanRoot, setScanRoot] = useState<DiskNode | null>(null);
    const [zoomStack, setZoomStack] = useState<DiskNode[]>([]);
    const [scanning, setScanning] = useState(false);
    const [scanTarget, setScanTarget] = useState<string>('');
    const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
    const [scanError, setScanError] = useState<string | null>(null);

    const [chartMode, setChartMode] = useState<ChartMode>('rings');
    const [filterText, setFilterText] = useState('');
    const [hoveredNode, setHoveredNode] = useState<DiskNode | null>(null);
    const [selectedNode, setSelectedNode] = useState<DiskNode | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<DiskNode | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const scanHandleRef = useRef<ScanHandle | null>(null);

    const loadLocations = useCallback(async () => {
        setLocationsLoading(true);
        setLocationsError(null);
        try {
            const locs = await listLocations();
            setLocations(locs);
        } catch (err) {
            setLocationsError(err instanceof Error ? err.message : String(err));
        } finally {
            setLocationsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadLocations();
        return () => {
            scanHandleRef.current?.cancel();
        };
    }, [loadLocations]);

    const runScan = useCallback((targetPath: string) => {
        const cleanPath = targetPath.trim();
        if (!cleanPath) return;

        scanHandleRef.current?.cancel();
        setScanning(true);
        setScanTarget(cleanPath);
        setScanError(null);
        setScanProgress(null);
        setFilterText('');
        setHoveredNode(null);
        setSelectedNode(null);

        const handle = startScan(cleanPath, {
            oneFileSystem,
            maxDepth: 6,
            maxChildren: 60,
            onProgress: (p) => setScanProgress(p),
        });
        scanHandleRef.current = handle;

        handle.promise
            .then((tree) => {
                setScanRoot(tree);
                setZoomStack([tree]);
                setSelectedNode(tree);
                setScanning(false);
            })
            .catch((err: unknown) => {
                const msg = err instanceof Error ? err.message : String(err);
                if (msg !== 'cancelled') {
                    setScanError(msg);
                }
                setScanning(false);
            });
    }, [oneFileSystem]);

    const cancelScan = () => {
        scanHandleRef.current?.cancel();
        setScanning(false);
    };

    const currentRoot = zoomStack.length > 0 ? zoomStack[zoomStack.length - 1] : scanRoot;

    const handleZoomIn = (node: DiskNode) => {
        if (!node.isDir || node.id.endsWith('/__other__')) return;
        setZoomStack(prev => [...prev, node]);
        setSelectedNode(node);
        setHoveredNode(null);
    };

    const handleZoomOut = () => {
        if (zoomStack.length <= 1) return;
        setZoomStack((prev) => {
            const next = prev.slice(0, -1);
            setSelectedNode(next[next.length - 1] ?? null);
            return next;
        });
        setHoveredNode(null);
    };

    const handleBreadcrumbClick = (index: number) => {
        setZoomStack((prev) => {
            const next = prev.slice(0, index + 1);
            setSelectedNode(next[next.length - 1] ?? null);
            return next;
        });
        setHoveredNode(null);
    };

    const handleConfirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        setDeleteError(null);
        try {
            await deletePath(deleteTarget.path);
            const rescanPath = scanRoot?.path || currentRoot?.path;
            setDeleteTarget(null);
            if (rescanPath) {
                runScan(rescanPath);
            }
        } catch (err) {
            setDeleteError(err instanceof Error ? err.message : String(err));
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Page className="pf-m-no-sidebar baobab-page">
            <PageSection>
                {scanning ? (
                    <Card>
                        <CardBody>
                            <EmptyState
                                titleText={`Scanning ${scanTarget}…`}
                                headingLevel="h2"
                                icon={Spinner}
                            >
                                <EmptyStateBody>
                                    {scanProgress ? (
                                        <div className="baobab-scan-progress">
                                            <div>
                                                <strong>{scanProgress.scannedFiles.toLocaleString()}</strong> files ·{' '}
                                                <strong>{scanProgress.scannedDirs.toLocaleString()}</strong> folders ·{' '}
                                                <strong>{formatBytes(scanProgress.scannedBytes)}</strong>
                                            </div>
                                            <div className="baobab-scan-path" title={scanProgress.currentPath}>
                                                {scanProgress.currentPath}
                                            </div>
                                        </div>
                                    ) : (
                                        _('Starting directory traversal…')
                                    )}
                                </EmptyStateBody>
                                <EmptyStateFooter>
                                    <EmptyStateActions>
                                        <Button variant="secondary" onClick={cancelScan}>
                                            {_('Cancel Scan')}
                                        </Button>
                                    </EmptyStateActions>
                                </EmptyStateFooter>
                            </EmptyState>
                        </CardBody>
                    </Card>
                ) : !currentRoot ? (
                    /* Devices & Locations Home View (modeled after GNOME Baobab) */
                    <div className="baobab-locations-view">
                        <Card className="baobab-header-card">
                            <CardHeader>
                                <CardTitle>{_('Disk Usage Analyzer')}</CardTitle>
                            </CardHeader>
                            <CardBody>
                                <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapMd' }}>
                                    <FlexItem grow={{ default: 'grow' }}>
                                        <TextInput
                                            id="baobab-custom-path"
                                            value={customPath}
                                            onChange={(_e, val) => setCustomPath(val)}
                                            placeholder="/var/log or /home/user"
                                            aria-label={_('Folder path to scan')}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') runScan(customPath);
                                            }}
                                        />
                                    </FlexItem>
                                    <FlexItem>
                                        <Button
                                            variant="primary"
                                            icon={<FolderOpenIcon />}
                                            isDisabled={!customPath.trim()}
                                            onClick={() => runScan(customPath)}
                                        >
                                            {_('Scan Folder')}
                                        </Button>
                                    </FlexItem>
                                    <FlexItem>
                                        <Checkbox
                                            id="baobab-one-fs"
                                            label={_('Stay on single filesystem')}
                                            isChecked={oneFileSystem}
                                            onChange={(_e, checked) => setOneFileSystem(checked)}
                                        />
                                    </FlexItem>
                                </Flex>

                                {scanError && (
                                    <Alert
                                        variant="danger"
                                        title={_('Scan failed')}
                                        className="baobab-alert-mt"
                                        isInline
                                    >
                                        {scanError}
                                    </Alert>
                                )}
                            </CardBody>
                        </Card>

                        <Card>
                            <CardHeader>
                                <Split hasGutter>
                                    <SplitItem isFilled>
                                        <CardTitle>{_('Devices & Locations')}</CardTitle>
                                    </SplitItem>
                                    <SplitItem>
                                        <Button variant="link" icon={<RedoIcon />} onClick={loadLocations}>
                                            {_('Refresh')}
                                        </Button>
                                    </SplitItem>
                                </Split>
                            </CardHeader>
                            <CardBody>
                                {locationsError && (
                                    <Alert variant="warning" title={locationsError} isInline />
                                )}
                                {locationsLoading ? (
                                    <Spinner size="lg" aria-label={_('Loading locations')} />
                                ) : (
                                    <Grid hasGutter md={6} lg={4}>
                                        {locations.map((loc) => (
                                            <GridItem key={loc.id}>
                                                <Card
                                                    isClickable
                                                    isCompact
                                                    className="baobab-location-card"
                                                    onClick={() => runScan(loc.path)}
                                                >
                                                    <CardBody>
                                                        <Flex alignItems={{ default: 'alignItemsCenter' }} gap={{ default: 'gapSm' }}>
                                                            <FlexItem className="baobab-location-icon">
                                                                {loc.isHome ? (
                                                                    <HomeIcon />
                                                                ) : loc.isRoot ? (
                                                                    <ServerIcon />
                                                                ) : (
                                                                    <HddIcon />
                                                                )}
                                                            </FlexItem>
                                                            <FlexItem grow={{ default: 'grow' }}>
                                                                <div className="baobab-location-title">{loc.label}</div>
                                                                <div className="baobab-location-sub">
                                                                    {loc.path} · {loc.fsType}
                                                                </div>
                                                            </FlexItem>
                                                        </Flex>
                                                        {loc.totalBytes > 0 && (
                                                            <div className="baobab-location-usage">
                                                                <Progress
                                                                    value={loc.usedPercent}
                                                                    title={`${formatBytes(loc.usedBytes)} / ${formatBytes(loc.totalBytes)}`}
                                                                    aria-label={`${loc.label} disk usage`}
                                                                />
                                                                <div className="baobab-location-avail">
                                                                    {formatBytes(loc.availBytes)} available
                                                                </div>
                                                            </div>
                                                        )}
                                                    </CardBody>
                                                </Card>
                                            </GridItem>
                                        ))}
                                    </Grid>
                                )}
                            </CardBody>
                        </Card>
                    </div>
                ) : (
                    /* Split Analyzer View (Tree View + Rings Chart / Treemap) */
                    <Card className="baobab-analyzer-card">
                        <Toolbar className="baobab-toolbar">
                            <ToolbarContent>
                                <ToolbarItem>
                                    <Button
                                        variant="secondary"
                                        icon={<ArrowLeftIcon />}
                                        onClick={() => {
                                            setScanRoot(null);
                                            setZoomStack([]);
                                        }}
                                    >
                                        {_('Locations')}
                                    </Button>
                                </ToolbarItem>
                                <ToolbarItem className="baobab-breadcrumb-item">
                                    <Breadcrumb>
                                        {zoomStack.map((node, idx) => (
                                            <BreadcrumbItem
                                                key={`${node.id}:${idx}`}
                                                isActive={idx === zoomStack.length - 1}
                                                onClick={() => handleBreadcrumbClick(idx)}
                                            >
                                                {node.name}
                                            </BreadcrumbItem>
                                        ))}
                                    </Breadcrumb>
                                </ToolbarItem>
                                <ToolbarItem align={{ default: 'alignEnd' }}>
                                    <SearchInput
                                        placeholder={_('Filter current view…')}
                                        value={filterText}
                                        onChange={(_e, val) => setFilterText(val)}
                                        onClear={() => setFilterText('')}
                                    />
                                </ToolbarItem>
                                <ToolbarItem>
                                    <ToggleGroup aria-label={_('Chart mode')}>
                                        <ToggleGroupItem
                                            icon={<ChartPieIcon />}
                                            text={_('Rings')}
                                            buttonId="mode-rings"
                                            isSelected={chartMode === 'rings'}
                                            onChange={() => setChartMode('rings')}
                                        />
                                        <ToggleGroupItem
                                            icon={<ThLargeIcon />}
                                            text={_('Treemap')}
                                            buttonId="mode-treemap"
                                            isSelected={chartMode === 'treemap'}
                                            onChange={() => setChartMode('treemap')}
                                        />
                                    </ToggleGroup>
                                </ToolbarItem>
                                <ToolbarItem>
                                    <Button
                                        variant="secondary"
                                        icon={<RedoIcon />}
                                        onClick={() => runScan(scanRoot?.path || currentRoot.path)}
                                    >
                                        {_('Rescan')}
                                    </Button>
                                </ToolbarItem>
                            </ToolbarContent>
                        </Toolbar>

                        <CardBody>
                            {currentRoot.error && (
                                <Alert
                                    variant="warning"
                                    title={`Some entries could not be read: ${currentRoot.error}`}
                                    isInline
                                    className="baobab-alert-mb"
                                />
                            )}

                            <Grid hasGutter>
                                <GridItem lg={7} md={12}>
                                    <TreeView
                                        root={currentRoot}
                                        filterText={filterText}
                                        hoveredId={hoveredNode?.id ?? null}
                                        selectedId={selectedNode?.id ?? null}
                                        onHover={setHoveredNode}
                                        onSelect={setSelectedNode}
                                        onZoomIn={handleZoomIn}
                                        onRequestDelete={(node) => {
                                            setDeleteError(null);
                                            setDeleteTarget(node);
                                        }}
                                    />
                                </GridItem>
                                <GridItem lg={5} md={12}>
                                    <div className="baobab-chart-panel">
                                        {chartMode === 'rings' ? (
                                            <RingsChart
                                                root={currentRoot}
                                                canZoomOut={zoomStack.length > 1}
                                                hoveredId={hoveredNode?.id ?? null}
                                                selectedId={selectedNode?.id ?? null}
                                                onHover={setHoveredNode}
                                                onSelect={setSelectedNode}
                                                onZoomIn={handleZoomIn}
                                                onZoomOut={handleZoomOut}
                                            />
                                        ) : (
                                            <TreemapChart
                                                root={currentRoot}
                                                hoveredId={hoveredNode?.id ?? null}
                                                selectedId={selectedNode?.id ?? null}
                                                onHover={setHoveredNode}
                                                onSelect={setSelectedNode}
                                                onZoomIn={handleZoomIn}
                                            />
                                        )}

                                        <div className="baobab-selection-bar">
                                            <div className="baobab-selection-path" title={(hoveredNode || selectedNode || currentRoot).path}>
                                                {(hoveredNode || selectedNode || currentRoot).path}
                                            </div>
                                            <div className="baobab-selection-stats">
                                                <strong>{formatBytes((hoveredNode || selectedNode || currentRoot).size)}</strong>
                                                {' · '}
                                                {(hoveredNode || selectedNode || currentRoot).items.toLocaleString()} items
                                            </div>
                                        </div>
                                    </div>
                                </GridItem>
                            </Grid>
                        </CardBody>
                    </Card>
                )}
            </PageSection>

            <Modal
                isOpen={deleteTarget !== null}
                onClose={() => !deleting && setDeleteTarget(null)}
                variant="small"
                aria-labelledby="baobab-delete-title"
            >
                <ModalHeader title={_('Delete permanently?')} labelId="baobab-delete-title" titleIconVariant="danger" />
                <ModalBody>
                    {deleteTarget && (
                        <>
                            <p>
                                Are you sure you want to permanently delete{' '}
                                <strong>{deleteTarget.path}</strong> ({formatBytes(deleteTarget.size)})?
                                This action cannot be undone.
                            </p>
                            {deleteError && (
                                <Alert variant="danger" title={deleteError} isInline className="baobab-alert-mt" />
                            )}
                        </>
                    )}
                </ModalBody>
                <ModalFooter>
                    <Button
                        variant="danger"
                        isLoading={deleting}
                        isDisabled={deleting}
                        onClick={handleConfirmDelete}
                    >
                        {_('Delete')}
                    </Button>
                    <Button
                        variant="link"
                        isDisabled={deleting}
                        onClick={() => setDeleteTarget(null)}
                    >
                        {_('Cancel')}
                    </Button>
                </ModalFooter>
            </Modal>
        </Page>
    );
};
