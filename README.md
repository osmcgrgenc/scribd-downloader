# Lifinize Downloader

![node.js](https://img.shields.io/badge/node.js-v18%2B-green.svg) ![npm](https://img.shields.io/badge/npm-9.0%2B-red.svg) ![license](https://img.shields.io/badge/license-MIT-blue.svg)

> **Premium Document & Podcast Downloader powered by Lifinize**  
> Access [lifinize.online](https://lifinize.online) for the hosted version.

Lifinize Downloader is a powerful local tool for downloading content from major document and podcast platforms. It features a modern **NeoGlass UI** and robust CLI support.

## Supported Platforms

| Platform | Content Type | URL Patterns |
|----------|--------------|--------------|
| **Scribd** | Documents | `scribd.com/doc/...`, `scribd.com/embeds/...` |
| **Slideshare** | Presentations | `slideshare.net/...`, `slideshare.net/slideshow/...` |
| **Everand** | Podcasts | `everand.com/podcast/...`, `everand.com/podcast-show/...` |

## Features

- **NeoGlass UI**: A stunning, modern web interface with real-time progress tracking.
- **Smart Scraper**: Handles cookie banners, lazy loading, and dynamic content automatically.
- **PDF Generation**: High-quality PDF creation from documents and presentations.
- **Podcast Support**: Download full series or individual episodes from Everand.
- **CLI Mode**: Full-featured command-line interface for automation.

## Quick Start

### Prerequisites
- Node.js 18 or higher
- NPM 9 or higher

### Installation

```bash
git clone https://github.com/osmcgrgenc/scribd-dl.git
cd scribd-dl
npm install
```

### Usage (Web UI)

Launch the modern web interface:

```bash
npm run start:ui
```
Open `http://localhost:4173` in your browser.

### Usage (CLI)

Download a document directly:

```bash
npm start "https://www.scribd.com/doc/123456789/Document-Title"
```

**Options:**
- `/i` : **Image Mode** (Scribd only) - Captures pages as high-res screenshots before PDF generation. Useful for complex layouts.

```bash
npm start /i "https://www.scribd.com/doc/123456789/Complex-Doc"
```

## Configuration

Edit `config.ini` to customize behavior:

```ini
[SCRIBD]
rendertime=100  ; Time to wait for page rendering (ms)

[DIRECTORY]
output=output   ; Download destination folder
filename=title  ; Naming strategy: 'title' or 'id'
```

## Development

This project is structured with a modular architecture:
- `src/core`: Base classes and shared logic.
- `src/service`: Platform-specific downloaders (Scribd, Slideshare, Everand).
- `src/utils`: Helpers for Puppeteer, PDF generation, and file I/O.
- `ui/`: NeoGlass web interface assets.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
**Maintained by [osmcgrgenc](https://github.com/osmcgrgenc)**
