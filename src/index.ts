export {
    getFigmaMetadata,
    downloadFigmaImages,
    downloadFigmaFrameImage,
    type FigmaMetadataOptions,
    type FigmaImageOptions,
    type FigmaFrameImageOptions,
    type FigmaImageNode,
    type FigmaMetadataResult,
    type FigmaImageResult,
} from "./lib.js";

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