const { chromium } = require('playwright');

const ATTEMPT_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 4; // 1 initial + up to 3 retries
const RETRY_BACKOFF_BASE_MS = 1000;

const STORE_BASE_URL = process.env.TARGET_STORE_URL || 'https://demo.inelabteamdev.com';

/**
 * Converts a rendered price string back to a plain integer, regardless of
 * which of the store's several display formats was used (plain, spaced
 * digit groups, "euro-style" grouping with a fake trailing ",00", full-width
 * unicode digits, non-breaking-space/zero-width-joined digits, or a
 * "/- (incl. of all taxes)" suffix). All of these are just cosmetic
 * transformations of the same underlying whole-number price, so this
 * strips everything down to digits rather than trying to parse each
 * format's own punctuation rules.
 */
function normalizePriceText(raw) {
  const asciiDigits = raw.replace(/[\uFF10-\uFF19]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30)
  );

  // The "euro-style" variant appends a fake ",00" or ".00" at the very end.
  // A real en-IN grouped integer never ends in a 2-digit group (the final
  // group is always 3 digits), so this pattern only ever appears from that
  // fake suffix — safe to detect and strip.
  const hasFakeDecimalSuffix = /[.,]00$/.test(asciiDigits.trim());

  let digitsOnly = asciiDigits.replace(/[^0-9]/g, '');
  if (hasFakeDecimalSuffix && digitsOnly.length > 2) {
    digitsOnly = digitsOnly.slice(0, -2);
  }

  return digitsOnly ? Number(digitsOnly) : NaN;
}

/**
 * Scrapes current price + stock for one tracked product+option using a
 * real browser. Playwright is required because the price panel is gated
 * behind a client-side check (mouse-movement/dwell tracking) that a plain
 * HTTP request cannot legitimately satisfy — see the design note for the
 * Phase 0 investigation that led here.
 *
 * We deliberately read the final price from the rendered page rather than
 * from the underlying network response: the store's `quote` API returns an
 * encrypted payload (decoded client-side by the app's own JS), and several
 * of the price-related DOM elements are decoys with fabricated values
 * (hidden via aria-hidden/display:none — one is even labeled
 * `data-price="true"` as bait). We investigated decrypting the payload
 * ourselves, decided that crosses from "acting like a real browser" into
 * reverse-engineering the app's internal secret material, and instead read
 * exactly what a real visitor would see on the rendered page — which is
 * simpler, and avoids depending on an undocumented internal encoding that
 * could change at any time.
 */
