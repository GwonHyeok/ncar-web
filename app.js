'use strict';
let DATA = { meta: {}, listings: [], options: [] };

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const won = (m) => (m == null ? '-' : m >= 10000 ? `${(m / 10000).toFixed(m % 10000 ? 1 : 0)}억` : `${m.toLocaleString()}만`);
const km = (v) => (v == null ? '-' : `${v.toLocaleString()}km`);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// http(s) URL만 허용(javascript:/data: 등 스킴 차단). 안전하면 이스케이프한 URL, 아니면 '#'.
const safeUrl = (u) => { try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? esc(x.href) : '#'; } catch { return '#'; } };

async function load() {
  try {
    const res = await fetch('data/listings.json', { cache: 'no-store' });
    DATA = await res.json();
  } catch (e) {
    $('#meta').textContent = '데이터 없음 — node scripts/build.mjs 실행 필요';
    return;
  }
  const m = DATA.meta || {};
  $('#meta').innerHTML = `매물 <b>${m.count ?? DATA.listings.length}</b>건 · 소스 ${(m.sources || []).length}개<br>`
    + `업데이트 ${m.generated_at ? new Date(m.generated_at).toLocaleString('ko-KR') : '-'}`;
  fillSelect('#f-trim', m.trims);
  fillSelect('#f-source', m.sources);
  fillSelect('#f-status', m.statuses);
  fillSelect('#o-trim', [...new Set((DATA.options || []).map((o) => o.trim).filter(Boolean))].sort());
  renderListings();
  renderOptions();
}

function fillSelect(sel, values) {
  const el = $(sel); if (!el || !values) return;
  for (const v of values) { const o = document.createElement('option'); o.value = v; o.textContent = v; el.appendChild(o); }
}

function currentFilter() {
  return {
    q: $('#q').value.trim().toLowerCase(),
    trim: $('#f-trim').value, source: $('#f-source').value, status: $('#f-status').value,
    sort: $('#f-sort').value, active: $('#f-active').checked,
  };
}

function renderListings() {
  const f = currentFilter();
  let rows = DATA.listings.filter((l) => {
    if (f.trim && l.trim !== f.trim) return false;
    if (f.source && !l.sources.includes(f.source)) return false;
    if (f.status && l.status !== f.status) return false;
    if (f.active && l.status && l.status !== '판매중') return false;
    if (f.q) {
      const hay = [l.trim, l.color_ext, l.color_int, l.region, l.options_text, l.plate, l.sources.join(' ')].join(' ').toLowerCase();
      if (!hay.includes(f.q)) return false;
    }
    return true;
  });
  const sold = (l) => /완료/.test(l.status || '');
  const noPrice = (l) => l.price_manwon == null;
  const cmp = {
    price_asc: (a, b) => (a.price_manwon ?? 9e9) - (b.price_manwon ?? 9e9),
    price_desc: (a, b) => (b.price_manwon ?? -1) - (a.price_manwon ?? -1),
    mileage_asc: (a, b) => (a.mileage_km ?? 9e9) - (b.mileage_km ?? 9e9),
    year_desc: (a, b) => (b.year ?? 0) - (a.year ?? 0),
    // 최근 관측순: 판매완료·가격미확보는 뒤로 보내 첫 화면이 비어보이지 않게 한다.
    last_seen: (a, b) =>
      (sold(a) - sold(b)) ||
      (noPrice(a) - noPrice(b)) ||
      String(b.last_seen).localeCompare(String(a.last_seen)) ||
      (a.price_manwon ?? 9e9) - (b.price_manwon ?? 9e9),
  }[f.sort];
  rows.sort(cmp);

  const nSold = rows.filter(sold).length;
  const nActive = rows.length - nSold;
  $('#count').innerHTML = `총 <b>${rows.length}</b>건`
    + ` · <span style="color:var(--ok)">판매중 ${nActive}</span>`
    + (nSold ? ` · <span style="color:var(--gone)">판매완료 ${nSold}</span>` : '')
    + ` · 가격확보 ${rows.filter((l) => !noPrice(l)).length}`;
  const grid = $('#grid');
  if (!rows.length) { grid.innerHTML = '<div class="empty">조건에 맞는 매물이 없습니다.</div>'; return; }
  grid.innerHTML = rows.map((l) => card(l, DATA.listings.indexOf(l))).join('');
  $$('.card', grid).forEach((el) => el.addEventListener('click', () => openModal(Number(el.dataset.i))));
}

