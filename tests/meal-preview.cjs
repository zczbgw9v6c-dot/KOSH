const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function test() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.url().includes('/img/meal/') && !response.ok()) errors.push(response.url());
    });
    const option = (asset, choice) => ({ asset, option: { group: 'Garnitures', choice } });
    const burger = {
      n: 'Burger de test',
      p: 10,
      c: 'Burgers',
      o: [{ t: 'Garnitures', ch: [{ n: 'Salade', p: 0 }, { n: 'Tomate', p: 0.5 }] }],
      mealPreview: { profile: 'burger', layers: [
        { asset: 'bun-bottom' }, { asset: 'beef' }, option('lettuce', 'Salade'),
        option('tomato', 'Tomate'), { asset: 'bun-top' },
      ] },
    };
    await page.goto(process.env.KOSH_URL || 'http://127.0.0.1:8766/');
    await page.evaluate(product => {
      const mid = 'le-j';
      localStorage.setItem('pk-lang', 'fr');
      S.lang = 'fr';
      store.menus[mid] = { items: { 'test-burger': product } };
      A.cfg('test-burger', { dataset: { m: mid } });
      render();
    }, burger);

    const layers = page.locator('.meal-layer');
    const activeLayers = page.locator('.meal-layer:not(.meal-leaving)');
    await layers.nth(2).waitFor();
    assert.equal(await layers.count(), 3);
    await page.getByRole('button', { name: /Tomate/ }).click();
    assert.equal(await activeLayers.count(), 4);
    assert.match(await page.locator('[data-a="cfadd"]').innerText(), /10,50/);
    const bottom = await layers.last().evaluate(element => element.style.bottom);
    await page.getByRole('button', { name: 'Vue éclatée' }).click();
    assert.notEqual(await layers.last().evaluate(element => element.style.bottom), bottom);
    await page.getByRole('button', { name: /Salade/ }).click();
    assert.equal(await activeLayers.count(), 5);
    assert.equal(await page.getByRole('button', { name: 'Vue assemblée' }).count(), 1);
    await page.getByRole('button', { name: /Salade/ }).click();
    assert.equal(await activeLayers.count(), 4);
    await page.locator('[data-a="cfq"][data-v="1"]').click();
    assert.match(await page.locator('[data-a="cfadd"]').innerText(), /21,00/);
    await page.getByRole('button', { name: 'Vue assemblée' }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.meal-layer')].every(image => image.complete && image.naturalWidth > 0));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.KOSH_SCREENSHOT) await page.locator('.meal-preview').screenshot({ path: process.env.KOSH_SCREENSHOT });
    await page.locator('[data-a="cfadd"]').click();
    assert.deepEqual(await page.evaluate(() => lines().map(({ n, p, q, o }) => ({ n, p, q, o }))),
      [{ n: burger.n, p: 10.5, q: 2, o: ['Tomate'] }]);
    assert.deepEqual(errors, []);
    console.log('Composition burger, vue éclatée, images, prix et panier vérifiés dans Chromium mobile.');
  } finally {
    await browser.close();
  }
}

test().catch(error => { console.error(error); process.exitCode = 1; });
