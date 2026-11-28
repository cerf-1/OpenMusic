// Start npm start, then PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/artists-ui.mjs
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let failArtist=true,failHeader=true;
  const collab=[
    {name:'VILLIAN',browse_id:'UC'+'a'.repeat(22)},
    {name:'madk1d',browse_id:'UC'+'b'.repeat(22)}
  ];
  const headerRequests=[];
  await page.route('**/api/v1/**',async route=>{
    if(route.request().url().endsWith('/artist')) {
      const request=route.request().postDataJSON();
      headerRequests.push(request);
      if(collab.some(credit=>credit.name===request.name))return route.fulfill({json:{name:request.name,browse_id:request.browse_id}});
      if(failHeader)return route.fulfill({status:503,json:{error:{message:'Profile temporarily unavailable'}}});
      return route.fulfill({json:{browse_id:'UCfRoOGGP0qMFHK7sYiL34_g',name:'Remote <Artist>',header_image:'/assets/cover-forest.jpg'}});
    }
    if(route.request().url().endsWith('/search')) {
      const {query,page:resultPage}=route.request().postDataJSON();
      if(query==='Remote <Artist>'&&failArtist)return route.fulfill({status:503,json:{error:{message:'Test search unavailable'}}});
      if(['collab',...collab.map(credit=>credit.name)].includes(query)){
        return route.fulfill({json:{items:[{video_id:'Cbcdefghijk',title:'Together',artist:'VILLIAN, madk1d',artist_credits:collab}],page:resultPage,has_more:false}});
      }
      return route.fulfill({json:{items:query==='Remote <Artist>'?[
        {video_id:'Lmnopqrstuv',title:'Second song',artist:query,duration_seconds:180},
        {video_id:'Zbcdefghijk',title:'Unrelated song',artist:'Someone Else',duration_seconds:120}
      ]:[{video_id:'Abcdefghijk',title:'First song',artist:'Remote <Artist>',artist_browse_id:'UCfRoOGGP0qMFHK7sYiL34_g',duration_seconds:150}],page:resultPage,has_more:false}});
    }
    return route.fulfill({status:401,json:{}});
  });
  await page.goto(process.env.UI_TEST_ORIGIN || 'http://127.0.0.1:4173');
  const quickInput=page.locator('#quick-search-input');
  const quickLinks=page.locator('.quick-search-track a');
  async function search(query){
    await quickInput.fill(query);
    await quickInput.press('Enter');
    await quickLinks.first().waitFor();
  }
  assert.equal(await page.locator('.artist-card').count(),0);
  await search('remote');
  await quickLinks.click();
  assert.equal(await page.locator('#artist-title').textContent(),'Remote <Artist>');
  await page.getByRole('button',{name:'Retry',exact:true}).waitFor();
  assert.equal(await page.locator('.artist-header-image').count(),0);
  failHeader=false;await page.getByRole('button',{name:'Retry',exact:true}).click();
  await page.locator('.artist-header-image').waitFor();
  await page.locator('.artist-header-image').evaluate(img=>img.decode());
  assert.equal(await page.locator('.artist-header-image').getAttribute('src'),'/assets/cover-forest.jpg');
  assert.equal(headerRequests[0].browse_id,'UCfRoOGGP0qMFHK7sYiL34_g');
  for(const width of [1857,1440,390,320]){
    await page.setViewportSize({width,height:844});
    const layout=await page.evaluate(()=>{
      const bounds=selector=>document.querySelector(selector).getBoundingClientRect().toJSON();
      return {
        hero:bounds('.artist-hero'), image:bounds('.artist-header-image'),
        bar:bounds('.topbar'), shell:bounds('.main-shell'), actions:bounds('.artist-actions'),
        overflow:document.documentElement.scrollWidth>innerWidth
      };
    });
    assert.equal(layout.hero.left,layout.shell.left);
    assert.equal(layout.hero.right,width);
    assert.equal(layout.hero.top,layout.bar.bottom);
    assert.equal(layout.hero.left,layout.bar.left);
    assert.equal(layout.hero.right,layout.bar.right);
    assert.deepEqual(layout.image,layout.hero);
    assert.ok(layout.hero.height<=(width<=720?340:400));
    assert.equal(layout.hero.bottom,layout.actions.top);
    assert.equal(layout.overflow,false);
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
  await page.locator('#artist-track-list [data-action="track-menu"]').first().click();
  await page.locator('.small-modal [data-action="open-artist"]').click();
  assert.equal(await page.locator('[role="dialog"]').count(),0);
  await page.locator('[data-action="artist-back"]').click();
  assert.equal(await quickInput.inputValue(),'remote');
  await search('remote');
  assert.equal(await page.locator('.quick-search-track strong').textContent(),'First song');
  await quickLinks.click();
  assert.equal(await page.locator('.artist-header-image').getAttribute('src',{timeout:3000}),'/assets/cover-forest.jpg');
  await page.locator('.artist-header-image').evaluate(img=>img.decode());
  assert.equal(headerRequests.length,2);
  await page.locator('.nav-item[data-view="home"]').click();
  assert.equal(await page.locator('.artist-card').count(),0);
  await search('collab');
  assert.deepEqual(await quickLinks.allTextContents(),collab.map(credit=>credit.name));
  for(const credit of collab){
    const link=quickLinks.getByText(credit.name,{exact:true});
    const request=page.waitForRequest(req=>req.url().endsWith('/artist')&&req.postDataJSON().name===credit.name);
    await link.click();
    assert.deepEqual((await request).postDataJSON(),credit);
    assert.equal(await page.locator('#artist-title').textContent(),credit.name);
    assert.equal(new URLSearchParams(new URL(page.url()).hash.slice(1)).get('browse_id'),credit.browse_id);
    await page.locator('.artist-back').click();
    await search('collab');
  }
  const direct=await quickLinks.last().getAttribute('href');
  await page.locator('.quick-search-play').click();
  assert.deepEqual(await page.locator('#player-artist a').allTextContents(),collab.map(credit=>credit.name));
  await page.locator('.mini-art-button').click();
  assert.deepEqual(await page.locator('#full-artist a').allTextContents(),collab.map(credit=>credit.name));
  await page.locator('#full-artist a').last().click();
  assert.equal(await page.locator('#artist-title').textContent(),'madk1d');
  await page.locator('.artist-back').click();
  await search('collab');
  assert.deepEqual(await quickLinks.allTextContents(),collab.map(credit=>credit.name));
  await quickLinks.first().click();
  assert.equal(await page.locator('#artist-title').textContent(),'VILLIAN');
  const directPage=await browser.newPage();
  await directPage.route('**/api/v1/**',async route=>{
    const request=route.request();
    if(request.url().endsWith('/artist'))return route.fulfill({json:{name:request.postDataJSON().name}});
    if(request.url().endsWith('/search'))return route.fulfill({json:{items:[],has_more:false}});
    return route.fulfill({status:401,json:{}});
  });
  await directPage.goto(new URL(direct,page.url()).href);
  assert.equal(await directPage.locator('#artist-title').textContent(),'madk1d');
  await directPage.close();
  assert.deepEqual(errors,[]);
  console.log('Artist browser regression passed: navigation, responsive layout, remote retry/filtering, search restoration, menus.');
} finally { await browser.close(); }
