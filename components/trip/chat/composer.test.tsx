import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { NextPrompt } from "@/lib/agent/next-prompt";

import { Composer } from "./composer";

const render = (props: { suggestions?: readonly NextPrompt[]; busy?: boolean } = {}) =>
  renderToStaticMarkup(
    <Composer busy={props.busy ?? false} stopping={false} placeholder="Ask for a change" suggestions={props.suggestions} onSend={() => {}} onStop={() => {}} />,
  );

describe("the composer's suggestions", () => {
  it("shows no pills without suggestions", () => {
    const html = render();
    expect(html).toContain('placeholder="Ask for a change"');
    expect(html).not.toContain("next-prompts");
  });

  it("shows one pill per suggestion above the field and keeps the placeholder", () => {
    const html = render({
      suggestions: [
        { label: "Dinner nearby", prompt: "Find dinner on day 2 near Alfama" },
        { label: "Coffee stop", prompt: "Now a quiet coffee stop near the lunch spot" },
      ],
    });
    expect(html.match(/data-testid="next-prompt"/g)).toHaveLength(2);
    expect(html).toContain(">Dinner nearby</button>");
    expect(html).toContain('title="Find dinner on day 2 near Alfama"');
    expect(html).toContain('placeholder="Ask for a change"');
    expect(html.indexOf("next-prompts")).toBeLessThan(html.indexOf("<form"));
  });
});
