import { API_BASE } from './config.js';

export class FavoritesClient {
  constructor(onUnauthorized = () => {}) {
    this.csrf = '';
    this.onUnauthorized = onUnauthorized;
  }
  async request(path, {method = 'GET', body} = {}) {
    let response;
    try {
      response = await fetch(`${API_BASE}/api/v1${path}`, {
        method, credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(15000),
        headers: { ...(body ? {'Content-Type': 'application/json'} : {}),
          ...(method !== 'GET' ? {'X-CSRF-Token': this.csrf} : {}) },
        ...(body ? {body: JSON.stringify(body)} : {})
      });
    } catch {
      throw new Error('Could not reach the server. Your change could not be confirmed.');
    }
    if (response.status === 401) { this.csrf = ''; this.onUnauthorized(); }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error?.message || 'Could not save your change. Try again.');
    }
    return response.status === 204 ? null : response.json();
  }
  async me() {
    const data = await this.request('/auth/me');
    this.csrf = data.csrf_token;
    return data.user;
  }
  async list(type) {
    const items = [];
    let more = true;
    while (more) {
      const page = await this.request(`/likes?type=${type}&limit=100&offset=${items.length}`);
      items.push(...page.items);
      more = page.has_more;
    }
    return items;
  }
  save(type, source, id, metadata) {
    return this.request(`/likes/${type}/${source}/${encodeURIComponent(id)}`, {method: 'PUT', body: metadata});
  }
  remove(type, source, id) {
    return this.request(`/likes/${type}/${source}/${encodeURIComponent(id)}`, {method: 'DELETE'});
  }
  logout() { return this.request('/auth/logout', {method: 'POST'}); }
}

// Never infer a demo identity from a mutable catalog position during normal saves.
export function favoriteIdentity(item) {
  return item.video_id ? ['youtube', item.video_id] : ['demo', item.key];
}
export function favoriteMetadata(item) {
  return {title: item.title, artist: item.artist || '',
    cover: item.video_id ? (item.cover || `https://i.ytimg.com/vi/${item.video_id}/mqdefault.jpg`) : `./assets/${item.art}`,
    duration_seconds: item.duration > 0 ? Math.round(item.duration) : null};
}
export function legacyDemoKeys(value) {
  // Frozen mapping of the original localStorage format, including only recognized demos.
  const original = ['weightless','ocean-drive','midnight-city','in-bloom','slow-motion','somewhere-else',
    'first-light','saltwater','neon-memories','golden','warm-sand','between-the-trees'];
  return Array.isArray(value) ? [...new Set(value.filter(id => Number.isInteger(id) && id >= 0 && id < original.length).map(id => original[id]))] : [];
}
