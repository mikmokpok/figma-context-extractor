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
     * Use relative paths in downloadedImage properties instead of absolute paths.
     * If true, paths will be relative to process.cwd().
     * If a string, paths will be relative to that base path.
     * Default: true
     */
    useRelativePaths?: boolean | string;
}

export interface FigmaImageOptions {
    /** Export scale for PNG images (defaults to 2) */
    pngScale?: number;
    /** The absolute path to the directory where images should be stored */
    localPath: string;
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
}

export interface FigmaImageResult {
    filePath: string;
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
    /** The absolute path to the directory where the image should be stored */
    localPath: string;
    /** The filename for the downloaded image (must end with .png or .svg) */
    fileName: string;
    /** Image format to download (defaults to 'png') */
    format?: 'png' | 'svg';
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
        useRelativePaths = true
    } = options;

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
        let result = {
            metadata,
            nodes,
            globalVars,
        };

        // Optionally download images and enrich metadata
        if (downloadImages) {
            if (!localPath) {
                throw new Error("localPath is required when downloadImages is true");
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
                    localPath,
                    imageNodes,
                    { pngScale: imageFormat === 'png' ? pngScale : undefined }
                );

                // Enrich nodes with download info
                result.nodes = enrichNodesWithImages(nodes, imageAssets, downloadResults, useRelativePaths);

                Logger.log(`Successfully downloaded and enriched ${downloadResults.length} images`);
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
    const { apiKey, oauthToken, useOAuth = false, pngScale = 2, localPath } = options;

    if (!apiKey && !oauthToken) {
        throw new Error("Either apiKey or oauthToken is required");
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

        const results = await figmaService.downloadImages(fileKey, localPath, processedNodes, {
            pngScale,
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
        format = 'png'
    } = options;

    if (!apiKey && !oauthToken) {
        throw new Error("Either apiKey or oauthToken is required");
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

    // Validate filename extension matches format
    const expectedExtension = `.${format}`;
    if (!fileName.toLowerCase().endsWith(expectedExtension)) {
        throw new Error(`Filename must end with ${expectedExtension} for ${format} format`);
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
            fileName,
        };

        const results = await figmaService.downloadImages(fileKey, localPath, [imageNode], {
            pngScale: format === 'png' ? pngScale : undefined,
        });

        if (results.length === 0) {
            throw new Error(`Failed to download image for frame ${nodeId}`);
        }

        Logger.log(`Successfully downloaded frame image to: ${results[0].filePath}`);
        return results[0];
    } catch (error) {
        Logger.error(`Error downloading frame image from ${fileKey}:`, error);
        throw new Error(`Failed to download frame image: ${error instanceof Error ? error.message : String(error)}`);
    }
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
    useRelativePaths: boolean | string = true
): any[] {
    const imageMap = new Map();

    imageAssets.forEach((asset, index) => {
        const result = downloadResults[index];
        if (result) {
            // Calculate the path to use based on useRelativePaths option
            let pathForMarkup: string;

            if (useRelativePaths === false) {
                // Use absolute path
                pathForMarkup = result.filePath;
            } else if (typeof useRelativePaths === 'string') {
                // Use custom base path
                pathForMarkup = result.filePath.replace(useRelativePaths, '.');
            } else {
                // Use path relative to cwd
                pathForMarkup = result.filePath.replace(process.cwd(), '.');
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