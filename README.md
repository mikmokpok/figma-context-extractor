# Figma Metadata Extractor

A TypeScript library for extracting metadata and downloading images from Figma files programmatically, based on Figma-Context-MCP.

## Installation

```bash
npm install figma-metadata-extractor
```

## Quick Start

### Get Metadata with Auto-Downloaded Images (LLM-Ready!)

```typescript
import { getFigmaMetadata } from 'figma-metadata-extractor';

// Extract metadata AND automatically download image assets
const metadata = await getFigmaMetadata(
  'https://figma.com/file/ABC123/My-Design',
  {
    apiKey: 'your-figma-api-key',
    outputFormat: 'object',
    downloadImages: true,        // Auto-download image assets
    localPath: './assets/images' // Where to save images
  }
);

```

### Get Metadata Only (No Downloads)

```typescript
import { getFigmaMetadata } from 'figma-metadata-extractor';

// Extract metadata from a Figma file
const metadata = await getFigmaMetadata(
  'https://figma.com/file/ABC123/My-Design',
  {
    apiKey: 'your-figma-api-key',
    outputFormat: 'object' // or 'json' or 'yaml'
  }
);

console.log(metadata.nodes); // Array of design nodes
console.log(metadata.globalVars); // Styles, colors, etc.

// Download images from the file
const images = await downloadFigmaImages(
  'https://figma.com/file/ABC123/My-Design',
  [
    {
      nodeId: '1234:5678',
      fileName: 'icon.svg'
    },
    {
      nodeId: '9876:5432', 
      fileName: 'hero-image.png'
    }
  ],
  {
    apiKey: 'your-figma-api-key',
    localPath: './assets/images'
  }
);

console.log(images); // Array of download results

// Download a single frame image from a Figma URL
const frameImage = await downloadFigmaFrameImage(
  'https://figma.com/file/ABC123/My-Design?node-id=1234-5678',
  {
    apiKey: 'your-figma-api-key',
    localPath: './assets/frames',
    fileName: 'my-frame.png',
    format: 'png', // or 'svg'
    pngScale: 2
  }
);

console.log(frameImage.filePath); // Path to downloaded image
```

## API Reference

### `getFigmaMetadata(figmaUrl, options)`

Extracts comprehensive metadata from a Figma file including layout, content, visuals, and component information.

**Parameters:**
- `figmaUrl` (string): The Figma file URL
- `options` (FigmaMetadataOptions): Configuration options

**Options:**
- `apiKey?: string` - Figma API key (Personal Access Token)
- `oauthToken?: string` - Figma OAuth Bearer token  
- `useOAuth?: boolean` - Whether to use OAuth instead of API key
- `outputFormat?: 'json' | 'yaml' | 'object'` - Output format (default: 'object')
- `depth?: number` - Maximum depth to traverse the node tree
- `downloadImages?: boolean` - Automatically download image assets and enrich metadata (default: false)
- `localPath?: string` - Local path for downloaded images (required if downloadImages is true)
- `imageFormat?: 'png' | 'svg'` - Image format for downloads (default: 'png')
- `pngScale?: number` - Export scale for PNG images (default: 2)

**Returns:** Promise<FigmaMetadataResult | string>

When `downloadImages` is true, nodes with image assets will include a `downloadedImage` property:
```typescript
{
  filePath: string;           // Absolute path
  relativePath: string;       // Relative path for code
  dimensions: { width, height };
  markdown: string;           // ![name](path)
  html: string;              // <img src="..." />
}
```

### `downloadFigmaImages(figmaUrl, nodes, options)`

Downloads SVG and PNG images from a Figma file.

**Parameters:**
- `figmaUrl` (string): The Figma file URL
- `nodes` (FigmaImageNode[]): Array of image nodes to download
- `options` (FigmaMetadataOptions & FigmaImageOptions): Configuration options

**Node Properties:**
- `nodeId: string` - The Figma node ID (format: '1234:5678')
- `fileName: string` - Local filename (must end with .png or .svg)
- `imageRef?: string` - Image reference for image fills
- `needsCropping?: boolean` - Whether image needs cropping
- `cropTransform?: number[][]` - Transform matrix for cropping
- `requiresImageDimensions?: boolean` - Whether to generate CSS variables
- `filenameSuffix?: string` - Suffix for unique filenames

**Additional Options:**
- `pngScale?: number` - Export scale for PNG images (default: 2)
- `localPath?: string` - Absolute path to save images (optional if returnBuffer is true)
- `returnBuffer?: boolean` - Return images as ArrayBuffer instead of saving to disk (default: false)
- `enableLogging?: boolean` - Enable JSON debug log files (default: false)

**Returns:** Promise<FigmaImageResult[]>

When `returnBuffer` is true, each result will contain a `buffer` property instead of `filePath`.

### `downloadFigmaFrameImage(figmaUrl, options)`

Downloads a single frame image from a Figma URL that contains a node-id parameter.

