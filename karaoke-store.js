/* =====================================================================
   KARAOKÊ — CONFIGURAÇÃO DO EVENTO + CAMADA DE DADOS
   ---------------------------------------------------------------------
   Sem SUPABASE_URL/KEY roda em MODO LOCAL: telão e celular.html
   conversam entre abas do MESMO navegador (bom para testar).
   Para ficar online: preencha SUPABASE_URL e SUPABASE_ANON_KEY,
   rode o supabase.sql no projeto e publique os arquivos.
   ===================================================================== */
window.KARAOKE_CONFIG = {
  EVENTO: 'Festa de Fim de Ano 2026',
  MARCA: 'Pobre Juan',
  LOGO_URL: 'logo.svg',         // logo branco do site oficial (arquivo na mesma pasta). Vazio = nome em texto
  UNIDADES: [                   // cores da marca: cobre, dourado e um azul claro derivado do azul-marinho
    { id: 'PCG',  nome: 'PCG',  cor: '#d67e59' },
    { id: 'POA',  nome: 'POA',  cor: '#b09763' },
    { id: 'CBNC', nome: 'CBNC', cor: '#6fa3cf' }
  ],
  LINK_CELULAR: 'https://gabrielprudencio15.github.io/karaoke-pobrejuan/', // site publicado (vira o QR Code do telão)
  SUPABASE_URL: 'https://dmqxuzruxnyaezkmmdpt.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_Gb5Hz3S8QjoQkDGLcHji8g_g4i9gH0u', // chave "publishable"/anon (NUNCA a service_role / secret)
  TELAO_EMAIL: 'karaoke-telao@pobrejuan.com.br', // usuário do telão no Supabase (a senha você cria lá; nunca coloque a senha aqui)

  // Spotify (opcional). Client ID do app criado em developer.spotify.com (não é segredo).
  // Playlist: tem que ser SUA (ou colaborativa) — o Spotify só libera as faixas de playlist própria.
  // Aceita o ID ou o link inteiro da playlist.
  SPOTIFY_CLIENT_ID: 'ca9adb5c719f4cfdbca3df67f9b25e21',
  SPOTIFY_PLAYLIST_ID: '',

  // Só a máquina conta ponto. Aplausos e votos aparecem na tela só para animar (peso 0).
  // Se o microfone falhar, a pessoa fica com a nota do público (ou dos aplausos).
  // Para voltar a misturar: { maquina: 0.60, publico: 0.25, aplausos: 0.15 }
  PESOS: { maquina: 1, publico: 0, aplausos: 0 },
  SEGUNDOS_VOTACAO: 25,         // 0 desliga a votação do público
  SEGUNDOS_APLAUSO: 6,          // 0 desliga o medidor de aplausos
  APLAUSO_DB_MIN: -50,          // silêncio do salão (ajuste no ensaio)
  APLAUSO_DB_MAX: -12,          // gritaria máxima (ajuste no ensaio)
  RANKING_UNIDADES: 'soma',     // 'soma' (premia participação) ou 'media' (média das notas)
  MAX_NA_FILA_POR_CELULAR: 2,

  // Frases da nota final: o telão sorteia uma da faixa da nota (min = nota mínima da faixa)
  FRASES: [
    { min: 95, frases: ['DOMINAMOS O FOGO! 🔥', 'Corte nobre: nota máxima da casa!', 'Ponto perfeito! 👨‍🍳'] },
    { min: 85, frases: ['Saiu da brasa no ponto certo! 🔥', 'Isso é Pobre Juan!', 'Brasa viva no palco!'] },
    { min: 70, frases: ['Ao ponto! Mandou bem 👏', 'Tá cheirando a churrasco bom!', 'Quase pronto pro rodízio de elogios'] },
    { min: 55, frases: ['Mal passado, mas com sabor! 😄', 'Ainda tá na brasa... bora de novo?', 'Faltou só o sal grosso'] },
    { min: 0,  frases: ['Volta pra grelha e tenta de novo 😂', 'O importante é a resenha!', 'Coragem nota 1000! 🎤'] }
  ],
  FRASE_RECORDE: '🏆 NOVO RECORDE! O fogo é seu!',
  FRASE_BATALHA: '{nome} levou a picanha! 🔥',   // {nome} = quem venceu
  FRASE_EMPATE: 'EMPATE! Divide a picanha 🤝'
};

