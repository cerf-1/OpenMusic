// Optional browser regression: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/account-ui.mjs
// Start the backend first; defaults to http://127.0.0.1:8091. API responses below are mocks.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
const origin=process.env.UI_TEST_ORIGIN || 'http://127.0.0.1:8091';
const errors=[];
try {
  const context=await browser.newContext();
  const page=await context.newPage();
  page.on('pageerror', error=>errors.push(error.message));
  let user=null,failSave=false,resolveCalls=[];
  const saved={track:[],album:[]};
  const json=(route,status,data)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  await page.route('**/api/v1/**',async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname;
    if(path.endsWith('/auth/me'))return json(route,user?200:401,user?{user,csrf_token:'csrf'}:{error:{message:'Sign in with Telegram'}});
    if(path.endsWith('/auth/telegram/start'))return route.fulfill({status:204});
    if(path.endsWith('/auth/logout')){user=null;return route.fulfill({status:204});}
    if(path.endsWith('/resolve')){resolveCalls.push(request.postDataJSON());return json(route,502,{error:{message:'Test stream unavailable'}});}
    if(path.endsWith('/search'))return json(route,200,{items:[{video_id:'Zbcdefghijk',title:'Search song',artist:'Artist',duration_seconds:125}],has_more:false,page:1});
    if(path.endsWith('/recommendations'))return json(route,200,{items:[]});
    if(path==='/api/v1/likes')return json(route,200,{items:saved[url.searchParams.get('type')],has_more:false});
    if(path.startsWith('/api/v1/likes/')){
      assert.equal(request.headers()['x-csrf-token'],'csrf');
      const [type,source,source_id]=path.slice('/api/v1/likes/'.length).split('/');
      if(failSave)return json(route,503,{error:{message:'The database is unavailable.'}});
      if(request.method()==='DELETE')saved[type]=saved[type].filter(item=>item.source_id!==source_id);
      else if(!saved[type].some(item=>item.source_id===source_id))saved[type].unshift({type,source,source_id,...request.postDataJSON()});
      return request.method()==='DELETE'?route.fulfill({status:204}):json(route,200,{saved:true});
    }
    return route.abort();
  });
  await page.goto(origin);
  const signIn=page.getByRole('dialog',{name:'Sign in'});
  const telegram=signIn.getByRole('button',{name:'Sign in with Telegram',exact:true});
  const guest=page.getByRole('button',{name:'Guest',exact:true});
  const breadcrumb=await page.locator('#breadcrumb').textContent();
  await guest.click();
  await telegram.waitFor();
  assert.equal(await telegram.locator('svg').count(),1);
  assert.equal(await page.locator('#breadcrumb').textContent(),breadcrumb);
  await page.keyboard.press('Escape');
  await signIn.waitFor({state:'hidden'});
  assert.equal(await guest.evaluate(button=>button===document.activeElement),true);
  const search=async()=>{
    await page.locator('.nav-item[data-view=search]').click();
    await page.locator('#search-input').fill('Search song');
    await page.locator('#resolve-form [type=submit]').click();
  };
  await search();
  await page.locator('#search-results [data-action=like]').click();
  await telegram.waitFor();
  assert.equal(saved.track.length,0);
  // Enter an account with a persisted YouTube favorite; no search is needed.
  user={id:1,name:'Test Listener',username:'listener'};
  saved.track=[{type:'track',source:'youtube',source_id:'Abcdefghijk',title:'Saved YouTube',artist:'Remote Artist',cover:'https://i.ytimg.com/vi/Abcdefghijk/mqdefault.jpg',duration_seconds:123}];
  await page.reload();
  await page.locator('.user-profile').filter({hasText:'Test Listener'}).waitFor();
  await page.locator('[data-action="navigate"][data-view="liked"]').first().click();
  await page.getByText('Saved YouTube',{exact:true}).waitFor();
  await page.locator('.track-text').click();
  await page.waitForFunction(()=>document.querySelector('#player-title').textContent==='Saved YouTube');
  assert.deepEqual(resolveCalls.filter(call=>call.video_id==='Abcdefghijk'),[{video_id:'Abcdefghijk'}]);
  // Failed saves leave the old state and display an error next to the action.
  await search();
  failSave=true;
  const heart=page.locator('#search-results [data-action=like]');
  await heart.click();
  await page.locator('#search-results .favorite-error').waitFor();
  assert.equal(await heart.getAttribute('aria-pressed'),'false');
  failSave=false;
  await heart.click();
  await page.waitForFunction(()=>document.querySelector('#search-results [data-action=like]').getAttribute('aria-pressed')==='true');
  await page.locator('.user-profile').click();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByRole('button',{name:'Guest',exact:true}).waitFor();
  await page.locator('[data-action="navigate"][data-view="liked"]').first().click();
  assert.equal(await page.locator('.track-row').count(),0);
  assert.equal(await page.getByText('Saved YouTube',{exact:true}).count(),0);
  await page.locator('.nav-item[data-view="library"]').click();
  await page.getByRole('heading',{name:'Your Library'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Liked Albums'}).count(),0);
  // The mobile guest control opens the same dialog and Telegram endpoint.
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Guest',exact:true}).click();
  await telegram.waitFor();
  if(process.env.UI_SCREENSHOT_DIR)await page.screenshot({animations:'disabled',path:`${process.env.UI_SCREENSHOT_DIR}/openmusic-mobile.png`});
  await Promise.all([
    page.waitForRequest(request=>new URL(request.url()).pathname==='/api/v1/auth/telegram/start'),
    telegram.click()
  ]);
  assert.deepEqual(errors,[]);
  console.log('Browser account regression passed: guest, restored YouTube/resolver, failed save, retry, logout, mobile.');
  await context.close();
} finally { await browser.close(); }
