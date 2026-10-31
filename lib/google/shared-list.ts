import "server-only";

import { randomBytes } from "node:crypto";

import { z } from "zod";

import { InvalidInputError } from "@/lib/auth/errors";

// A public Google Maps list, read from its share link. There is no official
// API for this: the page calls the undocumented /maps/preview/entitylist/getlist
// and this reads the same answer, so a change upstream fails here with a named
// error. Only links to Google hosts are ever fetched, and a short link is
// followed one hop and only to another Google Maps url.

const SHORT_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"]);
const MAPS_HOSTS = new Set(["www.google.com", "google.com", "maps.google.com"]);
const LIST_ENDPOINT = "https://www.google.com/maps/preview/entitylist/getlist";
const PAGE_SIZE = 500;
const TIMEOUT_MS = 10_000;

export const LIST_LINK_INVALID = "That is not a Google Maps list link. Open the list, tap Share, and paste the link here.";
export const LIST_UNREADABLE = "That list could not be read. Turn on link sharing for the list, then paste the link again.";
export const LIST_UNAVAILABLE = "Google Maps did not answer. Try again in a moment.";

export type SharedListPlace = {
  name: string;
  lat: number;
  lon: number;
  /** Google's CID as an unsigned decimal, the form `places.google_cid` stores. */
  googleId: string | null;
};

export type SharedList = { title: string; places: SharedListPlace[] };

export type ListRef = { id: string; token?: string };

/** The first url in what was pasted: Google's share text puts the list's title before the link. */
export function linkIn(text: string): URL | null {
  const match = text.match(/https?:\/\/\S+/);
  if (!match) return null;
  try {
    return new URL(match[0]);
  } catch {
    return null;
  }
}

/** The list id in a full Google Maps url, in either of its two forms. */
export function listRefOf(url: string): ListRef | null {
  const id = url.match(/!2s(-?[\w-]+)!/)?.[1] ?? url.match(/\/placelists\/list\/(-?[\w-]+)/)?.[1];
  if (!id) return null;
  const token = url.match(/token%3D([\w-]+)/)?.[1] ?? url.match(/[?&]token=([\w-]+)/)?.[1];
  return token ? { id, token } : { id };
}

/** Upstream sends the CID as a signed 64 bit number. Null when it does not read as one. */
export function unsignedCid(cid: string): string | null {
  return /^-?\d{1,20}$/.test(cid) ? BigInt.asUintN(64, BigInt(cid)).toString() : null;
}

const coordinatesSchema = z.tuple([z.unknown(), z.unknown(), z.number(), z.number()]).rest(z.unknown());
const cidSchema = z.tuple([z.string(), z.string()]).rest(z.unknown());
const entrySchema = z.tuple([z.unknown(), z.array(z.unknown()), z.string().min(1)]).rest(z.unknown());
const listSchema = z.tuple([z.array(z.unknown())]).rest(z.unknown());

function placeOf(row: unknown): SharedListPlace | null {
  const entry = entrySchema.safeParse(row);
  if (!entry.success) return null;
  const [, info, name] = entry.data;
  // Every use of a place here needs to know where it is.
  const coordinates = coordinatesSchema.safeParse(info[5]);
  if (!coordinates.success) return null;
  const cid = cidSchema.safeParse(info[6]);
  return {
    name,
    lat: coordinates.data[2],
    lon: coordinates.data[3],
    googleId: cid.success ? unsignedCid(cid.data[1]) : null,
  };
}

/** The list inside the endpoint's answer: the title at [0][4], the places at [0][8]. Null when it is not one. */
export function parseSharedList(data: unknown): SharedList | null {
  const list = listSchema.safeParse(data);
  if (!list.success) return null;
  const [body] = list.data;
  const rows = z.array(z.unknown()).safeParse(body[8]);
  if (!rows.success) return null;
  const places = rows.data.flatMap((row) => placeOf(row) ?? []);
  const title = z.string().min(1).safeParse(body[4]);
  return { title: title.success ? title.data : "Google Maps list", places };
}

async function resolveLink(link: URL, fetcher: typeof fetch): Promise<string> {
  if (MAPS_HOSTS.has(link.hostname)) return link.href;
  if (!SHORT_HOSTS.has(link.hostname)) throw new InvalidInputError(LIST_LINK_INVALID);
  // Only a non-browser client gets the redirect: a browser gets a deep-link page without the list id in it.
  const response = await fetcher(link.href, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
  const location = response?.headers.get("location");
  if (!location) throw new InvalidInputError(response ? LIST_LINK_INVALID : LIST_UNAVAILABLE);
  const target = URL.canParse(location) ? new URL(location) : null;
  if (!target || !MAPS_HOSTS.has(target.hostname)) throw new InvalidInputError(LIST_LINK_INVALID);
  return target.href;
}

function listRequestUrl(ref: ListRef): string {
  const page = `https://www.google.com/maps/placelists/list/${ref.id}${ref.token ? `?token=${ref.token}` : ""}`;
  // The first value is a session id the real page makes up; a random one is accepted.
  const session = randomBytes(16).toString("base64url");
  const pb = `!2e2!3e2!4i${PAGE_SIZE}!6m3!1s${session}!15i204459!28e2!13s${encodeURIComponent(page)}!16b1`;
  return `${LIST_ENDPOINT}?authuser=0&hl=en&gl=us&pb=${pb}`;
}

/** Reads a shared list from whatever the advisor pasted. Throws InvalidInputError with copy the profile shows as is. */
export async function readSharedList(pasted: string, deps: { fetch?: typeof fetch } = {}): Promise<SharedList> {
  const fetcher = deps.fetch ?? fetch;
  const link = linkIn(pasted);
  if (!link) throw new InvalidInputError(LIST_LINK_INVALID);
  const ref = listRefOf(await resolveLink(link, fetcher));
  if (!ref) throw new InvalidInputError(LIST_LINK_INVALID);

  const response = await fetcher(listRequestUrl(ref), { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null);
  if (!response?.ok) throw new InvalidInputError(LIST_UNAVAILABLE);
  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text.startsWith(")]}'") ? text.slice(4) : text);
  } catch {
    throw new InvalidInputError(LIST_UNREADABLE);
  }
  const list = parseSharedList(data);
  if (!list || list.places.length === 0) throw new InvalidInputError(LIST_UNREADABLE);
  return list;
}
