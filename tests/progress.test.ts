import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Progress } from "@/components/ui/progress";

function render(value: number, max: number, active = false) {
  return renderToStaticMarkup(
    createElement(Progress, { value, max, active, label: "Fortschritt", valueText: "Meta verarbeitet das Video" })
  );
}

describe("upload progress", () => {
  it("keeps a visible track and activity indicator before the first media completes", () => {
    const html = render(0, 6, true);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="0"');
    expect(html).toContain('aria-valuemax="6"');
    expect(html).toContain('aria-valuetext="Meta verarbeitet das Video"');
    expect(html).toContain("bg-border");
    expect(html).toContain("upload-progress-activity");
    expect(html).toContain("width:0%");
  });

  it("counts media as well as ads without waiting for the first ad", () => {
    const html = render(3, 6, true);
    expect(html).toContain('aria-valuenow="3"');
    expect(html).toContain("width:50%");
  });

  it("does not animate stopped, queued or completed work", () => {
    expect(render(2, 6)).not.toContain("upload-progress-activity");
    expect(render(6, 6)).toContain("width:100%");
  });

  it.each([
    [10, 6, 100],
    [-1, 6, 0],
    [0, 0, 0],
    [NaN, Infinity, 0]
  ])("keeps invalid or stale counts inside the track (%s/%s)", (value, max, width) => {
    expect(render(value, max)).toContain(`width:${width}%`);
  });
});
