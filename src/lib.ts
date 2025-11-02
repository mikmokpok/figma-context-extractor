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
    const { apiKey, oauthToken, useOAuth = false, outputFormat = "object", depth } = options;

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
        const result = {
            metadata,
            nodes,
            globalVars,
        };

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