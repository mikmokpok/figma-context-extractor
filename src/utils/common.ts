import fs from "fs";
import path from "path";

export type StyleId = `${string}_${string}` & { __brand: "StyleId" };

/**
 * Download Figma image and save it locally or return as buffer
 * @param fileName - The filename to save as
 * @param localPath - The local path to save to
 * @param imageUrl - Image URL (images[nodeId])
 * @param returnBuffer - If true, return ArrayBuffer instead of saving to disk
 * @returns A Promise that resolves to the full file path where the image was saved, or ArrayBuffer if returnBuffer is true
 * @throws Error if download fails
 */
export async function downloadFigmaImage(
  fileName: string,
  localPath: string,
  imageUrl: string,
  returnBuffer: boolean = false,
): Promise<string | ArrayBuffer> {
  const { pipeline } = await import("stream/promises");
  const { Readable } = await import("stream");

  try {
    const response = await fetch(imageUrl, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(
        `Failed to download image: ${response.status} ${response.statusText}`,
      );
    }

    if (!response.body) {
      throw new Error("Response body is empty");
    }

    if (returnBuffer) {
      // Return as ArrayBuffer
      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength === 0) {
        throw new Error("Downloaded image buffer is empty");
      }
      return arrayBuffer;
    }

    // Save to disk
    if (!fs.existsSync(localPath)) {
      fs.mkdirSync(localPath, { recursive: true });
    }

    const fullPath = path.join(localPath, fileName);
    const fileStream = fs.createWriteStream(fullPath);

    // Use pipeline to correctly handle stream events and errors
    // @ts-ignore - Readable.fromWeb is available in Node 18+
    await pipeline(Readable.fromWeb(response.body), fileStream);

    // Verify file exists and is not empty
    const stats = fs.statSync(fullPath);
    if (stats.size === 0) {
      fs.unlinkSync(fullPath); // Delete empty file
      throw new Error("Downloaded file is empty (0 bytes)");
    }

    return fullPath;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Error downloading image: ${errorMessage}`);
  }
}

/**
 * Remove keys with empty arrays or empty objects from an object.
 * @param input - The input object or value.
 * @returns The processed object or the original value.
 */
export function removeEmptyKeys<T>(input: T): T {
  if (typeof input !== "object" || input === null) {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => removeEmptyKeys(item)) as T;
  }

  const result = {} as T;
  for (const key in input) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      const value = input[key];

      const cleanedValue = removeEmptyKeys(value);
      if (
        cleanedValue !== undefined &&
        !(Array.isArray(cleanedValue) && cleanedValue.length === 0) &&
        !(
          typeof cleanedValue === "object" &&
          cleanedValue !== null &&
          Object.keys(cleanedValue).length === 0
        )
      ) {
        result[key] = cleanedValue;
      }
    }
  }

  return result;
}

/**
 * Generate a 6-character random variable ID
 * @param prefix - ID prefix
 * @returns A 6-character random ID string with prefix
 */
export function generateVarId(prefix: string = "var"): StyleId {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars[randomIndex];
  }

  return `${prefix}_${result}` as StyleId;
}

/**
 * Generate a CSS shorthand for values that come with top, right, bottom, and left
 *
 * input: { top: 10, right: 10, bottom: 10, left: 10 }
 * output: "10px"
 *
 * input: { top: 10, right: 20, bottom: 10, left: 20 }
 * output: "10px 20px"
 *
 * input: { top: 10, right: 20, bottom: 30, left: 40 }
 * output: "10px 20px 30px 40px"
 *
 * @param values - The values to generate the shorthand for
 * @returns The generated shorthand
 */
export function generateCSSShorthand(
  values: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  },
  {
    ignoreZero = true,
    suffix = "px",
  }: {
    /**
     * If true and all values are 0, return undefined. Defaults to true.
     */
    ignoreZero?: boolean;
    /**
     * The suffix to add to the shorthand. Defaults to "px".
     */
    suffix?: string;
  } = {},
) {
  const { top, right, bottom, left } = values;
  if (ignoreZero && top === 0 && right === 0 && bottom === 0 && left === 0) {
    return undefined;
  }
  if (top === right && right === bottom && bottom === left) {
    return `${top}${suffix}`;
  }
  if (right === left) {
    if (top === bottom) {
      return `${top}${suffix} ${right}${suffix}`;
    }
    return `${top}${suffix} ${right}${suffix} ${bottom}${suffix}`;
  }
  return `${top}${suffix} ${right}${suffix} ${bottom}${suffix} ${left}${suffix}`;
}

/**
 * Check if an element is visible
 * @param element - The item to check
 * @returns True if the item is visible, false otherwise
 */
export function isVisible(element: { visible?: boolean }): boolean {
  return element.visible ?? true;
}

/**
 * Rounds a number to two decimal places, suitable for pixel value processing.
 * @param num The number to be rounded.
 * @returns The rounded number with two decimal places.
 * @throws TypeError If the input is not a valid number
 */
export function pixelRound(num: number): number {
  if (isNaN(num)) {
    throw new TypeError(`Input must be a valid number`);
  }
  return Number(Number(num).toFixed(2));
}

/**
 * Run a list of async tasks with a concurrency limit
 * @param tasks - Array of functions that return a Promise
 * @param limit - Maximum number of concurrent tasks
 * @returns Promise resolving to array of results
 */
export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);

  return new Promise((resolve, reject) => {
    if (tasks.length === 0) {
      resolve([]);
      return;
    }

    let completed = 0;
    let launched = 0;
    let failed = false;

    const next = () => {
      if (failed) return;
      if (completed === tasks.length) {
        resolve(results);
        return;
      }

      while (launched < tasks.length && launched - completed < limit) {
        const index = launched++;
        tasks[index]()
          .then((result) => {
            results[index] = result;
            completed++;
            next();
          })
          .catch((err) => {
            failed = true;
            reject(err);
          });
      }
    };

    next();
  });
}
