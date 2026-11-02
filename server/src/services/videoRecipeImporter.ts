import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';
import Anthropic from '@anthropic-ai/sdk';
import { UPLOADS_DIR, ensureUploadsDir } from '../config/uploads';
import { scrapeRecipe } from './recipeScraper';
import { ParsedRecipe, RECIPE_JSON_SHAPE, RECIPE_JSON_RULES, parseRecipeResponse } from './recipeJson';

// Turns a shared cooking-video link (TikTok, YouTube, Instagram) into a recipe.
//
// Cheapest source first: the creator's caption or description usually has the
// full recipe. If the caption points at a recipe blog, that page is scraped
// instead. YouTube's spoken transcript is the fallback when the caption is thin.
// Claude turns whatever text we found into the app's recipe shape.

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type Platform = 'tiktok' | 'youtube' | 'instagram' | 'web';

export interface ImportedRecipe extends ParsedRecipe {
  sourceUrl: string;
  platform: Platform;
  author?: string;
  imageUrl?: string;
}

/** An import failure with a message that's safe to show the user. */
export class ImportError extends Error {
  constructor(message: string, public status = 422) {
    super(message);
  }
}

// Identify honestly as this app rather than posing as a browser or crawler.
const http = axios.create({
  timeout: 15000,
  maxRedirects: 5,
  headers: { 'User-Agent': 'SimmerRecipeImporter/1.0', 'Accept-Language': 'en-US,en;q=0.9' },
});

export function detectPlatform(url: string): Platform {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'web';
  }
  if (host.endsWith('tiktok.com')) return 'tiktok';
  if (host === 'youtu.be' || host.endsWith('youtube.com')) return 'youtube';
  if (host.endsWith('instagram.com')) return 'instagram';
  return 'web';
}

/** Pull the first http(s) URL out of shared text ("Check this out! https://..."). */
export function extractUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match ? match[0].replace(/[).,!?]+$/, '') : null;
}

// Short links (vm.tiktok.com, youtu.be) redirect to the real page; following
// them gives a stable URL to dedupe on.
async function resolveRedirects(url: string): Promise<string> {
  try {
    const res = await http.get(url, { responseType: 'stream' });
    res.data.destroy();
    return res.request?.res?.responseUrl || url;
  } catch {
    return url;
  }
}

function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null;
    if (u.searchParams.get('v')) return u.searchParams.get('v');
    const m = u.pathname.match(/\/(shorts|embed|live)\/([\w-]{6,})/);
    return m ? m[2] : null;
  } catch {
    return null;
  }
}

/** One URL per video, so re-sharing the same video doesn't save it twice. */
export function canonicalUrl(url: string, platform: Platform): string {
  if (platform === 'youtube') {
    const id = youtubeId(url);
    return id ? `https://www.youtube.com/watch?v=${id}` : url;
  }
  if (platform === 'tiktok' || platform === 'instagram') {
    const u = new URL(url);
    return `${u.origin}${u.pathname.replace(/\/$/, '')}`;
  }
  return url;
}

interface VideoText {
  title?: string;
  caption?: string;
  transcript?: string;
  author?: string;
  thumbnail?: string;
}

async function fetchTikTok(url: string): Promise<VideoText> {
  // The oEmbed "title" is the full caption.
  const { data } = await http.get('https://www.tiktok.com/oembed', { params: { url } });
  return {
    caption: data.title,
    author: data.author_name || data.author_unique_id,
    thumbnail: data.thumbnail_url,
  };
}

