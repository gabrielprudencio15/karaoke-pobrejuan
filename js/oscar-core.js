/* =====================================================================
   OSCAR POBRE JUAN — peças comuns (celular, telão e admin)
   Usa o KStore do karaoke-store.js (Supabase ou modo local).
   ===================================================================== */
(function () {
  const C = window.KARAOKE_CONFIG, store = window.KStore;
  const OC = C.OSCAR || {};
  const UNITS = C.UNIDADES;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // chave do nome: sem acento, minúscula, espaços únicos ("João  Silva" = "joao silva")
  const key = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 40);
  const cleanName = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const unitOf = id => UNITS.find(u => u.id === id) || { id, nome: id || '?', cor: '#888' };
  const chip = id => { const u = unitOf(id); return `<span class="chip" style="background:${u.cor}">${esc(u.nome)}</span>`; };
  const initials = n => { const p = cleanName(n).split(' ').filter(Boolean); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); };
  // foto do finalista, ou um círculo com as iniciais na cor da unidade
  const avatar = (name, unit, url, cls = 'av') => url
    ? `<div class="${cls}" style="--c:${unitOf(unit).cor}"><img src="${esc(url)}" alt="" loading="lazy"></div>`
    : `<div class="${cls}" style="--c:${unitOf(unit).cor}"><span>${esc(initials(name))}</span></div>`;

  const CATS = [
    ['mao-de-ouro', 1, '🍳', 'Mão de Ouro', 'Quem cozinha melhor', 'voto', 'Tem gente que cozinha... e tem gente que faz mágica com uma frigideira. Os indicados a Mão de Ouro são...'],
    ['flash', 2, '⚡', 'Flash', 'O mais rápido no salão', 'voto', 'Piscou, já serviu a mesa 12, a 14 e ainda trouxe o troco. Os indicados a Flash são...'],
    ['resenha', 3, '😂', 'Rei/Rainha da Resenha', 'O mais engraçado', 'voto', 'Turno de 8 horas passa em 5 minutos quando essa pessoa está por perto. Os indicados são...'],
    ['salva-patria', 4, '🧯', 'Salva-Pátria', 'Resolve qualquer pepino', 'voto', 'Acabou o gás, caiu o sistema, sumiu a comanda? Calma: chama essa pessoa. Os indicados são...'],
    ['ja-to-indo', 5, '😴', 'Melhor Atuação em "Já tô indo"', 'Sempre "chegando"', 'voto', 'Atuação digna de Hollywood: "tô na esquina", "já tô no ônibus"... Os indicados são...'],
    ['influencer', 6, '📱', 'Influencer da Unidade', 'Vive no celular', 'voto', 'Story do prato, story do salão, story do story. Os indicados a Influencer são...'],
    ['dj-cozinha', 7, '🎵', 'DJ da Cozinha', 'Sempre com música rolando', 'voto', 'A cozinha só funciona com trilha sonora, e essa pessoa é a dona do som. Os indicados são...'],
    ['nota-10', 8, '🍽️', 'Atendimento Nota 10', 'O queridinho dos clientes', 'voto', 'Cliente volta só para ser atendido por essa pessoa. Os indicados a Atendimento Nota 10 são...'],
    ['revelacao', 9, '🌱', 'Revelação do Ano', 'O novato que surpreendeu', 'voto', 'Chegou de mansinho e já virou peça-chave. Os indicados a Revelação do Ano são...'],
    ['parceiro', 10, '🤝', 'Parceiro de Todas', 'Sempre ajuda os colegas', 'voto', 'Antes de você pedir, já está ajudando. Os indicados a Parceiro de Todas são...'],
    ['voz-do-ano', 11, '🎤', 'Voz do Ano', 'A maior nota do karaokê da noite', 'voz_karaoke', 'Essa ninguém votou: quem decidiu foi a máquina do karaokê. As maiores notas da noite foram...'],
    ['unidade-do-ano', 12, '🏢', 'Unidade do Ano', 'Vitórias no Oscar + placar do karaokê', 'unidade', 'Chegou a hora da grande final! Somando as estatuetas de hoje com o placar do karaokê...']
  ].map(([id, ordem, emoji, nome, descricao, tipo, roteiro]) => ({ id, ordem, emoji, nome, descricao, tipo, roteiro, ativa: true }));
  const CFG0 = { id: 'main', fase: 'indicacao', top_n: 4, peso_oscar: 0.5, peso_karaoke: 0.5, discurso_seg: 30, resultado: {}, fecha_em: null, retro: true };

  /* ---------- modo local: mesmas regras das funções do banco ---------- */
  if (store.mode !== 'supabase') {
    const fase = async () => ((await store.list('oscar_config')).find(x => x.id === 'main') || {}).fase;
    store.localRpc = {
      async oscar_indicar(a) {
        if (await fase() !== 'indicacao') return 'fechado';
        const cat = (await store.list('oscar_categorias')).find(c => c.id === a.p_categoria && c.ativa && c.tipo === 'voto');
        if (!cat) return 'categoria';
        const rows = await store.list('oscar_nominations'), old = rows.find(r => r.device_id === a.p_device && r.category_id === a.p_categoria);
        const n = cleanName(a.p_nome);
        if (!n) { if (old) await store.remove('oscar_nominations', old.id); return 'ok'; }
        const k = (a.p_chave || key(n)).toLowerCase().slice(0, 40);
        const row = { nominee_name: n, nominee_key: k, nominee_unit: a.p_unidade, voter_name: a.p_voter_name, voter_unit: a.p_voter_unit, updated_at: new Date().toISOString() };
        if (old) await store.update('oscar_nominations', old.id, { ...row, hidden: old.nominee_key === k && old.nominee_unit === a.p_unidade ? old.hidden : false });
        else await store.insert('oscar_nominations', { device_id: a.p_device, category_id: a.p_categoria, hidden: false, ...row });
        return 'ok';
      },
      async oscar_votar(a) {
        if (await fase() !== 'votacao') return 'fechado';
        if (!(await store.list('oscar_finalists')).some(f => f.id === a.p_finalista && f.category_id === a.p_categoria)) return 'finalista';
        if ((await store.list('oscar_votes')).some(v => v.device_id === a.p_device && v.category_id === a.p_categoria)) return 'ja_votou';
        await store.insert('oscar_votes', { device_id: a.p_device, category_id: a.p_categoria, finalist_id: a.p_finalista, voter_unit: a.p_unit, voter_name: a.p_name || null });
        return 'ok';
      },
      async oscar_nomes() {
        const seen = new Map();
        for (const r of await store.list('oscar_nominations')) { if (r.hidden) continue; const k = r.nominee_key + '|' + r.nominee_unit; if (!seen.has(k)) seen.set(k, { nome: r.nominee_name, chave: r.nominee_key, unidade: r.nominee_unit }); }
        return [...seen.values()];
      },
      async oscar_meus_votos(a) { return (await store.list('oscar_votes')).filter(v => v.device_id === a.p_device).map(v => ({ category_id: v.category_id })); },
      async oscar_foto(a) {
        if ((await store.list('oscar_photos')).filter(p => p.device_id === a.p_device).length >= 30) return 'limite';
        await store.insert('oscar_photos', { device_id: a.p_device, path: a.p_path, url: a.p_url, autor: a.p_autor, unit: a.p_unit, status: 'pending' });
        return 'ok';
      }
    };
  }

  // no modo local, cria a configuração e as categorias na primeira vez
  async function ensureSeed() {
    if (store.mode === 'supabase') return;
    const cfg = await store.list('oscar_config');
    if (!cfg.some(x => x.id === 'main')) await store.upsert('oscar_config', [{ ...CFG0 }]);
    if (!(await store.list('oscar_categorias')).length) await store.upsert('oscar_categorias', CATS.map(c => ({ ...c })));
  }
  async function getConfig() { await ensureSeed(); return { ...CFG0, ...((await store.list('oscar_config')).find(x => x.id === 'main') || {}) }; }
  const sortCats = list => [...list].sort((a, b) => (a.ordem - b.ordem) || String(a.nome).localeCompare(b.nome, 'pt'));
  async function getCats() { await ensureSeed(); return sortCats(await store.list('oscar_categorias')); }

  /* ---------- resultados ---------- */
  // vencedores de uma categoria votada (empate = todos com o maior número de votos)
  function winnersOf(catId, finalists, votes) {
    const fs = finalists.filter(f => f.category_id === catId);
    const count = new Map(fs.map(f => [f.id, 0]));
    votes.forEach(v => { if (v.category_id === catId && count.has(v.finalist_id)) count.set(v.finalist_id, count.get(v.finalist_id) + 1); });
    const total = [...count.values()].reduce((a, b) => a + b, 0), max = Math.max(0, ...count.values());
    return { finalists: fs.map(f => ({ ...f, votes: count.get(f.id) })), winners: max > 0 ? fs.filter(f => count.get(f.id) === max).map(f => ({ ...f, votes: max })) : [], total };
  }
  // Voz do Ano: maior nota individual do karaokê (cada pessoa conta com a melhor nota dela)
  function vozDoAno(perfs, n = 3) {
    const best = new Map();
    perfs.forEach(p => { if (p.final == null) return; const k = key(p.name) + '|' + p.unit; const b = best.get(k); if (!b || p.final > b.final) best.set(k, { name: p.name, unit: p.unit, final: p.final, song: p.song_title }); });
    const list = [...best.values()].sort((a, b) => b.final - a.final);
    const top = list.length ? list[0].final : null;
    const fin = list.slice(0, n); list.forEach(p => { if (p.final === top && !fin.includes(p)) fin.push(p); });
    return { finalists: fin, winners: top == null ? [] : list.filter(p => p.final === top) };
  }
  // Unidade do Ano: peso_oscar × fatia das estatuetas + peso_karaoke × fatia do placar do karaokê
  function unidadeDoAno(wins, perfs, cfg) {
    const po = Math.max(0, +cfg.peso_oscar || 0), pk = Math.max(0, +cfg.peso_karaoke || 0), pt = (po + pk) || 1;
    const soma = C.RANKING_UNIDADES === 'soma';
    const kar = UNITS.map(u => { const ps = perfs.filter(p => p.unit === u.id && p.final != null), s = ps.reduce((a, p) => a + p.final, 0); return soma ? s : (ps.length ? s / ps.length : 0); });
    const ow = UNITS.map(u => wins[u.id] || 0);
    const sk = kar.reduce((a, b) => a + b, 0), so = ow.reduce((a, b) => a + b, 0);
    return UNITS.map((u, i) => ({
      unit: u.id, oscar: Math.round(ow[i] * 10) / 10, karaoke: Math.round(kar[i]),
      score: Math.round(100 * (po * (so ? ow[i] / so : 0) + pk * (sk ? kar[i] / sk : 0)) / pt)
    })).sort((a, b) => b.score - a.score || b.oscar - a.oscar);
  }
  // estatuetas por unidade (empate divide: 2 vencedores = 0,5 para cada)
  function winsByUnit(resultado) {
    const w = {};
    Object.values(resultado || {}).forEach(r => { const ws = (r && r.winners) || []; ws.forEach(x => { w[x.unit] = (w[x.unit] || 0) + 1 / ws.length; }); });
    return w;
  }

  /* ---------- fotos: reduz no celular antes de enviar ---------- */
  async function shrink(file, max = OC.FOTO_MAX_PX || 1600, q = 0.82) {
    let src;
    try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) { src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Não deu para abrir essa imagem')); i.src = URL.createObjectURL(file); }); }
    const w = src.width, h = src.height, s = Math.min(1, max / Math.max(w, h));
    const cv = document.createElement('canvas'); cv.width = Math.round(w * s); cv.height = Math.round(h * s);
    cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
    return await new Promise(res => cv.toBlob(res, 'image/jpeg', q));
  }
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  async function uploadPhoto(file, folder, max) {
    const blob = await shrink(file, max);
    const path = folder + '/' + Date.now() + '-' + uid().slice(0, 8) + '.jpg';
    return { path, url: await store.uploadFile(path, blob) };
  }

  /* ---------- voto (manda o nome junto; se o banco ainda não tem a coluna nova, vota do jeito antigo) ---------- */
  async function votar(a) {
    try { return await store.rpc('oscar_votar', a); }
    catch (e) {
      if (/PGRST202|could not find the function|function .* does not exist/i.test((e && (e.code + ' ' + e.message)) || '')) { const { p_name, ...old } = a; return await store.rpc('oscar_votar', old); }
      throw e;
    }
  }

  /* ---------- "fecha em X minutos" ---------- */
  const secsLeft = cfg => (cfg && cfg.fecha_em) ? Math.ceil((Date.parse(cfg.fecha_em) - Date.now()) / 1000) : null;
  const fmtLeft = s => s == null ? '' : (s <= 0 ? '0:00' : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'));

  /* ---------- mesma pessoa em vários celulares (aba anônima, outro navegador...) ----------
     Agrupa por nome+unidade de quem indicou/votou. Em cada categoria vale só a 1ª linha da pessoa;
     as outras ficam em "extras" (o admin decide se apaga). */
  function suspeitos(noms, votes) {
    const P = new Map();
    const add = (r, kind) => {
      if (!r.voter_name) return; const k = key(r.voter_name) + '|' + (r.voter_unit || '');
      if (!P.has(k)) P.set(k, { name: r.voter_name, unit: r.voter_unit, devs: new Set(), rows: [] });
      const g = P.get(k); g.devs.add(r.device_id); g.rows.push({ ...r, kind });
    };
    noms.forEach(r => add(r, 'nom')); votes.forEach(r => add(r, 'vote'));
    const out = [];
    P.forEach(g => {
      if (g.devs.size < 2) return;
      const seen = new Set(), extras = [];
      g.rows.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
        .forEach(r => { const k = r.kind + '|' + r.category_id; if (seen.has(k)) extras.push(r); else seen.add(k); });
      out.push({ name: g.name, unit: g.unit, devices: g.devs.size, noms: g.rows.filter(r => r.kind === 'nom').length, votes: g.rows.filter(r => r.kind === 'vote').length, extras });
    });
    return out.sort((a, b) => b.extras.length - a.extras.length || b.devices - a.devices);
  }

  /* ---------- retrospectiva da noite (karaokê) ---------- */
  function retro(perfs) {
    const ps = perfs.filter(p => p.final != null);
    const cnt = (arr, f) => { const m = new Map(); arr.forEach(x => { const k = f(x); if (!k) return; const e = m.get(k.key) || { ...k, n: 0 }; e.n++; m.set(k.key, e); }); return [...m.values()].sort((a, b) => b.n - a.n); };
    const singers = cnt(ps, p => ({ key: key(p.name) + '|' + p.unit, name: p.name, unit: p.unit }));
    const songs = cnt(ps, p => p.song_title ? { key: key(p.song_title), song: p.song_title } : null);
    const units = cnt(ps, p => ({ key: p.unit, unit: p.unit }));
    const first = [...ps].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0] || null;
    return {
      total: ps.length, cantores: singers.length, duetos: ps.filter(p => p.mode === 'dueto' || p.mode === 'batalha').length,
      media: ps.length ? Math.round(ps.reduce((a, p) => a + p.final, 0) / ps.length) : 0,
      musica: songs[0] && songs[0].n > 1 ? songs[0] : null, cantor: singers[0] && singers[0].n > 1 ? singers[0] : null,
      unidade: units[0] || null, primeira: first ? { name: first.name, unit: first.unit, song: first.song_title } : null
    };
  }

  const FASES = { indicacao: '📝 Indicação', votacao: '🗳️ Votação', cerimonia: '🎬 Cerimônia', encerrado: '🏁 Encerrado' };
  const TABLES = ['oscar_config', 'oscar_categorias', 'oscar_nominations', 'oscar_finalists', 'oscar_votes', 'oscar_photos'];

  window.OSCAR = {
    C, OC, store, UNITS, esc, key, cleanName, unitOf, chip, initials, avatar, CATS, CFG0, FASES, TABLES,
    titulo: OC.TITULO || 'OSCAR POBRE JUAN', ensureSeed, getConfig, getCats, sortCats,
    winnersOf, vozDoAno, unidadeDoAno, winsByUnit, shrink, uploadPhoto, votar, secsLeft, fmtLeft, suspeitos, retro,
    link: page => { const base = (C.LINK_CELULAR || '').replace(/[^/]*$/, ''); return base ? base + page : new URL(page, location.href).href; }
  };
})();
