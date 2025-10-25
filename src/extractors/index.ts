export type {
  ExtractorFn,
  TraversalContext,
  TraversalOptions,
  GlobalVars,
  StyleTypes,
} from "./types.js";

export { extractFromDesign } from "./node-walker.js";

export { simplifyRawFigmaObject } from "./design-extractor.js";

export {
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
  SVG_ELIGIBLE_TYPES,
} from "./built-in.js";
