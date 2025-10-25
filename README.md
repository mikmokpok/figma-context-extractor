# Figma Metadata Extractor

A TypeScript library for extracting metadata and downloading images from Figma files programmatically, based on Figma-Context-MCP.

## Installation

```bash
npm install figma-metadata-extractor
```

## Quick Start

```typescript
import { getFigmaMetadata, downloadFigmaImages } from 'figma-metadata-extractor';

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

**Returns:** Promise<FigmaMetadataResult | string>

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
- `localPath: string` - Absolute path to save images

**Returns:** Promise<FigmaImageResult[]>

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