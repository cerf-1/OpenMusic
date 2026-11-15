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
  let user=null,failSave=false,failImportKey='',resolveCalls=[];
  const saved={track:[],album:[]};
  const json=(route,status,data)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  await page.route('**/api/v1/**',async route=>{
    const request=route.request(),url=new URL(request.url()),path=url.pathname;
    if(path.endsWith('/auth/me'))return json(route,user?200:401,user?{user,csrf_token:'csrf'}:{error:{message:'Войдите'}});
    if(path.endsWith('/auth/logout')){user=null;return route.fulfill({status:204});}
    if(path.endsWith('/resolve')){resolveCalls.push(request.postDataJSON());return json(route,502,{error:{message:'Test stream unavailable'}});}
    if(path.endsWith('/search'))return json(route,200,{items:[],has_more:false,page:1});
    if(path==='/api/v1/likes')return json(route,200,{items:saved[url.searchParams.get('type')],has_more:false});
    if(path.startsWith('/api/v1/likes/')){
      assert.equal(request.headers()['x-csrf-token'],'csrf');
      const [type,source,source_id]=path.slice('/api/v1/likes/'.length).split('/');
      if(failSave||source_id===failImportKey)return json(route,503,{error:{message:'База данных недоступна'}});
      if(request.method()==='DELETE')saved[type]=saved[type].filter(item=>item.source_id!==source_id);
      else if(!saved[type].some(item=>item.source_id===source_id))saved[type].unshift({type,source,source_id,...request.postDataJSON()});
      return request.method()==='DELETE'?route.fulfill({status:204}):json(route,200,{saved:true});
    }
    return route.abort();
  });
  await page.goto(origin);
  await page.locator('.user-profile').filter({hasText:'Войти через Telegram'}).waitFor();
  await page.locator('[data-action="like"][data-id="0"]').first().click();
  await page.getByRole('heading',{name:'Вход через Telegram'}).waitFor();
  assert.equal(saved.track.length,0);
  await page.locator('[data-action="close-overlay"]').click();
  // Enter an account with a persisted YouTube favorite; no search is needed.
  user={id:1,name:'Test Listener',username:'listener'};
  saved.track=[{type:'track',source:'youtube',source_id:'Abcdefghijk',title:'Saved YouTube',artist:'Remote Artist',cover:'https://i.ytimg.com/vi/Abcdefghijk/mqdefault.jpg',duration_seconds:123}];
  await page.reload();
  await page.locator('.user-profile').filter({hasText:'Test Listener'}).waitFor();
  await page.locator('[data-action="navigate"][data-view="liked"]').first().click();
  await page.getByText('Saved YouTube',{exact:true}).waitFor();
  await page.locator('.track-text').click();
  await page.waitForFunction(()=>document.querySelector('#player-title').textContent==='Saved YouTube');
  assert.deepEqual(resolveCalls,[{video_id:'Abcdefghijk'}]);
  // Failed saves leave the old state and display an error next to the action.
  await page.locator('[data-action="navigate"][data-view="home"]').first().click();
  failSave=true;
  let heart=page.locator('[data-action="like"][data-id="0"]').first();
  await heart.click();
  await page.locator('.track-row[data-track="0"] .favorite-error').waitFor();
  assert.equal(await heart.getAttribute('aria-pressed'),'false');
  failSave=false;
  await heart.click();
  await page.waitForFunction(()=>document.querySelector('[data-action="like"][data-id="0"]').getAttribute('aria-pressed')==='true');
  await page.locator('.hero-save').click();
  await page.waitForFunction(()=>document.querySelector('.hero-save').getAttribute('aria-pressed')==='true');
  assert.equal(saved.album.length,1);assert.equal(saved.track.length,2);
  assert.equal(saved.album[0].cover,'./assets/hero.png');
  if(process.env.UI_SCREENSHOT_DIR)await page.screenshot({animations:'disabled',path:`${process.env.UI_SCREENSHOT_DIR}/openmusic-desktop.png`});
  // Legacy likes are untouched until consent, and survive a partial failure.
  await page.evaluate(()=>localStorage.setItem('openmusic-likes','[0,1,1,999]'));
  await page.reload();
  await page.getByRole('button',{name:'Да, импортировать'}).waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('openmusic-likes')),'[0,1,1,999]');
  failImportKey='ocean-drive';
  await page.getByRole('button',{name:'Да, импортировать'}).click();
  await page.locator('#profile-error').filter({hasText:'База данных недоступна'}).waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('openmusic-likes')),'[0,1,1,999]');
  failImportKey='';
  await page.getByRole('button',{name:'Да, импортировать'}).click();
  await page.waitForFunction(()=>localStorage.getItem('openmusic-likes')===null);
  assert.equal(saved.track.filter(item=>item.source_id==='weightless').length,1);
  assert.equal(saved.track.filter(item=>item.source_id==='ocean-drive').length,1);
  await page.getByRole('button',{name:'Выйти',exact:true}).click();
  await page.locator('.user-profile').filter({hasText:'Войти через Telegram'}).waitFor();
  await page.locator('[data-action="navigate"][data-view="liked"]').first().click();
  assert.equal(await page.locator('.track-row').count(),0);
  assert.equal(await page.getByText('Saved YouTube',{exact:true}).count(),0);
  await page.locator('[data-action="navigate"][data-view="liked-albums"]').first().click();
  assert.equal(await page.locator('.album-card').count(),0);
  // Mobile guest profile remains accessible.
  await page.setViewportSize({width:390,height:844});
  await page.locator('.mobile-avatar').click();
  await page.getByRole('heading',{name:'Вход через Telegram'}).waitFor();
  if(process.env.UI_SCREENSHOT_DIR)await page.screenshot({animations:'disabled',path:`${process.env.UI_SCREENSHOT_DIR}/openmusic-mobile.png`});
  assert.deepEqual(errors,[]);
  console.log('Browser account regression passed: guest, restored YouTube/resolver, failed save, independent album, consent/failed import/retry, logout, mobile.');
  await context.close();
} finally { await browser.close(); }
