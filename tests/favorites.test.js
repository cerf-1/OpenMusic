import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FavoritesClient, favoriteIdentity, favoriteMetadata, legacyDemoKeys } from '../dist/favorites.js';

test('favorite requests use credentials and session CSRF, never client user_id', async()=>{
  const requests=[];
  globalThis.fetch=async (url,options)=>{
    requests.push({url,options});
    return {ok:true,status:200,json:async()=>({user:{id:1},csrf_token:'csrf'})};
  };
  const client=new FavoritesClient();
  assert.deepEqual(await client.me(),{id:1});
  await client.save('track','youtube','Abc_def-123',{title:'Song',artist:'Artist'});
  const request=requests[1];
  assert.equal(request.options.credentials,'include');
  assert.equal(request.options.headers['X-CSRF-Token'],'csrf');
  assert.equal(request.options.cache,'no-store');
  assert.equal(request.url,'/api/v1/likes/track/youtube/Abc_def-123');
  assert.deepEqual(JSON.parse(request.options.body),{title:'Song',artist:'Artist'});
});

test('loads every page in server order',async()=>{
  const urls=[];
  globalThis.fetch=async url=>{
    urls.push(url);
    return {ok:true,status:200,json:async()=>urls.length===1?{items:[{id:3},{id:2}],has_more:true}:{items:[{id:1}],has_more:false}};
  };
  const result=await new FavoritesClient().list('track');
  assert.deepEqual(result,[{id:3},{id:2},{id:1}]);
  assert.match(urls[1],/offset=2$/);
});

test('unauthorized responses clear CSRF and notify the account once',async()=>{
  let cleared=0;
  globalThis.fetch=async()=>({ok:false,status:401,json:async()=>({error:{message:'Expired'}})});
  const client=new FavoritesClient(()=>cleared++);client.csrf='old';
  await assert.rejects(client.list('album'),/Expired/);
  assert.equal(cleared,1);assert.equal(client.csrf,'');
});

test('database and network failures reject instead of confirming a save',async()=>{
  const client=new FavoritesClient();
  globalThis.fetch=async()=>({ok:false,status:503,json:async()=>({error:{message:'DB unavailable'}})});
  await assert.rejects(client.save('track','demo','weightless',{}),/DB unavailable/);
  globalThis.fetch=async()=>{throw new Error('offline');};
  await assert.rejects(client.remove('track','demo','weightless'),/Could not reach the server/);
  globalThis.fetch=async()=>({ok:true,status:204});
  assert.equal(await client.logout(),null);
});

test('stable demo keys and case-sensitive video IDs never include transient audio',()=>{
  assert.deepEqual(favoriteIdentity({id:999,key:'weightless'}),['demo','weightless']);
  const item={video_id:'Abc_def-123',title:'Song',artist:'Artist',duration:123.5,cover:'https://image.example/art',stream_url:'secret',audio_path:'/temporary'};
  assert.deepEqual(favoriteIdentity(item),['youtube','Abc_def-123']);
  assert.deepEqual(favoriteMetadata(item),{title:'Song',artist:'Artist',duration_seconds:124,cover:'https://image.example/art'});
  assert.deepEqual(favoriteMetadata({title:'Afterglow',artist:'Sora',cover:'AFTER<br>GLOW',art:'hero.png'}),
    {title:'Afterglow',artist:'Sora',cover:'./assets/hero.png',duration_seconds:null});
});

test('legacy import recognizes only the frozen demo catalog and deduplicates',()=>{
  assert.deepEqual(legacyDemoKeys([0,0,11,12,-1,'1',null,1.5]),['weightless','between-the-trees']);
  assert.deepEqual(legacyDemoKeys({0:true}),[]);
});