// Reads the JSON object assigned to `ytInitialPlayerResponse` in the watch page.
function extractJsonAfter(html: string, marker: string): any | null {
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const open = html.indexOf('{', start);
  if (open === -1) return null;
  let depth = 0;
  let inString = false;
  for (let i = open; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) {
      try {
        return JSON.parse(html.slice(open, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function fetchYouTubeTranscript(player: any): Promise<string | undefined> {
  const tracks: any[] = player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  if (tracks.length === 0) return undefined;
  const track =
    tracks.find(t => t.languageCode?.startsWith('en') && t.kind !== 'asr') ||
    tracks.find(t => t.languageCode?.startsWith('en')) ||
    tracks[0];
  try {
    const { data } = await http.get(`${track.baseUrl}&fmt=json3`);
    const text = (data?.events || [])
      .flatMap((e: any) => e.segs || [])
      .map((s: any) => s.utf8)
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    return text || undefined;
  } catch {
    return undefined;
  }
}

async function fetchYouTube(url: string): Promise<VideoText> {
  const id = youtubeId(url);
  if (!id) throw new ImportError("That doesn't look like a YouTube video link.", 400);

  const { data: html } = await http.get(`https://www.youtube.com/watch?v=${id}`);
  const player = extractJsonAfter(html, 'ytInitialPlayerResponse');
  const details = player?.videoDetails;

  if (!details) {
    // Page layout changed or blocked: oEmbed still gives title and author.
    const { data } = await http.get('https://www.youtube.com/oembed', {
      params: { url: `https://www.youtube.com/watch?v=${id}`, format: 'json' },
    });
    return { title: data.title, author: data.author_name, thumbnail: data.thumbnail_url };
  }

  const thumbs: any[] = details.thumbnail?.thumbnails || [];
  return {
    title: details.title,
    caption: details.shortDescription,
    author: details.author,
    thumbnail: thumbs.length ? thumbs[thumbs.length - 1].url : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    transcript: await fetchYouTubeTranscript(player),
  };
}

async function fetchInstagram(url: string): Promise<VideoText> {
  // Instagram's official oEmbed endpoint needs a Meta app token. Without one,
  // fall back to the Open Graph tags on the public page, which Instagram
  // often withholds — so Instagram imports are best effort.
  const token = process.env.INSTAGRAM_OEMBED_TOKEN;
  if (token) {
    const { data } = await http.get('https://graph.facebook.com/v21.0/instagram_oembed', {
      params: { url, access_token: token, omitscript: true },
    });
    return { caption: data.title, author: data.author_name, thumbnail: data.thumbnail_url };
  }

  const { data: html } = await http.get(url);
  const $ = cheerio.load(html);
  const meta = (p: string) => $(`meta[property="${p}"]`).attr('content') || undefined;
  const description = meta('og:description') || '';
  // Usually: `123 likes, 4 comments - creator on May 1, 2026: "the caption"`
  const quoted = description.match(/:\s*"([\s\S]*)"\s*\.?$/);
  const author = description.match(/-\s*([\w.]+)\s+on\s/)?.[1];
  return {
    title: meta('og:title'),
    caption: quoted ? quoted[1] : description,
    author,
    thumbnail: meta('og:image'),
  };
}

// Captions often say "full recipe on my site: https://...". Social and
// link-in-bio hosts never hold the recipe itself, so skip those.
const NON_RECIPE_HOSTS = [
  'tiktok.com', 'instagram.com', 'youtube.com', 'youtu.be', 'facebook.com', 'x.com',
  'twitter.com', 'linktr.ee', 'beacons.ai', 'amzn.to', 'amazon.com', 'stan.store', 'patreon.com',
];

function recipeLinksIn(text: string): string[] {
  const links = text.match(/https?:\/\/[^\s<>"']+/gi) || [];
  return links
    .map(l => l.replace(/[).,!?]+$/, ''))
    .filter(l => {
      try {
        const host = new URL(l).hostname.replace(/^www\./, '');
        return !NON_RECIPE_HOSTS.some(h => host === h || host.endsWith(`.${h}`));
      } catch {
        return false;
      }
    })
    .slice(0, 2);
}

async function recipeFromVideoText(video: VideoText, platform: Platform): Promise<ParsedRecipe | null> {
  const parts = [
    video.title && `Video title: ${video.title}`,
    video.author && `Creator: ${video.author}`,
    video.caption && `Caption / description:\n${video.caption}`,
    video.transcript && `Spoken transcript:\n${video.transcript}`,
  ].filter(Boolean);
  if (parts.length === 0) return null;

  const message = await anthropic.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 8000,
    messages: [
      {
        role: 'user',
        content: `Below is the text from a ${platform} cooking video. Turn it into a recipe as JSON.
Return ONLY a JSON object with no other text, in exactly this shape:
${RECIPE_JSON_SHAPE}

Rules:
- Use only ingredients the creator mentions; never add ones they didn't
- If the creator gives an ingredient without an amount, keep it with quantity null
- Write the steps as short, clear instructions based on what the creator says or shows in the caption; skip intros, sponsor reads, and calls to like or follow
- Give the recipe a plain, descriptive name (not clickbait or emoji)
${RECIPE_JSON_RULES}
- If there's no real recipe here (for example the caption just says "recipe in bio" and there's no transcript), return exactly: null

<video_text>
${parts.join('\n\n')}
</video_text>`,
      },
    ],
  });

  const recipe = parseRecipeResponse(message);
  // A name with no ingredients isn't a usable recipe.
  return recipe && recipe.ingredients.length > 0 ? recipe : null;
}

/**
 * Download a remote image into the uploads folder. Social thumbnails are
 * signed URLs that expire within days, so linking to them directly would
 * leave the cookbook full of broken images.
 */
export async function saveRemoteImage(url?: string): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const res = await http.get(url, { responseType: 'arraybuffer', maxContentLength: 10 * 1024 * 1024 });
    const type = String(res.headers['content-type'] || '').split(';')[0];
    const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' } as Record<string, string>)[type];
    if (!ext) return undefined;
    const filename = `recipe-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    ensureUploadsDir();
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), Buffer.from(res.data));
    return `/uploads/${filename}`;
  } catch {
    return undefined;
  }
}

/** Figure out what a shared link is and normalize it, without fetching the recipe. */
export async function normalizeSharedLink(rawUrl: string): Promise<{ url: string; platform: Platform }> {
  let url = rawUrl.trim();
  if (!/^https?:\/\//i.test(url)) {
    const found = extractUrl(url);
    if (!found) throw new ImportError("Couldn't find a link in what was shared.", 400);
    url = found;
  }
  try {
    new URL(url);
  } catch {
    throw new ImportError("That link doesn't look right.", 400);
  }
  const platform = detectPlatform(url);
  if (platform !== 'web') url = await resolveRedirects(url);
  return { url: canonicalUrl(url, platform), platform };
}

/** Fetch and extract the recipe for an already-normalized video link. */
export async function importVideoRecipe(url: string, platform: Platform): Promise<ImportedRecipe> {
  let video: VideoText;
  try {
    video =
      platform === 'tiktok' ? await fetchTikTok(url)
      : platform === 'youtube' ? await fetchYouTube(url)
      : await fetchInstagram(url);
  } catch (error) {
    if (error instanceof ImportError) throw error;
    console.error(`Fetching ${platform} video failed:`, (error as Error).message);
    throw new ImportError(
      platform === 'instagram'
        ? "Instagram didn't let us read that post. Try pasting the caption into a manual recipe instead."
        : `Couldn't reach that ${platform === 'tiktok' ? 'TikTok' : 'YouTube'} video. Check that it's public.`,
      502
    );
  }

  const base = { sourceUrl: url, platform, author: video.author };

  // 1. A linked recipe page has exact amounts, so prefer it.
  for (const link of recipeLinksIn(`${video.caption || ''}`)) {
    try {
      const scraped = await scrapeRecipe(link);
      if (scraped.name && (scraped.ingredients?.length ?? 0) >= 2) {
        return {
          ...base,
          ...scraped,
          ingredients: scraped.ingredients || [],
          imageUrl: (await saveRemoteImage(video.thumbnail)) || scraped.image_url,
        };
      }
    } catch {
      // Not a recipe page; fall through to the caption.
    }
  }

  // 2. Caption plus transcript, structured by Claude.
  const recipe = await recipeFromVideoText(video, platform);
  if (!recipe) {
    throw new ImportError(
      "We couldn't find a recipe in that video's caption. Some creators only say it out loud or put it behind a link in their bio."
    );
  }

  return { ...base, ...recipe, imageUrl: await saveRemoteImage(video.thumbnail) };
}
