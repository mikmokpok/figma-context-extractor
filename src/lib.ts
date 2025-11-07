import type { GetFileResponse, GetFileNodesResponse } from "@figma/rest-api-spec";
import { FigmaService, type FigmaAuthOptions } from "./services/figma.js";
import {
    simplifyRawFigmaObject,
    allExtractors,
    collapseSvgContainers,
} from "./extractors/index.js";
import yaml from "js-yaml";
import { Logger } from "./utils/logger.js";

export interface FigmaMetadataOptions {
    /** The Figma API key (Personal Access Token) */
    apiKey?: string;
    /** The Figma OAuth Bearer token */
    oauthToken?: string;
    /** Whether to use OAuth instead of API key */
    useOAuth?: boolean;
    /** Output format for the metadata */
    outputFormat?: "json" | "yaml" | "object";
    /** Maximum depth to traverse the node tree */
    depth?: number;
    /** Automatically download image assets and enrich metadata with file paths */
    downloadImages?: boolean;
    /** Local path for downloaded images (required if downloadImages is true) */
    localPath?: string;
    /** Image format for downloads (defaults to 'png') */
    imageFormat?: 'png' | 'svg';
    /** Export scale for PNG images (defaults to 2) */
    pngScale?: number;
    /** 
     * Control how image paths are generated in downloadedImage properties.
     * - true (default): Just the filename (e.g., "./icon.png")
     * - false: Absolute file path (e.g., "/absolute/path/to/images/icon.png")
     * - string: Strip this base path from file path (e.g., "/var/www" → "./images/icon.png")
     * Default: true
     */
    useRelativePaths?: boolean | string;
    /** Enable JSON debug log files (defaults to false) */
    enableLogging?: boolean;
    /** Return images as ArrayBuffer instead of saving to disk (defaults to false) */
    returnBuffer?: boolean;
}

export interface FigmaImageOptions {
    /** Export scale for PNG images (defaults to 2) */
    pngScale?: number;
    /** The absolute path to the directory where images should be stored (optional if returnBuffer is true) */
    localPath?: string;
    /** Return images as ArrayBuffer instead of saving to disk (defaults to false) */
    returnBuffer?: boolean;
}

export interface FigmaImageNode {
    /** The ID of the Figma node, formatted as '1234:5678' */
    nodeId: string;
    /** If a node has an imageRef fill, include this variable */
    imageRef?: string;
    /** The local filename for saving the image (must end with .png or .svg) */
    fileName: string;
    /** Whether this image needs cropping based on its transform matrix */
    needsCropping?: boolean;
    /** Figma transform matrix for image cropping */
    cropTransform?: number[][];
    /** Whether this image requires dimension information for CSS variables */
    requiresImageDimensions?: boolean;
    /** Suffix to add to filename for unique cropped images */
    filenameSuffix?: string;
}

export interface FigmaMetadataResult {
    metadata: any;
    nodes: any[];
    globalVars: any;
    images?: FigmaImageResult[];
}

export interface FigmaImageResult {
    nodeId?: string;
    filePath?: string;
    buffer?: ArrayBuffer;
    finalDimensions: { width: number; height: number };
    wasCropped: boolean;
    cssVariables?: string;
}

export interface FigmaFrameImageOptions {
    /** The Figma API key (Personal Access Token) */
    apiKey?: string;
    /** The Figma OAuth Bearer token */
    oauthToken?: string;
    /** Whether to use OAuth instead of API key */
    useOAuth?: boolean;
    /** Export scale for PNG images (defaults to 2) */
    pngScale?: number;
    /** The absolute path to the directory where the image should be stored (optional if returnBuffer is true) */
    localPath?: string;
    /** The filename for the downloaded image (must end with .png or .svg, optional if returnBuffer is true) */
    fileName?: string;
    /** Image format to download (defaults to 'png') */
    format?: 'png' | 'svg';
    /** Enable JSON debug log files (defaults to false) */
    enableLogging?: boolean;
    /** Return image as ArrayBuffer instead of saving to disk (defaults to false) */
    returnBuffer?: boolean;
}

/**
 * Extract metadata from a Figma file or specific nodes
 * 
 * @param figmaUrl - The Figma file URL (e.g., https://figma.com/file/ABC123/...)
 * @param options - Configuration options including API credentials
 * @returns Promise resolving to the extracted metadata
 */
