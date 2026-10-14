import assert from "node:assert/strict";

// Composite transparent surfaces before measuring WCAG text contrast.
export async function checkTextContrast(page) {
  const result = await page.evaluate(() => {
    const parse = (value) => {
      const numbers = value.match(/[\d.]+/g)?.map(Number) ?? [];
      return [numbers[0] ?? 0, numbers[1] ?? 0, numbers[2] ?? 0, numbers[3] ?? 1];
    };
    const over = (front, back) => front.slice(0, 3).map((n, i) => n * front[3] + back[i] * (1 - front[3]));
    const luminance = (rgb) => rgb.map((v) => v / 255).map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
    const failures = [];
    let checked = 0;
    for (const el of document.querySelectorAll("body *")) {
      if (!(el instanceof HTMLElement) || el.closest('[disabled], [aria-disabled="true"], [data-nextjs-dev-tools-button], nextjs-portal')) continue;
      const text = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join("").trim();
      if (!text && !(el instanceof HTMLInputElement) && !(el instanceof HTMLTextAreaElement)) continue;
      if (el.getBoundingClientRect().width === 0 || el.getBoundingClientRect().height === 0 || !el.checkVisibility()) continue;
      const chain = [];
      for (let parent = el; parent; parent = parent.parentElement) chain.push(getComputedStyle(parent));
      // Image and gradient overlays are checked visually, not against an invented flat background.
      if (chain.some((s) => s.backgroundImage !== "none" || Number(s.opacity) < 1)) continue;
      let bg = [255, 255, 255];
      for (const style of chain.toReversed()) bg = over(parse(style.backgroundColor), bg);
      const style = getComputedStyle(el);
      const placeholder = !text && !el.value && el.placeholder;
      const color = parse(placeholder ? getComputedStyle(el, "::placeholder").color : style.color);
      const fg = over(color, bg);
      const l1 = luminance(fg), l2 = luminance(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const size = parseFloat(style.fontSize);
      const minimum = size >= 24 || (size >= 18.66 && Number(style.fontWeight) >= 700) ? 3 : 4.5;
      checked++;
      if (ratio + 0.05 < minimum) failures.push({ text: (text || el.value || el.placeholder).slice(0, 80), ratio: ratio.toFixed(2), className: el.className });
    }
    return { checked, failures };
  });
  assert(result.checked > 10, "Contrast check must inspect rendered text");
  assert.deepEqual(result.failures, [], `Insufficient text contrast: ${JSON.stringify(result.failures)}`);
  console.log(`PASS contrast for ${result.checked} rendered text/input elements`);
}