**Parameters:**
- `figmaUrl` (string): The Figma URL with node-id parameter (e.g., `https://figma.com/file/ABC123/My-Design?node-id=1234-5678`)
- `options` (FigmaFrameImageOptions): Configuration options

**Options:**
- `apiKey?: string` - Figma API key (Personal Access Token)
- `oauthToken?: string` - Figma OAuth Bearer token  
- `useOAuth?: boolean` - Whether to use OAuth instead of API key
- `localPath?: string` - Absolute path to save the image (optional if returnBuffer is true)
- `fileName?: string` - Local filename (must end with .png or .svg, optional if returnBuffer is true)
- `format?: 'png' | 'svg'` - Image format to download (default: 'png')
- `pngScale?: number` - Export scale for PNG images (default: 2)
- `returnBuffer?: boolean` - Return image as ArrayBuffer instead of saving to disk (default: false)
- `enableLogging?: boolean` - Enable JSON debug log files (default: false)

**Returns:** Promise<FigmaImageResult>

**Result Properties:**
- `filePath?: string` - Path to saved file (only when returnBuffer is false)
- `buffer?: ArrayBuffer` - Image data as ArrayBuffer (only when returnBuffer is true)
- `finalDimensions: { width: number; height: number }` - Image dimensions
- `wasCropped: boolean` - Whether the image was cropped
- `cssVariables?: string` - CSS variables for dimensions (if requested)

## Authentication

You need either a Figma API key or OAuth token:

### API Key (Personal Access Token)
1. Go to Figma → Settings → Account → Personal Access Tokens
2. Generate a new token
3. Use it in the `apiKey` option

### OAuth Token
1. Set up Figma OAuth in your application
2. Use the bearer token in the `oauthToken` option
3. Set `useOAuth: true`

## Usage Examples

### Download Frame Image from Figma URL

The easiest way to download a frame image is to copy the Figma URL directly from your browser when viewing a specific frame:

```typescript
import { downloadFigmaFrameImage } from 'figma-metadata-extractor';

// Copy this URL from Figma when viewing a frame
const figmaUrl = 'https://www.figma.com/design/ABC123/My-Design?node-id=1234-5678&t=xyz123';

// Save to disk
const result = await downloadFigmaFrameImage(figmaUrl, {
  apiKey: 'your-figma-api-key',
  localPath: './downloads',
  fileName: 'my-frame.png',
  format: 'png',
  pngScale: 2 // High resolution
});

console.log(`Downloaded to: ${result.filePath}`);
console.log(`Dimensions: ${result.finalDimensions.width}x${result.finalDimensions.height}`);
```

### Get Frame Image as ArrayBuffer (No Disk Write)

If you want to process the image in memory without saving to disk:

```typescript
import { downloadFigmaFrameImage } from 'figma-metadata-extractor';

const figmaUrl = 'https://www.figma.com/design/ABC123/My-Design?node-id=1234-5678';

// Get as ArrayBuffer
const result = await downloadFigmaFrameImage(figmaUrl, {
  apiKey: 'your-figma-api-key',
  returnBuffer: true,
  format: 'png'
});

console.log(`Buffer size: ${result.buffer.byteLength} bytes`);
console.log(`Dimensions: ${result.finalDimensions.width}x${result.finalDimensions.height}`);

// Use the buffer directly (e.g., upload to cloud storage, process with sharp, etc.)
// const processedImage = await sharp(Buffer.from(result.buffer)).resize(100, 100).toBuffer();
```

### Download Multiple Frame Images

```typescript
import { downloadFigmaImages } from 'figma-metadata-extractor';

// For multiple frames, use the batch download function
const results = await downloadFigmaImages(
  'https://figma.com/file/ABC123/My-Design',
  [
    { nodeId: '1234:5678', fileName: 'frame1.png' },
    { nodeId: '9876:5432', fileName: 'frame2.svg' },
    { nodeId: '1111:2222', fileName: 'frame3.png' }
  ],
  {
    apiKey: 'your-figma-api-key',
    localPath: './frames'
  }
);
```

### Download Multiple Images as Buffers

```typescript
import { downloadFigmaImages } from 'figma-metadata-extractor';

// Get multiple images as ArrayBuffers
const results = await downloadFigmaImages(
  'https://figma.com/file/ABC123/My-Design',
  [
    { nodeId: '1234:5678', fileName: 'frame1.png' },
    { nodeId: '9876:5432', fileName: 'frame2.png' }
  ],
  {
    apiKey: 'your-figma-api-key',
    returnBuffer: true
  }
);

// Process each buffer
results.forEach((result, index) => {
  console.log(`Image ${index}: ${result.buffer.byteLength} bytes`);
  // Upload to S3, process with sharp, etc.
});
```

## Advanced Usage

The library also exports the underlying extractor system for custom processing:

```typescript
import { 
  simplifyRawFigmaObject, 
  allExtractors,
  layoutExtractor,
  textExtractor 
} from 'figma-metadata-extractor';

// Use specific extractors
const customResult = simplifyRawFigmaObject(
  rawFigmaResponse, 
  [layoutExtractor, textExtractor]
);
```

## License

MIT