(function () {
  const C = window.KARAOKE_CONFIG;
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const now = () => new Date().toISOString();
  const ALL = ['catalog', 'queue', 'performances', 'votes', 'stage'];
  const chunks = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

  /* ---------- modo local: localStorage + BroadcastChannel ---------- */
  class LocalStore {
    constructor() {
      this.mode = 'local';
      this.status = 'local';
      this.subs = [];
      this.ch = ('BroadcastChannel' in window) ? new BroadcastChannel('karaoke-store') : null;
      if (this.ch) this.ch.onmessage = e => this._emit(e.data);
      window.addEventListener('storage', e => {
        if (e.key && e.key.startsWith('ks:')) this._emit({ table: e.key.slice(3), type: '*' });
      });
    }
    _read(t) { try { return JSON.parse(localStorage.getItem('ks:' + t) || '[]'); } catch (e) { return []; } }
    _write(t, rows) { localStorage.setItem('ks:' + t, JSON.stringify(rows)); }
    _notify(ev) { this._emit(ev); if (this.ch) this.ch.postMessage(ev); }
    _emit(ev) {
      this.subs.forEach(s => {
        if (ev.table !== '*' && !s.tables.includes(ev.table)) return;
        try { s.fn(ev); } catch (e) { console.error(e); }
      });
    }

    async list(t) { return this._read(t); }
    async insert(t, row) {
      const rows = this._read(t);
      const r = { id: uid(), created_at: now(), ...row };
      if (t === 'votes' && rows.some(v => v.queue_id === r.queue_id && v.device_id === r.device_id)) throw new Error('Você já votou');
      rows.push(r); this._write(t, rows); this._notify({ table: t, type: 'INSERT', row: r }); return r;
    }
    async upsert(t, list) {
      const rows = this._read(t);
      for (const r of list) {
        const i = rows.findIndex(x => x.id === r.id);
        if (i >= 0) rows[i] = { ...rows[i], ...r }; else rows.push({ created_at: now(), ...r });
      }
      this._write(t, rows); this._notify({ table: t, type: 'UPSERT' });
    }
    async update(t, id, patch) {
      const rows = this._read(t); const i = rows.findIndex(x => x.id === id); if (i < 0) return null;
      rows[i] = { ...rows[i], ...patch }; this._write(t, rows); this._notify({ table: t, type: 'UPDATE', row: rows[i] }); return rows[i];
    }
    async remove(t, id) { this._write(t, this._read(t).filter(x => x.id !== id)); this._notify({ table: t, type: 'DELETE', row: { id } }); }
    async removeMany(t, ids) { const s = new Set(ids); this._write(t, this._read(t).filter(x => !s.has(x.id))); this._notify({ table: t, type: 'DELETE' }); }
    async clear(t) { this._write(t, []); this._notify({ table: t, type: 'DELETE' }); }
    on(fn, tables = ALL) { const s = { fn, tables }; this.subs.push(s); return () => { this.subs = this.subs.filter(x => x !== s); }; }
    onStatus(fn) { fn(this.status); }
    // no modo local, o "canal" liga as abas deste mesmo navegador (útil para testar)
    bus(topic, onMsg) {
      if (!('BroadcastChannel' in window)) return { send: () => {} };
      const bc = new BroadcastChannel('kbus-' + topic);
      bc.onmessage = e => { try { onMsg(e.data.event, e.data.payload || {}); } catch (err) { console.error(err); } };
      return { send: (event, payload) => bc.postMessage({ event, payload }) };
    }
  }

  /* ---------- modo online: Supabase (tabelas karaoke_*) ---------- */
  class SupabaseStore {
    constructor(url, key) {
      this.mode = 'supabase';
      this.status = 'connecting';
      this.statusSubs = [];
      this.nCh = 0;
      // A sessão só existe no telão (login com a senha do telão). Celulares ficam anônimos.
      this.sb = window.supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'karaoke-telao-auth' } });
    }
    // ---- login do telão (usuário criado no Supabase: Authentication > Users) ----
    async isAdmin() { try { const { data } = await this.sb.auth.getSession(); return !!data.session; } catch (e) { return false; } }
    async signIn(password) {
      const { error } = await this.sb.auth.signInWithPassword({ email: C.TELAO_EMAIL, password });
      if (error) throw error;
    }
    async signOut() { await this.sb.auth.signOut(); }
    T(t) { return 'karaoke_' + t; }
    _setStatus(s) { if (s === this.status) return; this.status = s; this.statusSubs.forEach(f => { try { f(s); } catch (e) {} }); }
    onStatus(fn) { this.statusSubs.push(fn); fn(this.status); }

    // O Supabase devolve no máximo 1000 linhas por consulta: busca em páginas.
    async list(t) {
      const out = [], PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await this.sb.from(this.T(t)).select('*')
          .order('created_at', { ascending: true }).order('id', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        out.push(...(data || []));
        if (!data || data.length < PAGE) break;
      }
      return out;
    }
    async insert(t, row) {
      const { data, error } = await this.sb.from(this.T(t)).insert(row).select().single();
      if (error) throw (error.code === '23505' ? new Error('Você já votou') : error);
      return data;
    }
    async upsert(t, list) {
      for (const part of chunks(list, 500)) {
        const { error } = await this.sb.from(this.T(t)).upsert(part);
        if (error) throw error;
      }
    }
    async update(t, id, patch) {
      const { data, error } = await this.sb.from(this.T(t)).update(patch).eq('id', id).select().maybeSingle();
      if (error) throw error; return data;
    }
    async remove(t, id) { const { error } = await this.sb.from(this.T(t)).delete().eq('id', id); if (error) throw error; }
    async removeMany(t, ids) {
      for (const part of chunks(ids, 200)) {
        const { error } = await this.sb.from(this.T(t)).delete().in('id', part);
        if (error) throw error;
      }
    }
    async clear(t) { const { error } = await this.sb.from(this.T(t)).delete().neq('id', '__nunca__'); if (error) throw error; }

    // Assina só as tabelas pedidas (o celular não precisa receber os votos de todo mundo).
    // Ao reconectar (celular que bloqueou a tela, Wi-Fi que caiu), avisa com table '*' para recarregar tudo.
    on(fn, tables = ALL) {
      const ch = this.sb.channel('karaoke-' + (++this.nCh) + '-' + uid().slice(0, 8));
      tables.forEach(t => ch.on('postgres_changes', { event: '*', schema: 'public', table: this.T(t) }, p => {
        const row = (p.new && Object.keys(p.new).length) ? p.new : p.old;
        try { fn({ table: t, type: p.eventType, row }); } catch (e) { console.error(e); }
      }));
      let first = true;
      ch.subscribe((st, err) => {
        if (st === 'SUBSCRIBED') {
          this._setStatus('online');
          if (!first) { try { fn({ table: '*', type: '*' }); } catch (e) { console.error(e); } }
          first = false;
        } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') {
          if (err) console.warn('Realtime:', st, err);
          this._setStatus('offline');
        }
      });
      return () => this.sb.removeChannel(ch);
    }
    // Mensagens rápidas entre celular e telão (sem gravar no banco): busca do Spotify pelo celular.
    bus(topic, onMsg) {
      const ch = this.sb.channel('kbus-' + topic, { config: { broadcast: { self: false } } });
      let ready = false; const pending = [];
      ch.on('broadcast', { event: '*' }, m => { try { onMsg(m.event, m.payload || {}); } catch (e) { console.error(e); } });
      ch.subscribe(st => { if (st === 'SUBSCRIBED') { ready = true; pending.splice(0).forEach(m => ch.send(m)); } });
      return { send: (event, payload) => { const m = { type: 'broadcast', event, payload }; ready ? ch.send(m) : pending.push(m); } };
    }
  }

  let store;
  const wantsOnline = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY);
  let forcedOffline = false;
  try { forcedOffline = localStorage.getItem('k_offline') === '1'; } catch (e) {}
  if (wantsOnline && forcedOffline) {
    store = new LocalStore(); // "modo sem internet" ligado no telão (botão na barra lateral)
  } else if (wantsOnline && window.supabase) {
    try { store = new SupabaseStore(C.SUPABASE_URL.replace(/\/+$/, ''), C.SUPABASE_ANON_KEY); }
    catch (e) { console.error('Supabase falhou, usando modo local', e); store = new LocalStore(); }
  } else {
    if (wantsOnline) console.error('Biblioteca do Supabase não carregou (sem internet?). Usando modo local.');
    store = new LocalStore();
  }
  store.wantsOnline = wantsOnline;
  if (!store.isAdmin) { store.isAdmin = async () => true; store.signIn = async () => {}; store.signOut = async () => {}; }

  // Sugestões: cada envio tem um "batch"; reenviar cria um batch novo e só o último de cada celular conta.
  store.latestSugestoes = rows => {
    const last = new Map();
    for (const r of rows) { const l = last.get(r.device_id); if (!l || String(r.created_at) > String(l.created_at)) last.set(r.device_id, r); }
    return rows.filter(r => (r.batch || '') === (last.get(r.device_id).batch || ''));
  };
  store.forcedOffline = wantsOnline && forcedOffline;

  store.deviceId = () => {
    let d = localStorage.getItem('k_device');
    if (!d) { d = uid(); localStorage.setItem('k_device', d); }
    return d;
  };
  window.KStore = store;
})();
