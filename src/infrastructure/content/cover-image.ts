import sharp from "sharp";

import { isContentCoverImageType } from "../../contracts/contents.ts";

export const detectCoverImageType = async (
  data: Uint8Array,
): Promise<string | undefined> => {
  try {
    const image = sharp(data, {
      animated: true,
      failOn: "warning",
      limitInputPixels: 8192 * 8192,
    });
    const { mediaType } = await image.metadata();
    if (!mediaType || !isContentCoverImageType(mediaType)) return undefined;

    // Pixel statistics force decoding after the header has been checked.
    await image.stats();
    return mediaType;
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return undefined;
  }
};
