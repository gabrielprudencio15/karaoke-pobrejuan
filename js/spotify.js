/* =====================================================================
   KARAOKÊ — Spotify (login PKCE, busca, playlist e Web Playback SDK)
   Usado por karaoke.html (modo Spotify) e spotify-teste.html (teste).
   Precisa de KARAOKE_CONFIG.SPOTIFY_CLIENT_ID (app criado no painel do Spotify).
   Nenhum segredo aqui: o PKCE não usa client secret.
   ===================================================================== */
(function () {
  const C = window.KARAOKE_CONFIG || {};
  const SCOPES = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state playlist-read-private playlist-read-collaborative';
  const TK = 'ksp_tok', VER = 'ksp_ver', ST = 'ksp_state';
  const redirectUri = () => location.origin + location.pathname;
  const ls = { get: k => { try { return localStorage.getItem(k) } catch (e) { return null } }, set: (k, v) => { try { localStorage.setItem(k, v) } catch (e) {} }, del: k => { try { localStorage.removeItem(k) } catch (e) {} } };
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const rnd = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a).slice(0, n) };

  let tok = null; try { tok = JSON.parse(ls.get(TK) || 'null') } catch (e) {}
  const saveTok = t => { tok = t; t ? ls.set(TK, JSON.stringify(t)) : ls.del(TK) };

  async function tokenRequest(body) {
    const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: KSP.clientId(), ...body }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error_description || d.error || ('HTTP ' + r.status));
    saveTok({ access: d.access_token, refresh: d.refresh_token || tok?.refresh, exp: Date.now() + (d.expires_in - 60) * 1000 });
    return tok.access;
  }

  const KSP = {
    // Client ID e playlist: o que foi digitado no telão (salvo neste notebook) ou, se vazio, o do karaoke-store.js
    clientId: () => (ls.get('ksp_cid') || C.SPOTIFY_CLIENT_ID || '').trim(),
    playlistCfg: () => (ls.get('ksp_pl') || C.SPOTIFY_PLAYLIST_ID || '').trim(),
    setConfig(cid, pl) { const old = KSP.clientId(); cid ? ls.set('ksp_cid', cid.trim()) : ls.del('ksp_cid'); pl ? ls.set('ksp_pl', pl.trim()) : ls.del('ksp_pl'); if (KSP.clientId() !== old) saveTok(null) },
    get configured() { return !!KSP.clientId() },
    redirectUri,
    scopes: SCOPES,
    isLogged: () => !!tok?.refresh,
    async login() {
      if (!KSP.clientId()) throw new Error('Falta o Client ID do Spotify');
      const ver = rnd(64), state = rnd(16);
      ls.set(VER, ver); ls.set(ST, state);
      const ch = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ver)));
      location.href = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({ response_type: 'code', client_id: KSP.clientId(), scope: SCOPES, code_challenge_method: 'S256', code_challenge: ch, redirect_uri: redirectUri(), state });
    },
    // chamar no carregamento da página: troca o ?code= pelo token. Devolve true se acabou de logar
    async handleRedirect() {
      const q = new URLSearchParams(location.search), code = q.get('code'), err = q.get('error');
      if (!code && !err) return false;
      history.replaceState(null, '', redirectUri());
      if (err) throw new Error('Spotify recusou o login: ' + err);
      if (q.get('state') !== ls.get(ST)) throw new Error('Login do Spotify inválido (state). Tente de novo.');
      await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), code_verifier: ls.get(VER) || '' });
      ls.del(VER); ls.del(ST);
      return true;
    },
    logout() { saveTok(null) },
    async token() {
      if (!tok?.refresh) throw new Error('Spotify não conectado');
      if (Date.now() < tok.exp) return tok.access;
      return tokenRequest({ grant_type: 'refresh_token', refresh_token: tok.refresh });
    },
    async api(path, opt = {}) {
      for (let tries = 0; ; tries++) {
        const r = await fetch('https://api.spotify.com/v1' + path, { ...opt, headers: { Authorization: 'Bearer ' + await KSP.token(), ...(opt.body ? { 'Content-Type': 'application/json' } : {}), ...(opt.headers || {}) } });
        if (r.status === 401 && tries === 0) { tok.exp = 0; continue }
        if (r.status === 429 && tries < 2) { await new Promise(s => setTimeout(s, 1000 * (+r.headers.get('Retry-After') || 2))); continue }
        if (r.status === 204) return null;
        const d = await r.json().catch(() => null);
        if (!r.ok) { const e = new Error((d?.error?.message || d?.reason || 'erro') + ' (HTTP ' + r.status + ')'); e.status = r.status; throw e }
        return d;
      }
    },
    me: () => KSP.api('/me'),

    /* ---------- catálogo ---------- */
    isKaraoke: t => /karaok|instrumental|originally performed by/i.test([t.name, t.album?.name, ...(t.artists || []).map(a => a.name)].join(' | ')),
    // tira "(Karaoke Version)", "- Originally Performed by X" etc. e acha o artista original
    clean(t) {
      const name = t.name || '', album = t.album?.name || '', spArtist = (t.artists || []).map(a => a.name).join(', ');
      // artista original escrito no nome/álbum ("Originally Performed By X", "In the Style of X", "No Estilo de X", "Style X"...)
      const re = /(?:originally performed by|in the style of|style of|as made famous by|made famous by|as made popular by|made popular by|as popularized by|popularized by|no estilo de|ao estilo de|estilo de|popularizad[ao] por|\(style)\s+([^()\[\]\-–|]+?)(?=\s*(?:[()\[\]\-–|]|karaok|instrumental|version|vers[aã]o|$))/i;
      const m = name.match(re) || album.match(re);
      const KW = 'karaok|instrumental|originally|style|estilo|made famous|made popular|popularized|version|vers[aã]o|playback|backing|demonstration|lead vocal';
      let title = name.replace(new RegExp('\\s*[(\\[][^)\\]]*(' + KW + ')[^)\\]]*[)\\]]', 'ig'), '')
        .replace(new RegExp('\\s+[-–]\\s+.*(' + KW + ').*$', 'i'), '')
        .replace(/^\s*karaok[eê]\s*[-–:]\s*/i, '')            // "Karaoke - Evidencias"
        .replace(/\s*[-–]\s*$/, '').trim();                    // traço sobrando no fim
      const labelArtist = /karaok|sing2|ameritz|backing|instrumental|playback|zzang|sunfly|hits|hitmaker|hit crew|stingray|party tyme|xexe band/i.test(spArtist);
      const artist = m ? m[1].trim() : (labelArtist ? '' : spArtist);
      // versão de demonstração/guia: tem a voz do cantor gravada
      const vocal = /demonstration|lead vocal|guide vocal|with vocals|com voz/i.test(name);
      return { title: title || name, artist, spArtist, vocal };
    },
    async search(q) {
      const out = new Map();
      const run = async (qq, offset) => {
        const d = await KSP.api('/search?' + new URLSearchParams({ q: qq, type: 'track', limit: 10, offset }));
        (d?.tracks?.items || []).forEach(t => { if (t && KSP.isKaraoke(t)) out.set(t.id, t) });
      };
      // Development Mode: máx. 10 por página, então pagina
      // as 4 páginas ao mesmo tempo (bem mais rápido); a ordem dos resultados segue a das páginas
      const pages = await Promise.allSettled([[q + ' karaoke', 0], [q + ' karaoke', 10], [q + ' karaoke', 20], [q + ' instrumental', 0]].map(([qq, off]) => KSP.api('/search?' + new URLSearchParams({ q: qq, type: 'track', limit: 10, offset: off }))));
      if (pages.every(p => p.status === 'rejected')) throw pages[0].reason;
      pages.forEach(p => { if (p.status === 'fulfilled') (p.value?.tracks?.items || []).forEach(t => { if (t && KSP.isKaraoke(t) && !out.has(t.id)) out.set(t.id, t) }) });
      return [...out.values()];
    },
    playlistId: v => (String(v || '').match(/playlist[/:]([A-Za-z0-9]+)/) || [])[1] || String(v || '').trim(),
    async playlist(id) {
      id = KSP.playlistId(id);
      const meta = await KSP.api('/playlists/' + encodeURIComponent(id) + '?fields=name,owner(id,display_name)');
      const items = [];
      for (let off = 0; off < 2000; off += 50) {
        const d = await KSP.api('/playlists/' + encodeURIComponent(id) + '/items?limit=50&offset=' + off);
        (d?.items || []).forEach(x => { const t = x.item || x.track; if (t && t.type === 'track' && !t.is_local && t.id) items.push(t) });
        if (!d?.next) break;
      }
      return { name: meta?.name, owner: meta?.owner?.display_name || meta?.owner?.id, items };
    },

    /* ---------- player (Web Playback SDK) ---------- */
    player: null, deviceId: null,
    st: { paused: true, pos: 0, ts: 0, dur: 0, uri: '' },
    loadSdk() {
      if (window.Spotify) return Promise.resolve();
      return new Promise((res, rej) => {
        window.onSpotifyWebPlaybackSDKReady = res;
        const s = document.createElement('script'); s.src = 'https://sdk.scdn.co/spotify-player.js'; s.onerror = () => rej(new Error('Não carregou o player do Spotify (internet?)'));
        document.head.appendChild(s);
      });
    },
    // onState(st) é chamado a cada mudança (play, pause, fim, troca de faixa)
    async initPlayer(name, onState, onError) {
      await KSP.loadSdk();
      if (KSP.player) return KSP.deviceId;
      const p = new Spotify.Player({ name, getOAuthToken: cb => KSP.token().then(cb).catch(e => onError && onError(e)), volume: 0.8 });
      KSP.player = p;
      ['initialization_error', 'authentication_error', 'account_error', 'playback_error'].forEach(ev => p.addListener(ev, ({ message }) => onError && onError(new Error(ev + ': ' + message))));
      p.addListener('player_state_changed', s => {
        if (!s) return;
        const cur = s.track_window?.current_track;
        Object.assign(KSP.st, { paused: s.paused, pos: s.position / 1000, ts: performance.now(), dur: (s.duration || cur?.duration_ms || 0) / 1000, uri: cur?.uri || '' });
        onState && onState(KSP.st, s);
      });
      const id = await new Promise((res, rej) => {
        p.addListener('ready', ({ device_id }) => res(device_id));
        p.addListener('not_ready', () => {});
        p.connect().then(ok => { if (!ok) rej(new Error('O player do Spotify não conectou')) });
        setTimeout(() => rej(new Error('O player do Spotify não respondeu (conta Premium? internet?)')), 15000);
      });
      KSP.deviceId = id; return id;
    },
    activate() { try { KSP.player?.activateElement?.() } catch (e) {} },
    pos() { const s = KSP.st; return s.paused ? s.pos : Math.min(s.dur || 1e9, s.pos + (performance.now() - s.ts) / 1000) },
    async playUri(uri, posSec = 0) {
      Object.assign(KSP.st, { uri, pos: posSec, ts: performance.now(), paused: false });
      await KSP.api('/me/player/play?device_id=' + KSP.deviceId, { method: 'PUT', body: JSON.stringify({ uris: [uri], position_ms: Math.round(posSec * 1000) }) });
    },
    pause() { KSP.st.pos = KSP.pos(); KSP.st.paused = true; return KSP.player?.pause() },
    resume() { KSP.st.ts = performance.now(); KSP.st.paused = false; return KSP.player?.resume() },
    seek(sec) { KSP.st.pos = Math.max(0, sec); KSP.st.ts = performance.now(); return KSP.player?.seek(Math.round(KSP.st.pos * 1000)) },
    setVolume(v) { return KSP.player?.setVolume(Math.max(0, Math.min(1, v))) },
    async sync() { const s = await KSP.player?.getCurrentState(); if (s) Object.assign(KSP.st, { paused: s.paused, pos: s.position / 1000, ts: performance.now(), dur: s.duration / 1000 }) }
  };
  window.KSP = KSP;
})();
