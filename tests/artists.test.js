import assert from 'node:assert/strict';
import { test } from 'node:test';
import { artistKey, artistProfile, catalogArtists } from '../dist/artists.js';
const tracks=[
  {id:0,artist:'Sora',art:'hero.png',genre:'Ambient'},
  {id:1,artist:'Sora',art:'hero.png',genre:'Ambient'},
  {id:2,artist:'Noa & The Waves',art:'cover-coast.jpg'},
  {id:3,artist:'Remote <Artist>',video_id:'abcdefghijk',cover:'https://example.com/art.jpg'},
  {id:4,artist:'Other',video_id:'lmnopqrstuv'},
];
const albums=[{id:0,tracks:[0,2]},{id:1,tracks:[2]}];
test('artist identity preserves bands and matches complete metadata names',()=>{
  assert.equal(artistKey(' Noa  & The Waves '),'noa & the waves');
  assert.deepEqual(artistProfile(' SORA ',tracks,albums).tracks,[0,1]);
  assert.equal(artistProfile('Waves',tracks,albums),null);
  assert.equal(artistProfile('',tracks,albums),null);
});
test('artist collections feature their songs without leaking other artists into playback',()=>{
  const profile=artistProfile('Sora',tracks,albums);
  assert.deepEqual(profile.collections,[0]);
  assert.deepEqual(profile.tracks,[0,1]);
  assert.equal(profile.local,true);
  assert.equal(profile.cover,'./assets/hero.png');
});
test('remote artists use available track artwork and have no invented collections',()=>{
  const profile=artistProfile('remote <artist>',tracks,albums);
  assert.deepEqual(profile.tracks,[3]);
  assert.deepEqual(profile.collections,[]);
  assert.equal(profile.local,false);
  assert.equal(profile.cover,'https://example.com/art.jpg');
  assert.deepEqual(catalogArtists(tracks,albums).map(a=>a.name),['Sora','Noa & The Waves']);
});
