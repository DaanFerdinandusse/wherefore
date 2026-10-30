import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Composer } from "./composer";

const render = (props: { suggestion?: string; busy?: boolean } = {}) =>
  renderToStaticMarkup(
    <Composer busy={props.busy ?? false} stopping={false} placeholder="Ask for a change" suggestion={props.suggestion} onSend={() => {}} onStop={() => {}} />,
  );

describe("the composer's suggestion", () => {
  it("shows the placeholder and no Tab key without a suggestion", () => {
    const html = render();
    expect(html).toContain('placeholder="Ask for a change"');
    expect(html).not.toContain("suggestion-tab");
  });

  it("takes the placeholder's place, with a Tab key to use it", () => {
    const html = render({ suggestion: "Dinner on day 2 near Alfama" });
    expect(html).toContain('placeholder="Dinner on day 2 near Alfama"');
    expect(html).toContain('data-testid="suggestion-tab"');
  });
});
