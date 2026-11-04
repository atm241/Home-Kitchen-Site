// Display names for where a recipe came from.
export const PLATFORM_LABEL: Record<string, string> = {
  tiktok: 'TikTok',
  youtube: 'YouTube',
  instagram: 'Instagram',
  web: 'Web',
};

export const isVideoPlatform = (p?: string) => p === 'tiktok' || p === 'youtube' || p === 'instagram';

/** "@creator" for social video, the site name for web recipes. */
export const authorLabel = (platform?: string, author?: string) => {
  if (!author) return undefined;
  return isVideoPlatform(platform) && platform !== 'youtube' && !author.startsWith('@') ? `@${author}` : author;
};
