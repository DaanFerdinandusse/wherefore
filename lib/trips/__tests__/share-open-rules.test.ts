import { describe, expect, it } from "vitest";

import { isPersonOpening } from "../share-open-rules";

const chrome =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const iphone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const open = (userAgent: string | null, extra: Partial<Parameters<typeof isPersonOpening>[0]> = {}) =>
  isPersonOpening({ userAgent, purpose: null, routerPrefetch: null, ...extra });

describe("isPersonOpening", () => {
  it("counts a browser on a laptop or a phone", () => {
    expect(open(chrome)).toBe(true);
    expect(open(iphone)).toBe(true);
  });

  it("skips link previews and crawlers", () => {
    for (const agent of [
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "WhatsApp/2.23.20.0",
      "facebookexternalhit/1.1 Facebot Twitterbot/1.0",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "TelegramBot (like TwitterBot)",
      "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
      "LinkedInBot/1.0 (compatible; Mozilla/5.0)",
      "curl/8.4.0",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36",
    ]) {
      expect(open(agent), agent).toBe(false);
    }
  });

  it("skips prefetches and requests without a user agent", () => {
    expect(open(chrome, { purpose: "prefetch" })).toBe(false);
    expect(open(chrome, { purpose: "prefetch;prerender" })).toBe(false);
    expect(open(chrome, { routerPrefetch: "1" })).toBe(false);
    expect(open(null)).toBe(false);
    expect(open("  ")).toBe(false);
  });
});