export async function getFigmaMetadata(
    figmaUrl: string,
    options: FigmaMetadataOptions & { outputFormat: 'json' }
): Promise<string>;
export async function getFigmaMetadata(
    figmaUrl: string,
    options: FigmaMetadataOptions & { outputFormat: 'yaml' }
): Promise<string>;
export async function getFigmaMetadata(
    figmaUrl: string,
    options?: FigmaMetadataOptions
): Promise<FigmaMetadataResult>;
export async function getFigmaMetadata(
    figmaUrl: string,
    options: FigmaMetadataOptions = {}
): Promise<FigmaMetadataResult | string> {
    const {
        apiKey,
        oauthToken,
        useOAuth = false,
        outputFormat = "object",
        depth,
        downloadImages = false,
        localPath,
        imageFormat = 'png',
        pngScale = 2,
        useRelativePaths = true,
        enableLogging = false,
        returnBuffer = false
    } = options;

    Logger.enableLogging = enableLogging;

    if (!apiKey && !oauthToken) {
        throw new Error("Either apiKey or oauthToken is required");
    }

    const urlMatch = figmaUrl.match(/figma\.com\/(file|design)\/([a-zA-Z0-9]+)/);
    if (!urlMatch) {
        throw new Error("Invalid Figma URL format");
    }

    const fileKey = urlMatch[2];

    const nodeIdMatch = figmaUrl.match(/node-id=([^&]+)/);
    const nodeId = nodeIdMatch ? nodeIdMatch[1].replace(/-/g, ":") : undefined;

    const figmaService = new FigmaService({
        figmaApiKey: apiKey || "",
        figmaOAuthToken: oauthToken || "",
        useOAuth: useOAuth && !!oauthToken,
    });

    try {
        Logger.log(
            `Fetching ${depth ? `${depth} layers deep` : "all layers"} of ${nodeId ? `node ${nodeId} from file` : `full file`
            } ${fileKey}`,
        );

        let rawApiResponse: GetFileResponse | GetFileNodesResponse;
        if (nodeId) {
            rawApiResponse = await figmaService.getRawNode(fileKey, nodeId, depth || undefined);
        } else {
            rawApiResponse = await figmaService.getRawFile(fileKey, depth || undefined);
        }

        const simplifiedDesign = simplifyRawFigmaObject(rawApiResponse, allExtractors, {
            maxDepth: depth || undefined,
            afterChildren: collapseSvgContainers,
        });

        Logger.log(
            `Successfully extracted data: ${simplifiedDesign.nodes.length} nodes, ${Object.keys(simplifiedDesign.globalVars?.styles || {}).length
            } styles`,
        );

        const { nodes, globalVars, ...metadata } = simplifiedDesign;
        let result: FigmaMetadataResult = {
            metadata,
            nodes,
            globalVars,
        };

        // Optionally download images and enrich metadata
        if (downloadImages) {
            if (!returnBuffer && !localPath) {
                throw new Error("localPath is required when downloadImages is true and returnBuffer is false");
            }

            Logger.log("Discovering and downloading image assets...");

            // Find all image assets
            const imageAssets = findImageAssets(nodes, globalVars);
            Logger.log(`Found ${imageAssets.length} image assets to download`);

            if (imageAssets.length > 0) {
                // Download images
                const imageNodes: FigmaImageNode[] = imageAssets.map(asset => ({
                    nodeId: asset.id,
                    fileName: sanitizeFileName(asset.name) + `.${imageFormat}`
                }));

                const downloadResults = await figmaService.downloadImages(
                    fileKey,
                    localPath || '',
                    imageNodes,
                    {
                        pngScale: imageFormat === 'png' ? pngScale : undefined,
                        returnBuffer
                    }
                );

                if (returnBuffer) {
                    // When using buffers, return them separately without enriching metadata
                    result.images = downloadResults;
                    Logger.log(`Successfully downloaded ${downloadResults.length} images as buffers`);
                } else {
                    // When saving to disk, enrich nodes with file paths
                    result.nodes = enrichNodesWithImages(nodes, imageAssets, downloadResults, useRelativePaths, localPath);
                    Logger.log(`Successfully downloaded and enriched ${downloadResults.length} images`);
                }
            }
        }

        if (outputFormat === "json") {
            return JSON.stringify(result, null, 2);
        } else if (outputFormat === "yaml") {
            return yaml.dump(result);
        } else {
            return result;
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        Logger.error(`Error fetching file ${fileKey}:`, message);
        throw new Error(`Failed to fetch Figma data: ${message}`);
    }
}

/**
 * Download images from a Figma file
 * 
 * @param figmaUrl - The Figma file URL
 * @param nodes - Array of image nodes to download
 * @param options - Configuration options including API credentials and local path
 * @returns Promise resolving to array of download results
 */
export async function downloadFigmaImages(
    figmaUrl: string,
    nodes: FigmaImageNode[],
    options: FigmaMetadataOptions & FigmaImageOptions
): Promise<FigmaImageResult[]> {
    const { apiKey, oauthToken, useOAuth = false, pngScale = 2, localPath, enableLogging = false, returnBuffer = false } = options;

    Logger.enableLogging = enableLogging;

    if (!apiKey && !oauthToken) {
        throw new Error("Either apiKey or oauthToken is required");
    }

    if (!returnBuffer && !localPath) {
        throw new Error("localPath is required when returnBuffer is false");
    }

    const urlMatch = figmaUrl.match(/figma\.com\/(file|design)\/([a-zA-Z0-9]+)/);
    if (!urlMatch) {
        throw new Error("Invalid Figma URL format");
    }

    const fileKey = urlMatch[2];

    const figmaService = new FigmaService({
        figmaApiKey: apiKey || "",
        figmaOAuthToken: oauthToken || "",
        useOAuth: useOAuth && !!oauthToken,
    });

    try {
        const processedNodes = nodes.map(node => ({
            ...node,
            nodeId: node.nodeId.replace(/-/g, ":"),
        }));

        const results = await figmaService.downloadImages(fileKey, localPath || '', processedNodes, {
            pngScale,
            returnBuffer
        });

        return results;
    } catch (error) {
        Logger.error(`Error downloading images from ${fileKey}:`, error);
        throw new Error(`Failed to download images: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Download a frame image from a Figma URL
 * 
 * @param figmaUrl - The Figma URL containing the frame (with node-id parameter)
 * @param options - Configuration options including API credentials, local path, and filename
 * @returns Promise resolving to the download result
 */
export async function downloadFigmaFrameImage(
    figmaUrl: string,
    options: FigmaFrameImageOptions
): Promise<FigmaImageResult> {
    const {
        apiKey,
        oauthToken,
        useOAuth = false,
        pngScale = 2,
        localPath,
        fileName,
        format = 'png',
        enableLogging = false,
        returnBuffer = false
    } = options;

    Logger.enableLogging = enableLogging;

    if (!apiKey && !oauthToken) {
        throw new Error("Either apiKey or oauthToken is required");
    }

    if (!returnBuffer && (!localPath || !fileName)) {
        throw new Error("localPath and fileName are required when returnBuffer is false");
    }

    const urlMatch = figmaUrl.match(/figma\.com\/(file|design)\/([a-zA-Z0-9]+)/);
    if (!urlMatch) {
        throw new Error("Invalid Figma URL format");
    }

    const fileKey = urlMatch[2];

    // Extract node ID from URL
    const nodeIdMatch = figmaUrl.match(/node-id=([^&]+)/);
    if (!nodeIdMatch) {
        throw new Error("No frame node-id found in URL. Please provide a Figma URL with a node-id parameter (e.g., ?node-id=123-456)");
    }

    const nodeId = nodeIdMatch[1].replace(/-/g, ":");

    // Validate filename extension matches format if provided
    if (fileName) {
        const expectedExtension = `.${format}`;
        if (!fileName.toLowerCase().endsWith(expectedExtension)) {
            throw new Error(`Filename must end with ${expectedExtension} for ${format} format`);
        }
    }

    const figmaService = new FigmaService({
        figmaApiKey: apiKey || "",
        figmaOAuthToken: oauthToken || "",
        useOAuth: useOAuth && !!oauthToken,
    });

    try {
        Logger.log(`Downloading ${format.toUpperCase()} image for frame ${nodeId} from file ${fileKey}`);

        const imageNode: FigmaImageNode = {
            nodeId,
            fileName: fileName || `temp.${format}`,
        };

        const results = await figmaService.downloadImages(fileKey, localPath || '', [imageNode], {
            pngScale: format === 'png' ? pngScale : undefined,
            returnBuffer
        });

        if (results.length === 0) {
            throw new Error(`Failed to download image for frame ${nodeId}`);
        }

        if (returnBuffer) {
            Logger.log(`Successfully downloaded frame image as buffer`);
        } else {
            Logger.log(`Successfully downloaded frame image to: ${results[0].filePath}`);
        }
        return results[0];
    } catch (error) {
        Logger.error(`Error downloading frame image from ${fileKey}:`, error);
        throw new Error(`Failed to download frame image: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Get image node information from metadata
 * 
 * Returns an array of objects containing node IDs and names for all images in the metadata.
 * Use this to create a mapping between node IDs and uploaded URLs.
 * 
 * @param metadata - The metadata result from getFigmaMetadata
 * @returns Array of objects with nodeId and name for each image
 * 
 * @example
 * ```typescript
 * const imageInfo = getImageNodeInfo(metadata);
 * // [{ nodeId: '123:456', name: 'icon' }, { nodeId: '789:012', name: 'logo' }]
 * 
 * // Upload images and create mapping
 * const urlMap: Record<string, string> = {};
 * for (const info of imageInfo) {
 *   const url = await uploadToS3(metadata.images.find(img => img.nodeId === info.nodeId).buffer);
 *   urlMap[info.nodeId] = url;
 * }
 * 
 * // Enrich metadata with URLs
 * const enriched = enrichMetadataWithImages(metadata, urlMap);
 * ```
 */
export function getImageNodeInfo(metadata: FigmaMetadataResult): Array<{ nodeId: string; name: string }> {
    if (!metadata.images || metadata.images.length === 0) {
        return [];
    }

    const imageAssets = findImageAssets(metadata.nodes, metadata.globalVars);

    return imageAssets.map(asset => ({
        nodeId: asset.id,
        name: asset.name
    }));
}

/**
 * Enrich metadata with saved image file paths
 * 
 * Use this function after saving images from buffers to disk to add file path information to the metadata.
 * 
 * @param metadata - The metadata result from getFigmaMetadata
 * @param imagePaths - Array of file paths (ordered) OR object mapping node IDs to paths/URLs
 * @param options - Options for path generation
 * @returns Enriched metadata with downloadedImage properties on nodes
 * 
 * @example
 * ```typescript
 * // Array format (ordered)
 * const enriched = enrichMetadataWithImages(metadata, ['/path/to/img1.png', '/path/to/img2.png']);
 * 
 * // Object format (keyed by node ID) - useful after uploading to CDN
 * const enriched = enrichMetadataWithImages(metadata, {
 *   '123:456': 'https://cdn.example.com/icon.png',
 *   '789:012': 'https://cdn.example.com/logo.png'
 * });
 * ```
 */
export function enrichMetadataWithImages(
    metadata: FigmaMetadataResult,
    imagePaths: string[] | Record<string, string>,
    options: {
        useRelativePaths?: boolean | string;
        localPath?: string;
    } = {}
): FigmaMetadataResult {
    const { useRelativePaths = true, localPath } = options;

    if (!metadata.images || metadata.images.length === 0) {
        return metadata;
    }

    // Find image assets in the nodes
    const imageAssets = findImageAssets(metadata.nodes, metadata.globalVars);

    let downloadResults: any[];

    // Support both array (ordered) and object (keyed by node ID) formats
    if (Array.isArray(imagePaths)) {
        if (imagePaths.length !== metadata.images.length) {
            throw new Error(`Number of image paths (${imagePaths.length}) must match number of images (${metadata.images.length})`);
        }

        // Create download results from paths and images (array format)
        downloadResults = imagePaths.map((filePath, index) => ({
            filePath,
            finalDimensions: metadata.images![index].finalDimensions,
            wasCropped: metadata.images![index].wasCropped,
            cssVariables: metadata.images![index].cssVariables
        }));
    } else {
        // Object format: match by node ID
        downloadResults = imageAssets.map((asset) => {
            const filePath = imagePaths[asset.id];
            if (!filePath) {
                throw new Error(`No image path provided for node ID: ${asset.id}`);
            }

            // Find corresponding image metadata
            const imageMetadata = metadata.images!.find((img: any) => img.nodeId === asset.id);

            return {
                filePath,
                finalDimensions: imageMetadata?.finalDimensions || { width: 0, height: 0 },
                wasCropped: imageMetadata?.wasCropped || false,
                cssVariables: imageMetadata?.cssVariables
            };
        });
    }

    // Enrich nodes with file paths
    const enrichedNodes = enrichNodesWithImages(
        metadata.nodes,
        imageAssets,
        downloadResults,
        useRelativePaths,
        localPath
    );

    return {
        ...metadata,
        nodes: enrichedNodes
    };
}

// Helper functions

function sanitizeFileName(name: string): string {
    return name
        .replace(/[^a-z0-9]/gi, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();
}

function findImageAssets(nodes: any[], globalVars: any): any[] {
    const images: any[] = [];

    function traverse(node: any) {
        const isImageAsset =
            node.type === 'IMAGE-SVG' ||
            hasImageFill(node, globalVars);

        if (isImageAsset) {
            images.push(node);
        }

        if (node.children && Array.isArray(node.children)) {
            node.children.forEach(traverse);
        }
    }

    nodes.forEach(traverse);
    return images;
}

function hasImageFill(node: any, globalVars: any): boolean {
    if (!node.fills || typeof node.fills !== 'string') {
        return false;
    }

    const fillData = globalVars?.styles?.[node.fills];
    if (!fillData || !Array.isArray(fillData)) {
        return false;
    }

    return fillData.some((fill: any) => fill?.type === 'IMAGE');
}

function enrichNodesWithImages(
    nodes: any[],
    imageAssets: any[],
    downloadResults: any[],
    useRelativePaths: boolean | string = true,
    localPath?: string
): any[] {
    const imageMap = new Map();

    imageAssets.forEach((asset, index) => {
        const result = downloadResults[index];
        if (result && result.filePath) {
            // Calculate the path to use based on useRelativePaths option
            let pathForMarkup: string;

            if (useRelativePaths === false) {
                // Use absolute path
                pathForMarkup = result.filePath;
            } else if (typeof useRelativePaths === 'string') {
                // Custom base path to strip from the file path
                const basePath = useRelativePaths.endsWith('/') ? useRelativePaths : useRelativePaths + '/';
                const normalizedFilePath = result.filePath.replace(/\\/g, '/');
                const normalizedBasePath = basePath.replace(/\\/g, '/');

                if (normalizedFilePath.startsWith(normalizedBasePath)) {
                    pathForMarkup = './' + normalizedFilePath.substring(normalizedBasePath.length);
                } else {
                    // Fallback: just use filename
                    pathForMarkup = './' + result.filePath.split(/[/\\]/).pop();
                }
            } else {
                // Default (true): just use the filename
                const fileName = result.filePath.split(/[/\\]/).pop();
                pathForMarkup = './' + fileName;
            }

            imageMap.set(asset.id, {
                filePath: result.filePath,
                relativePath: pathForMarkup,
                dimensions: result.finalDimensions,
                wasCropped: result.wasCropped,
                markdown: `![${asset.name}](${pathForMarkup})`,
                html: `<img src="${pathForMarkup}" alt="${asset.name}" width="${result.finalDimensions.width}" height="${result.finalDimensions.height}">`
            });
        }
    });

    function enrichNode(node: any): any {
        const enriched = { ...node };

        if (imageMap.has(node.id)) {
            enriched.downloadedImage = imageMap.get(node.id);
        }

        if (node.children && Array.isArray(node.children)) {
            enriched.children = node.children.map(enrichNode);
        }

        return enriched;
    }

    return nodes.map(enrichNode);
}

export type { SimplifiedDesign } from "./extractors/types.js";
export type {
    ExtractorFn,
    TraversalContext,
    TraversalOptions,
    GlobalVars,
    StyleTypes,
} from "./extractors/index.js";

export {
    extractFromDesign,
    simplifyRawFigmaObject,
    layoutExtractor,
    textExtractor,
    visualsExtractor,
    componentExtractor,
    allExtractors,
    layoutAndText,
    contentOnly,
    visualsOnly,
    layoutOnly,
    collapseSvgContainers,
} from "./extractors/index.js";