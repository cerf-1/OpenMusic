import assert from 'node:assert/strict';
// Optional browser regression; start npm start first.
// PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/fullscreen-ui.mjs
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try {
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/api/v1/**',route=>route.fulfill({status:401,contentType:'application/json',body:'{}'}));
const metrics=()=>page.evaluate(()=>Object.fromEntries(['.main-play','.transport [data-action="previous"]','.shuffle-button'].map(sel=>{const el=document.querySelector(sel),s=getComputedStyle(el);return [sel,[s.width,s.height,s.color,s.backgroundColor,el.querySelector('svg').getBoundingClientRect().width]];})));
await page.goto(process.env.UI_TEST_ORIGIN || 'http://127.0.0.1:4173');
await page.locator('.mini-art-button').click();
await page.locator('.listening-room').waitFor();
const desktop=await metrics();
if(process.env.UI_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.UI_SCREENSHOT_DIR}/fullscreen-desktop.png`});
for(const [width,height] of [[390,844],[320,568],[430,932],[720,540]]){
 await page.setViewportSize({width,height});
 await page.waitForTimeout(100);
 assert.deepEqual(await metrics(),desktop);
 const geometry=await page.evaluate(()=>{
 const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width}};
 return {details:rect('.listening-details'),like:rect('.listening-details .player-like'),timeline:rect('.listening-controls .timeline'),transport:rect('.listening-controls .transport'),actions:rect('.listening-actions'),wave:rect('.cover-wave'),art:rect('.listening-art'),overflow:document.querySelector('.listening-room').scrollWidth>innerWidth};
 });
 assert(!geometry.overflow);
 assert(geometry.like.x>geometry.details.x);
 assert(geometry.wave.bottom<=geometry.details.y+1);
 assert(geometry.details.bottom<=geometry.timeline.y);
 assert(geometry.timeline.bottom<=geometry.transport.y);
 assert(geometry.actions.bottom<=height,JSON.stringify(geometry));
 if(process.env.UI_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.UI_SCREENSHOT_DIR}/fullscreen-${width}x${height}.png`});
 console.log(`Layout ${width}×${height}: passed`);
}
await page.setViewportSize({width:390,height:844});
await page.locator('.listening-room .shuffle-button').click();
assert.equal(await page.locator('.shuffle-button').getAttribute('aria-pressed'),'true');
await page.locator('.listening-room .repeat-button').click();
assert.equal(await page.locator('.repeat-button').getAttribute('aria-pressed'),'true');
const previousTitle=await page.locator('#full-title').textContent();
await page.locator('.listening-controls [data-action=next]').click();
await page.waitForFunction(title=>document.querySelector('#full-title').textContent!==title,previousTitle);
assert.equal(await page.locator('#full-title').textContent(),await page.locator('#player-title').textContent());
assert.notEqual(await page.locator('.fullscreen-menu').getAttribute('data-id'),'0');
await page.locator('#volume').fill('0.3');
await page.locator('#progress').fill('30');
await page.locator('.fullscreen-back').click();
assert.equal(await page.locator('.player .playback').count(),1);
assert.equal(await page.locator('.player .player-like').count(),1);
assert.equal(await page.locator('.player .player-tools').count(),1);
await page.locator('.mini-art-button').click();
await page.setViewportSize({width:1440,height:1000});
assert.equal(await page.locator('.player .playback').count(),1);
await page.setViewportSize({width:390,height:844});
await page.locator('.fullscreen-menu').click();
await page.locator('.small-modal').waitFor();
await page.keyboard.press('Escape');
await page.locator('.mini-art-button').click();
await page.locator('.listening-actions .queue-button').click();
await page.locator('.queue-panel').waitFor();
await page.keyboard.press('Escape');
assert.deepEqual(errors,[]);
console.log('Controls, resize restoration, menu, queue, Escape and console: passed');
} finally { await browser.close(); }
