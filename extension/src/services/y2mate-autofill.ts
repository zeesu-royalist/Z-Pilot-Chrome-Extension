export const Y2MATE_YOUTUBE_URL = 'https://v42.www-y2mate.com/';

/**
 * Self-contained DOM autofill script injected into https://v42.www-y2mate.com/ via
 * chrome.scripting.executeScript(). Must have zero external runtime dependencies.
 */
export async function autoFillY2matePage(
  targetUrl: string
): Promise<{ filled: boolean; submitted: boolean }> {
  if (!targetUrl) return { filled: false, submitted: false };

  const selectors = [
    '#txt-url',
    'input[name="url"]',
    'input[name="txt-url"]',
    '#sf_url',
    'input[type="url"]',
    'input[placeholder*="link" i]',
    'input[placeholder*="url" i]',
    'input[placeholder*="paste" i]',
    'input[placeholder*="search" i]',
    'input[placeholder*="youtube" i]',
    'form input[type="text"]',
  ];

  const findUrlInput = (): HTMLInputElement | null => {
    for (let i = 0; i < selectors.length; i++) {
      const el = document.querySelector(selectors[i]) as HTMLInputElement | null;
      if (el && !el.disabled && el.type !== 'hidden') {
        return el;
      }
    }
    return null;
  };

  let inputEl: HTMLInputElement | null = findUrlInput();
  for (let attempt = 0; !inputEl && attempt < 40; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    inputEl = findUrlInput();
  }

  if (!inputEl) {
    return { filled: false, submitted: false };
  }

  // Use native value setter so both vanilla/jQuery and React/Vue listeners detect the update
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )?.set;
  if (nativeSetter) {
    nativeSetter.call(inputEl, targetUrl);
  } else {
    inputEl.value = targetUrl;
  }

  inputEl.focus();
  inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  inputEl.dispatchEvent(new Event('change', { bubbles: true }));
  inputEl.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  inputEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));

  // Give Y2mate page scripts a brief moment to react to the filled URL before submitting
  await new Promise((resolve) => setTimeout(resolve, 300));

  const form = inputEl.closest('form');
  const submitBtn =
    (document.querySelector('#btn-submit') as HTMLElement | null) ||
    (document.querySelector('button[id="btn-submit"]') as HTMLElement | null) ||
    (document.querySelector('.btn-red') as HTMLElement | null) ||
    (document.querySelector('#sf_submit') as HTMLElement | null) ||
    (form?.querySelector(
      'button[type="submit"], input[type="submit"], button#btn-submit, .btn-red, .submit'
    ) as HTMLElement | null) ||
    (document.querySelector('button[type="submit"], input[type="submit"]') as HTMLElement | null);

  if (submitBtn) {
    submitBtn.click();
    return { filled: true, submitted: true };
  }

  if (form) {
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit();
    } else {
      form.submit();
    }
    return { filled: true, submitted: true };
  }

  return { filled: true, submitted: false };
}

