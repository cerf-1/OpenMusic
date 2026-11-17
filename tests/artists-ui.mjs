// Start npm start, then PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/artists-ui.mjs
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let failArtist=true,failHeader=true;
  const headerRequests=[];
  await page.route('**/api/v1/**',async route=>{
    if(route.request().url().endsWith('/artist')) {
      headerRequests.push(route.request().postDataJSON());
      if(failHeader)return route.fulfill({status:503,json:{error:{message:'Profile temporarily unavailable'}}});
      return route.fulfill({json:{browse_id:'UCfRoOGGP0qMFHK7sYiL34_g',name:'Remote <Artist>',header_image:'/assets/cover-forest.jpg'}});
    }
    if(route.request().url().endsWith('/search')) {
      const {query,page:resultPage}=route.request().postDataJSON();
      if(query==='Remote <Artist>'&&failArtist)return route.fulfill({status:503,json:{error:{message:'Test search unavailable'}}});
      return route.fulfill({json:{items:query==='Remote <Artist>'?[
        {video_id:'Lmnopqrstuv',title:'Second song',artist:query,duration_seconds:180},
        {video_id:'Zbcdefghijk',title:'Unrelated song',artist:'Someone Else',duration_seconds:120}
      ]:[{video_id:'Abcdefghijk',title:'First song',artist:'Remote <Artist>',artist_browse_id:'UCfRoOGGP0qMFHK7sYiL34_g',duration_seconds:150}],page:resultPage,has_more:false}});
    }
    return route.fulfill({status:401,json:{}});
  });
  await page.goto(process.env.UI_TEST_ORIGIN || 'http://127.0.0.1:4173');
  assert.equal(await page.locator('.artist-card').count(),6);
  await page.locator('.artist-card').filter({hasText:'Sora'}).click();
  assert.equal(await page.locator('#artist-title').textContent(),'Sora');
  assert.deepEqual(await page.locator('#artist-track-list .track-title').allTextContents(),['Weightless','First Light']);
  assert.equal(await page.locator('.artist-pick').isVisible(),true);
  await page.locator('[data-action="play-artist"]').click();
  await page.waitForFunction(()=>document.querySelector('.artist-play').dataset.playing==='true');
  await page.locator('.player [data-action="next"]').click();
  await page.waitForFunction(()=>document.querySelector('#player-title').textContent==='First Light');
  await page.locator('.player [data-action="next"]').click();
  await page.waitForFunction(()=>document.querySelector('#player-title').textContent==='Weightless');
  await page.locator('[data-action="shuffle-artist"]').click();
  assert.equal(await page.locator('[data-action="shuffle-artist"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-action="queue-artist"]').click();
  assert.equal(await page.locator('[data-action="queue-artist"]').isDisabled(),true);
  for (const [width,height] of [[1440,1000],[390,844],[320,568],[720,540],[980,800]]) {
    await page.setViewportSize({width,height});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow ${width}`);
    assert.equal(await page.locator('.artist-pick').isVisible(),width>720);
    const row=page.locator('#artist-track-list .track-row').first();
    const title=await row.locator('.track-details').boundingBox(),menu=await row.locator('[data-action="track-menu"]').boundingBox();
    assert(title.x+title.width<=menu.x);
    if(process.env.UI_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.UI_SCREENSHOT_DIR}/artist-${width}.png`});
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('[data-action="artist-back"]').click();
  await page.locator('.artist-card').first().waitFor();
  await page.locator('#player-artist').click();
  await page.locator('#artist-title').waitFor();
  await page.locator('[data-action="artist-back"]').click();
  await page.locator('.nav-item[data-view="search"]').click();
  await page.locator('#search-input').fill('remote');
  await page.locator('#resolve-form [type="submit"]').click();
  await page.locator('#search-results .track-artist').click();
  assert.equal(await page.locator('#artist-title').textContent(),'Remote <Artist>');
  await page.getByRole('button',{name:'Повторить',exact:true}).waitFor();
  assert.equal(await page.locator('.artist-header-image').count(),0);
  failHeader=false;await page.getByRole('button',{name:'Повторить',exact:true}).click();
  await page.locator('.artist-header-image').waitFor();
  await page.locator('.artist-header-image').evaluate(img=>img.decode());
  assert.equal(await page.locator('.artist-header-image').getAttribute('src'),'/assets/cover-forest.jpg');
  assert.equal(headerRequests[0].browse_id,'UCfRoOGGP0qMFHK7sYiL34_g');
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:844});
    const layout=await page.evaluate(()=>{const hero=document.querySelector('.artist-hero'),r=hero.getBoundingClientRect(),s=document.querySelector('.main-shell').getBoundingClientRect();return {left:r.left,right:r.right,shell:s.left,radius:getComputedStyle(hero).borderRadius,top:r.top,overflow:document.documentElement.scrollWidth>innerWidth};});
    assert.equal(layout.left,layout.shell);assert.equal(layout.right,width);assert.equal(layout.top,0);assert.equal(layout.radius,'0px');assert.equal(layout.overflow,false);
    if(process.env.UI_SCREENSHOT_DIR)await page.screenshot({path:`${process.env.UI_SCREENSHOT_DIR}/artist-header-${width}.png`});
  }
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:'Try again'}).waitFor();
  failArtist=false;
  await page.getByRole('button',{name:'Try again'}).click();
  await page.getByText('Second song',{exact:true}).waitFor();
  assert.equal(await page.getByText('Unrelated song',{exact:true}).count(),0);
  assert.equal(await page.locator('#artist-track-list .track-row').count(),2);
  assert.equal(await page.locator('[data-action="artist-more"]').isVisible(),false);
  await page.locator('[data-action="artist-back"]').click();
  assert.equal(await page.locator('#search-input').inputValue(),'remote');
  assert.equal(await page.locator('#search-results .track-title').textContent(),'First song');
  // Artist navigation inside a menu closes the modal and keeps playback intact.
  await page.locator('#search-results [data-action="track-menu"]').click();
  await page.locator('.small-modal [data-action="open-artist"]').click();
  assert.equal(await page.locator('[role="dialog"]').count(),0);
  await page.locator('.nav-item[data-view="home"]').click();
  await page.locator('.artist-card').first().waitFor();
  assert.deepEqual(errors,[]);
  console.log('Artist browser regression passed: navigation, scoped playback/next, shuffle, queue, responsive layout, remote retry/filtering, search restoration, menus.');
} finally { await browser.close(); }
