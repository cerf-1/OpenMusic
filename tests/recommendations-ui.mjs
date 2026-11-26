// Run against npm start or the backend. API and media are controlled by this test.
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser=await chromium.launch({
  executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome', headless:true
});
const origin=process.env.UI_TEST_ORIGIN || 'http://127.0.0.1:4173';
const makeTrack=(video_id,title,artist)=>({video_id,title,artist,duration_seconds:180,cover_link:'/assets/hero.png'});
const a=makeTrack('A1234567890','Track A','Artist A');
const b=makeTrack('B1234567890','Track B','Artist B');
const manual=makeTrack('M1234567890','Manual Track','Manual Artist');
const old=makeTrack('O1234567890','Old Recommendation','Old Artist');
const rec1={...makeTrack('R1234567890','Similar One','Similar Artist'),album:{id:'MPREb_test',title:'A Release'}};
const rec2={...rec1,video_id:'R1234567891',title:'Similar Two'};
const rec3=makeTrack('R1234567892','Similar Three','Other Artist');

try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[],resolveCalls=[],recommendationCalls=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({a,b})=>{
    if(!localStorage.getItem('openmusic-playlists')){
      localStorage.setItem('openmusic-playlists',JSON.stringify([{name:'My Mix',tracks:[0,b,8,a]}]));
    }
    window.Audio=class extends EventTarget {
      constructor(){super();this.paused=true;this.currentTime=0;this.ended=false;window.testAudio=this;}
      async play(){this.ended=false;this.paused=false;this.dispatchEvent(new Event('playing'));}
      pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}
      load(){}
      finish(){this.ended=true;this.paused=true;this.dispatchEvent(new Event('ended'));}
    };
  },{a,b});
  let user=null,likes=[{source:'demo',source_id:'weightless',title:'Weightless'}];
  let releaseA,releaseB,failSave=false;
  const aResponse=new Promise(resolve=>{releaseA=resolve;});
  const bResponse=new Promise(resolve=>{releaseB=resolve;});
  await page.route('**/api/v1/**',async route=>{
    const request=route.request(), url=new URL(request.url());
    const path=url.pathname;
    if(path.endsWith('/auth/me'))return route.fulfill(user
      ? {json:{user,csrf_token:'test'}} : {status:401,json:{}});
    if(path.endsWith('/auth/logout')){user=null;return route.fulfill({status:204});}
    if(path.endsWith('/likes'))return route.fulfill({json:{items:likes,has_more:false}});
    if(path.includes('/likes/track/youtube/')){
      const id=path.split('/').at(-1);
      assert.equal(request.headers()['x-csrf-token'],'test');
      if(failSave)return route.fulfill({status:503,json:{error:{message:'Save unavailable'}}});
      if(request.method()==='DELETE'){
        likes=likes.filter(item=>item.source_id!==id);
        return route.fulfill({status:204});
      }
      likes.unshift({...request.postDataJSON(),source:'youtube',source_id:id});
      return route.fulfill({json:{saved:true}});
    }
    if(path.endsWith('/search'))return route.fulfill({json:{items:[a,b,manual],page:1,has_more:false}});
    if(path.endsWith('/resolve')){
      const {video_id}=request.postDataJSON();
      resolveCalls.push(video_id);
      return route.fulfill({json:{stream_url:`${origin}/audio/${video_id}`,duration_seconds:180}});
    }
    if(path.endsWith('/artist'))return route.fulfill({json:{name:'Similar Artist',header_image:'/assets/hero.png'}});
    if(path.endsWith('/recommendations')){
      const {video_id}=request.postDataJSON();
      assert.deepEqual(request.postDataJSON(),{video_id});
      recommendationCalls.push(video_id);
      if(video_id===a.video_id)await aResponse;
      if(video_id===b.video_id)await bResponse;
      if(video_id===manual.video_id)return route.fulfill({status:504,json:{}});
      const items=video_id===a.video_id?[old]:video_id===b.video_id?[rec1,rec2,rec3]:[];
      await route.fulfill({json:{items}}).catch(()=>{});
      return;
    }
    return route.abort();
  });
  const nav=view=>page.locator(`.nav-item[data-view="${view}"]`).click();
  const liked=()=>page.locator('.collection-nav [data-view=liked]').click();
  const row=(selector,title)=>page.locator(`${selector} .track-row`).filter({hasText:title});
  const search=async()=>{
    await nav('search');
    await page.locator('#search-input').fill('Tracks');
    const submit=page.locator('#resolve-form [type=submit]');
    if(await submit.isEnabled())await submit.click();
    await row('#search-results',a.title).waitFor();
  };
  const nowPlaying=title=>page.waitForFunction(title=>
    document.querySelector('#player-title').textContent===title && document.body.classList.contains('is-playing'),title);
  const queue=()=>page.locator('.queue-panel .track-title').allTextContents();
  const openQueue=()=>page.locator('.player .queue-button').click();
  const close=()=>page.keyboard.press('Escape');
  const count=(selector,n)=>page.waitForFunction(([selector,n])=>document.querySelectorAll(selector).length===n,[selector,n]);

  await page.goto(origin);
  assert.equal(await page.locator('#player-title').textContent(),'No track selected');
  assert.equal(await page.locator('.album-card,.artist-card,.track-row').count(),0);
  await openQueue();
  assert.deepEqual(await queue(),[]);
  await close();
  await search();
  await row('#search-results',a.title).locator('.track-text').click();
  await nowPlaying(a.title);
  await row('#search-results',manual.title).locator('[data-action=track-menu]').click();
  await page.locator('[data-action=queue-track]').click();
  await row('#search-results',b.title).locator('.track-text').click();
  await nowPlaying(b.title);
  await openQueue();
  assert.deepEqual(await queue(),[b.title,manual.title]);
  await page.evaluate(()=>window.testAudio.finish());
  await nowPlaying(manual.title);
  releaseB();
  await count('.queue-panel .track-row',4);
  releaseA();
  assert.deepEqual(await queue(),[manual.title,rec1.title,rec2.title,rec3.title]);
  await page.evaluate(()=>window.testAudio.finish());
  await nowPlaying(rec1.title);
  assert.deepEqual(recommendationCalls,[a.video_id,b.video_id]);
  assert(resolveCalls.includes(rec1.video_id));
  await close();

  // Quick Search is an independent entry point. A failed recommendation leaves audio intact.
  await page.locator('#quick-search-input').fill('Tracks');
  await page.locator('#quick-search-input').press('Enter');
  await page.getByRole('button',{name:'Play Manual Track by Manual Artist'}).click();
  await nowPlaying(manual.title);
  await openQueue();
  assert.deepEqual(await queue(),[manual.title]);
  await page.evaluate(()=>window.testAudio.finish());
  await page.waitForFunction(()=>!document.body.classList.contains('is-playing'));
  await close();

  user={id:1,name:'Listener'};
  await page.reload();
  await page.locator('.user-profile').filter({hasText:'Listener'}).waitFor();
  await liked();
  assert.equal(await page.locator('.track-row').count(),0);
  await page.getByRole('button',{name:/My Mix/}).click();
  assert.deepEqual(await page.locator('.modal .track-title').allTextContents(),[b.title,a.title]);
  await close();
  await search();
  const heart=title=>row('#search-results',title).locator('[data-action=like]');
  failSave=true;
  await heart(b.title).click();
  await page.getByText('Save unavailable').waitFor();
  assert.equal(await heart(b.title).getAttribute('aria-pressed'),'false');
  failSave=false;
  await heart(b.title).click();
  await page.waitForFunction(()=>document.querySelector('#liked-count').textContent==='1 track');
  await nav('home');
  assert.equal(await page.getByRole('button',{name:'Search music',exact:true}).count(),1);
  await nav('search');
  assert.equal(await page.locator('#search-results .track-title').count(),0);
  assert.deepEqual(recommendationCalls,[a.video_id,b.video_id,manual.video_id]);
  await search();
  await heart(a.title).click();
  await page.waitForFunction(()=>document.querySelector('#liked-count').textContent==='2 tracks');
  await liked();
  assert.deepEqual(recommendationCalls,[a.video_id,b.video_id,manual.video_id]);
  await page.locator('[data-action=play-liked]').click();
  await nowPlaying(a.title);
  await openQueue();
  await count('.queue-panel .track-row',2);
  assert.deepEqual(await queue(),[a.title,old.title]);
  await row('.queue-panel',old.title).locator('.track-text').click();
  await nowPlaying(old.title);
  assert.deepEqual(recommendationCalls,[a.video_id,b.video_id,manual.video_id,a.video_id]);
  await close();
  await page.getByRole('button',{name:/My Mix/}).click();
  await row('.modal',b.title).locator('.track-text').click();
  await nowPlaying(b.title);
  await close();
  await openQueue();
  await count('.queue-panel .track-row',5);
  assert.deepEqual(await queue(),[b.title,a.title,rec1.title,rec2.title,rec3.title]);
  await close();
  await page.locator('.user-profile').click();
  await page.getByRole('button',{name:'Sign out'}).click();
  await page.locator('.user-profile').filter({hasText:'Guest'}).waitFor();
  assert.deepEqual(recommendationCalls,[a.video_id,b.video_id,manual.video_id,a.video_id,b.video_id]);
  assert.deepEqual(errors,[]);
  console.log('Recommendations browser regression passed.');
} finally {
  await browser.close();
}