function card(l, idx) {
  const multi = l.sources.length > 1;
  const thumbUrl = l.thumbnail ? safeUrl(l.thumbnail) : '#';
  const thumb = (l.thumbnail && thumbUrl !== '#')
    ? `<div class="thumb" style="background-image:url(&quot;${thumbUrl}&quot;)">`
    : `<div class="thumb"><span class="noimg">사진 없음</span>`;
  const soldCls = /완료/.test(l.status || '') ? ' sold' : '';
  return `<div class="card${soldCls}" data-i="${idx}">
    ${thumb}
      <div class="badges">
        ${l.sources.map((s) => `<span class="badge src">${esc(s)}</span>`).join('')}
        ${multi ? `<span class="badge multi">통합 ${l.sources.length}</span>` : ''}
      </div>
    </div>
    <div class="card-body">
      <span class="status ${esc(l.status)}">${esc(l.status || '-')}</span>
      <div class="card-title">타이칸 ${esc(l.trim || '')}</div>
      <div class="card-sub">${l.year || '-'}년 · ${esc(l.color_ext || '-')} · ${esc(l.region || '-')}</div>
      <div class="price">${won(l.price_manwon)}<small> · ${km(l.mileage_km)}</small></div>
      <div class="spec">${l.plate ? `🚗 ${esc(l.plate)}` : '<span style="color:var(--warn)">번호판 미확보</span>'} · ${esc(l.seller_type || '')}</div>
    </div>
  </div>`;
}

function openModal(idx) {
  const l = DATA.listings[idx]; if (!l) return;
  const opts = l.options_text ? l.options_text.split(/[,·|]/).map((s) => s.trim()).filter(Boolean) : [];
  $('#modal-card').innerHTML = `
    <button class="close" data-close>×</button>
    <h2>타이칸 ${esc(l.trim || '')}</h2>
    <div class="card-sub">${l.year || '-'}년 · ${km(l.mileage_km)} · ${esc(l.region || '-')} · <b style="color:#fff">${won(l.price_manwon)}</b></div>
    ${l.photos.length ? `<div class="modal-photos">${l.photos.slice(0, 12).map((p) => `<img loading="lazy" src="${safeUrl(p)}">`).join('')}</div>` : ''}
    <dl class="kv">
      <dt>차량번호</dt><dd>${esc(l.plate || '미확보')}</dd>
      <dt>외장/실내</dt><dd>${esc(l.color_ext || '-')} / ${esc(l.color_int || '-')}</dd>
      <dt>판매유형</dt><dd>${esc(l.seller_type || '-')}</dd>
      <dt>상태</dt><dd>${esc(l.status || '-')}</dd>
      <dt>최초/최근</dt><dd>${esc(l.first_seen || '-')} ~ ${esc(l.last_seen || '-')}</dd>
      <dt>가격이력</dt><dd>${(l.price_history || []).map((h) => `${h.date} ${won(h.price)}`).join(' → ') || '-'}</dd>
    </dl>
    ${l.options_matched && l.options_matched.length ? `<div style="margin-bottom:10px"><b>확인된 주요 옵션</b><div class="opt-tags">${l.options_matched.map((o) => `<span style="border-color:var(--accent2);color:var(--accent2)">${esc(o)}</span>`).join('')}</div></div>` : ''}
    ${opts.length ? `<div><b>옵션/설명 원문</b><div class="opt-tags">${opts.map((o) => `<span>${esc(o)}</span>`).join('')}</div></div>` : ''}
    <div class="srclinks"><b>매물 링크</b><br>${l.urls.map((u, i) => `<a href="${safeUrl(u)}" target="_blank" rel="noopener">${esc(l.sources[i] || '링크')} ↗</a>`).join('')}</div>
  `;
  $('#modal').hidden = false;
}

function renderOptions() {
  const q = $('#oq').value.trim().toLowerCase();
  const trim = $('#o-trim').value;
  const rows = (DATA.options || []).filter((o) => {
    if (trim && o.trim !== trim) return false;
    if (q && !`${o.option_code} ${o.option_name_ko} ${o.option_name_en} ${o.category}`.toLowerCase().includes(q)) return false;
    return true;
  });
  $('#otable tbody').innerHTML = rows.length
    ? rows.map((o) => `<tr>
        <td>${esc(o.model_year)}</td><td>${esc(o.trim)}</td><td>${esc(o.category)}</td>
        <td>${esc(o.option_code)}</td><td>${esc(o.option_name_ko)}</td><td>${esc(o.option_name_en)}</td>
        <td class="${/기본|표준|standard|y|true/i.test(o.is_standard) ? 'std' : ''}">${esc(o.is_standard)}</td><td>${esc(o.notes)}</td>
      </tr>`).join('')
    : '<tr><td colspan="8" class="empty">옵션표 데이터가 없습니다 (data/options_master.csv).</td></tr>';
}

// 이벤트 바인딩
['#q', '#f-trim', '#f-source', '#f-status', '#f-sort', '#f-active'].forEach((s) =>
  document.addEventListener('input', (e) => { if (e.target.closest(s)) renderListings(); }));
['#oq', '#o-trim'].forEach((s) =>
  document.addEventListener('input', (e) => { if (e.target.closest(s)) renderOptions(); }));
$$('.tab').forEach((t) => t.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.remove('active')); t.classList.add('active');
  $('#view-listings').hidden = t.dataset.view !== 'listings';
  $('#view-options').hidden = t.dataset.view !== 'options';
}));
document.addEventListener('click', (e) => { if (e.target.dataset.close !== undefined) $('#modal').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#modal').hidden = true; });

load();
