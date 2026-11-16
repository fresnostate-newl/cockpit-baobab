# Cockpit Disk Usage Analyzer (Baobab)

A [Cockpit](https://cockpit-project.org/) Web GUI plugin inspired by [GNOME Baobab (Disk Usage Analyzer)](https://github.com/GNOME/baobab) and built following the [cockpit-project/starter-kit](https://github.com/cockpit-project/starter-kit) conventions.

## Features

- **Devices & Locations Overview**: Lists Home directory, Root (`/`), and all mounted filesystems (`df`) with capacity bars, filesystem types, and one-click scanning.
- **Custom Folder Scan**: Scan any arbitrary path on the server, with optional cross-filesystem traversal (`--one-file-system` toggle).
- **Interactive Rings Chart (Sunburst)**: Multi-ring concentric arc visualization modeled after Baobab's Rings Chart, with hover tooltips, breadcrumb/center-click navigation, and click-to-zoom.
- **Interactive Treemap**: Squarified treemap visualization with proportional blocks, nested folder framing, and synchronized selection with the directory tree.
- **Expandable Directory Tree View**: Sortable, searchable tree table showing Name, Size, Usage % bar, Item Count, and Modified date.
- **Safe Cleanup**: Delete selected files or folders with an explicit confirmation dialog showing the exact path and reclaimable size.

## Development Dependencies

On Fedora:
```bash
sudo dnf install gettext nodejs npm make
```

On Debian/Ubuntu:
```bash
sudo apt install gettext nodejs npm make
```

## Building & Installing

```bash
make
```

### Development Symlink Install (No root required)
```bash
make devel-install
```
This symlinks `dist/` to `~/.local/share/cockpit/baobab`. Reload Cockpit in your browser to see changes.

### System-wide Install
```bash
sudo make install PREFIX=/usr/local
```

### RPM Packaging (Fedora / RHEL / CentOS Stream)
```bash
make rpm
```