async function scrapePrice({ storeProductId, optionLabel, headed = false }) {
  const browser = await chromium.launch({ headless: !headed });
  let retryCount = 0;

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(ATTEMPT_TIMEOUT_MS);

    const itemUrl = `${STORE_BASE_URL}/item/${storeProductId}`;
    await page.goto(itemUrl, { waitUntil: 'domcontentloaded', timeout: ATTEMPT_TIMEOUT_MS });

    /**
     * The cookie-consent modal only appears ~25% of the time, after a
     * random 1.5-5s delay (not immediately on load), and can require
     * 2-3 clicks on "Allow" to actually close (confirmed from the app's
     * own source — each click just decrements an internal counter).
     * Called before any click that matters, rather than once at the
     * start, since it can appear mid-flow and block a later action.
     */
    async function dismissConsentIfPresent() {
      const allowBtn = page.getByRole('button', { name: 'Allow', exact: true });
      for (let i = 0; i < 4; i++) {
        const visible = await allowBtn.isVisible().catch(() => false);
        if (!visible) return;
        await allowBtn.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(200);
      }
    }

    // Give the modal a moment to appear before we start interacting —
    // its delay can start as early as 1.5s in.
    await page.waitForTimeout(1800);
    await dismissConsentIfPresent();

    /**
     * Clicks a locator, and if the click can't complete (most likely
     * because the consent modal appeared and is intercepting it),
     * clears the modal and retries once.
     */
    async function clickThroughConsent(locator, timeout = ATTEMPT_TIMEOUT_MS) {
      try {
        await locator.click({ timeout });
      } catch (err) {
        await dismissConsentIfPresent();
        await locator.click({ timeout });
      }
    }

    // Select the correct variant before checking price — the price is
    // keyed by option, so tracking the wrong one would silently price a
    // different configuration.
    await clickThroughConsent(page.getByRole('button', { name: optionLabel, exact: true }));

    /**
     * Finds the real "CHECK TODAY'S PRICE"/"RETRY"/"CHECK AGAIN" button
     * among possible decoys sharing the same class, by checking each
     * candidate is genuinely visible, sized, and not hidden from
     * assistive tech (a strong signal of a decoy, not a real control).
     */
    async function findRealPriceButton() {
      const searchTimeout = 5000;
      const start = Date.now();

      while (Date.now() - start < searchTimeout) {
        const candidates = page.locator('button.ctl.ctl-main');
        const count = await candidates.count();

        for (let i = 0; i < count; i++) {
          const candidate = candidates.nth(i);
          if (!(await candidate.isVisible())) continue;
          if ((await candidate.getAttribute('aria-hidden')) === 'true') continue;
          const box = await candidate.boundingBox();
          if (!box || box.width === 0 || box.height === 0) continue;
          return candidate;
        }
        await page.waitForTimeout(250);
      }
      throw new Error('Could not locate the real price button among candidates.');
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) {
        await page.waitForTimeout(RETRY_BACKOFF_BASE_MS * 2 ** (attempt - 2));
      }

      const btn = await findRealPriceButton();

      if (attempt === 1) {
        // Only the very first click is gated behind a genuine dwell
        // requirement (confirmed from the app's own source: at least 8
        // recorded mouse-move samples, at least 600ms since the first
        // one) — "RETRY"/"CHECK AGAIN" have no such gate. We perform
        // real, CDP-dispatched mouse movement — exactly the kind of
        // trusted input event a plain HTTP request cannot produce.
        await dismissConsentIfPresent();
        const box = await btn.boundingBox();
        if (box) {
          for (let m = 0; m < 10; m++) {
            const x = box.x + box.width / 2 + (Math.random() * 20 - 10);
            const y = box.y + box.height / 2 + (Math.random() * 10 - 5);
            await page.mouse.move(x, y, { steps: 2 });
            await page.waitForTimeout(70); // keep moves spaced apart, per the app's own move-registration logic
          }
        }
        await page.waitForTimeout(650); // clear the minimum dwell time since the first move
      }

      await clickThroughConsent(btn);

      // Wait for the panel to settle into either a success or failure
      // state, rather than waiting on a specific network call.
      const resultLocator = page.locator(
        "text=/Loaded in \\d+ attempt|Couldn.t load the price after \\d+ attempts/"
      );
      try {
        await resultLocator.first().waitFor({ state: 'visible', timeout: ATTEMPT_TIMEOUT_MS });
      } catch {
        console.log(`[attempt ${attempt}] neither success nor failure text appeared in time`);
        retryCount = attempt;
        continue;
      }

      const resultText = (await resultLocator.first().innerText()).toLowerCase();
      console.log(`[attempt ${attempt}] result text: "${resultText}"`);

      if (resultText.includes("couldn")) {
        console.log(`[attempt ${attempt}] site reported failure`);
        retryCount = attempt;
        continue;
      }

      // Success — extract stock and price from the rendered panel.
      let stock = null;
      const availLocator = page.locator('.avail-pill');
      if (await availLocator.count()) {
        const availText = await availLocator.first().innerText();
        if (/sold out/i.test(availText)) {
          stock = '0';
        } else {
          const match = availText.match(/\d+/);
          stock = match ? match[0] : availText.trim();
        }
      }

      const priceLocator = page.locator('[style*="2.4rem"]');
      let price = null;
      const priceLocatorCount = await priceLocator.count();
      console.log(`[attempt ${attempt}] price locator matched ${priceLocatorCount} element(s)`);
      if (priceLocatorCount) {
        const priceText = await priceLocator.first().innerText();
        console.log(`[attempt ${attempt}] raw price text: "${priceText}"`);
        const parsed = normalizePriceText(priceText);
        console.log(`[attempt ${attempt}] parsed price: ${parsed}`);
        if (Number.isFinite(parsed)) {
          price = parsed;
        }
      }

      // Validation — never call this a success if we couldn't actually
      // pull out a real price, even though the page itself reported one.
      if (!Number.isFinite(price)) {
        retryCount = attempt;
        continue;
      }

      return {
        outcome: retryCount > 0 ? 'retried' : 'success',
        price,
        stock,
        retryCount,
        errorReason: null,
      };
    }

    return {
      outcome: 'failed',
      price: null,
      stock: null,
      retryCount,
      errorReason: 'challenge_failed',
    };
  } catch (err) {
    return {
      outcome: 'failed',
      price: null,
      stock: null,
      retryCount,
      errorReason: err.message.slice(0, 200),
    };
  } finally {
    await browser.close();
  }
}

module.exports = { scrapePrice, normalizePriceText };