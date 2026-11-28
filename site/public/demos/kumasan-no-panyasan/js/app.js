/* くまさんのパン屋さん  予約デモ
 * 予約データはこのタブのメモリ上だけで管理します。
 * 再読み込み、または「サンプルデータを初期化」で最初の状態に戻ります。
 */
(() => {
  'use strict';

  const CAPACITY = 6;
  const FEE_TEXT = '5,500円（材料費込み）';
  const TIME_TEXT = '10:00〜13:00';
  const WD = ['日', '月', '火', '水', '木', '金', '土'];

  const $ = (sel, root = document) => root.querySelector(sel);
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDate = (s) => { const d = parse(s); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WD[d.getDay()]}）`; };
  const fmtShort = (s) => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）`; };
  const fmtStamp = (t) => { const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = ymd(today);

  /* ------------------------------------------------------------
   * サンプルデータ（今日から見た直近の月曜日で作成）
   * ------------------------------------------------------------ */
  function createSeed() {
    // 今日より後の最初の月曜日
    const first = new Date(today);
    first.setDate(first.getDate() + (((1 - first.getDay() + 7) % 7) || 7));
    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth() + 3, 0); // 今月＋2か月の末日

    // 開催日ごとのデモ設定。[人数, 名前, メール, 内訳, アレルギー, 詳細]
    const plan = [
      { status: 'open', seed: [
        [2, '佐藤 みき', 'miki.sato@example.com', '母1名、子ども1名（5歳）', 'なし', ''],
        [2, '田中 りえ', 'rie.tanaka@example.com', '大人2名', 'あり', '大人1名：キウイ'],
      ] },
      { status: 'open', seed: [
        [3, '鈴木 あや', 'aya.suzuki@example.com', '母1名、子ども2名', 'なし', ''],
        [2, '高橋 ゆう', 'yu.takahashi@example.com', '父1名、子ども1名（7歳）', 'あり', '子ども：そば、ピーナッツ'],
        [1, '伊藤 なな', 'nana.ito@example.com', '大人1名', 'なし', ''],
      ] },
      { status: 'none', seed: [] },
      { status: 'open', seed: [
        [1, '渡辺 さき', 'saki.watanabe@example.com', '大人1名', 'なし', ''],
      ] },
      { status: 'open', seed: [] },
      { status: 'open', seed: [
        [2, '山本 かな', 'kana.yamamoto@example.com', '母1名、子ども1名（4歳）', 'あり', '子ども：えび・かに'],
        [1, '中村 えみ', 'emi.nakamura@example.com', '大人1名', 'なし', ''],
      ] },
      { status: 'none', seed: [] },
    ];

    const lessons = [];
    const reservations = [];
    let seq = 0;
    const base = Date.now() - 1000 * 60 * 60 * 24 * 10;
    for (let d = new Date(first), i = 0; d <= lastMonthEnd; d.setDate(d.getDate() + 7), i++) {
      const date = ymd(d);
      const p = plan[i] || { status: 'open', seed: [] };
      lessons.push({ date, status: p.status });
      p.seed.forEach(([count, name, email, members, allergy, allergyDetail]) => {
        seq++;
        reservations.push({
          id: `R-${pad(seq).padStart(3, '0')}`, date, name, email, count, members, allergy, allergyDetail,
          createdAt: base + seq * 1000 * 60 * 97,
        });
      });
    }
    return { lessons, reservations, seq };
  }

  let db;
  const ui = { month: null, selected: null, filter: 'all', activeId: null, newIds: new Set(), slide: 0, submitted: false };

  const lessonOf = (date) => db.lessons.find((l) => l.date === date);
  const booked = (date) => db.reservations.filter((r) => r.date === date).reduce((s, r) => s + r.count, 0);
  const remaining = (date) => Math.max(0, CAPACITY - booked(date));
  function statusOf(date) {
    const l = lessonOf(date);
    if (!l || date < todayStr) return null;
    if (l.status === 'none') return 'none';
    return remaining(date) <= 0 ? 'full' : 'open';
  }
  const STATUS_LABEL = { open: '予約可', full: '満席', none: '開催なし' };

  /* ------------------------------------------------------------
   * カレンダー
   * ------------------------------------------------------------ */
  const monthRange = () => {
    const last = parse(db.lessons[db.lessons.length - 1].date);
    return { min: new Date(today.getFullYear(), today.getMonth(), 1), max: new Date(last.getFullYear(), last.getMonth(), 1) };
  };

  function renderCalendar() {
    const { min, max } = monthRange();
    const m = ui.month;
    $('#calMonth').textContent = `${m.getFullYear()}年 ${m.getMonth() + 1}月`;
    $('#calPrev').disabled = m <= min;
    $('#calNext').disabled = m >= max;

    const firstWd = m.getDay();
    const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    let html = '';
    for (let i = 0; i < firstWd; i++) html += '<span class="day" aria-hidden="true"></span>';
    for (let n = 1; n <= days; n++) {
      const date = ymd(new Date(m.getFullYear(), m.getMonth(), n));
      const st = statusOf(date);
      const past = date < todayStr;
      const todayCls = date === todayStr ? ' day--today' : '';
      if (st === 'open') {
        const r = remaining(date);
        const sel = ui.selected === date;
        html += `<button type="button" class="day st-open${todayCls}" data-date="${date}" aria-pressed="${sel}" aria-label="${fmtDate(date)} 予約可 残り${r}名">`
          + `<span class="day__num">${n}</span><span class="day__st">予約可</span><span class="day__seat">残${r}</span></button>`;
      } else if (st) {
        const label = st === 'full' ? '満席' : '<span class="nw">開催</span><span class="nw">なし</span>';
        html += `<span class="day st-${st}${todayCls}" aria-label="${fmtDate(date)} ${STATUS_LABEL[st]}"><span class="day__num">${n}</span><span class="day__st">${label}</span></span>`;
      } else {
        html += `<span class="day${past ? ' day--muted' : ''}${todayCls}"><span class="day__num">${n}</span></span>`;
      }
    }
    $('#calDays').innerHTML = html;
  }

  $('#calPrev').addEventListener('click', () => { ui.month = new Date(ui.month.getFullYear(), ui.month.getMonth() - 1, 1); renderCalendar(); });
  $('#calNext').addEventListener('click', () => { ui.month = new Date(ui.month.getFullYear(), ui.month.getMonth() + 1, 1); renderCalendar(); });
  $('#calDays').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-date]');
    if (!btn) return;
    selectDate(btn.dataset.date);
    $(`#calDays button[data-date="${ui.selected}"]`)?.focus();
  });

  function selectDate(date) {
    ui.selected = date;
    renderCalendar();
    renderPick();
    if (!$('#formWrap').hidden) {
      renderFormDate();
      if ($('#f-count').value) validateField('count');
    }
  }

  function renderPick() {
    const pick = $('#pick');
    if (!ui.selected || statusOf(ui.selected) !== 'open') { pick.hidden = true; return; }
    pick.hidden = false;
    $('#pickDate').textContent = `${fmtDate(ui.selected)} ${TIME_TEXT}`;
    $('#pickSeats').textContent = `${remaining(ui.selected)}名`;
  }

  $('#toForm').addEventListener('click', () => {
    $('#done').hidden = true;
    $('#formWrap').hidden = false;
    renderFormDate();
    $('#formTitle').focus({ preventScroll: true });
    $('#formWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  function renderFormDate() {
    $('#formDate').textContent = `${fmtDate(ui.selected)} ${TIME_TEXT}`;
    $('#formSeats').textContent = remaining(ui.selected);
  }

  /* ------------------------------------------------------------
   * 予約フォーム
   * ------------------------------------------------------------ */
  const form = $('#reserveForm');
  const val = (name) => {
    if (name === 'allergy') return form.querySelector('input[name="allergy"]:checked')?.value || '';
    return form.elements[name].value.trim();
  };

  const rules = {
    name: () => (val('name') ? '' : 'お名前を入力してください。'),
    email: () => {
      const v = val('email');
      if (!v) return 'メールアドレスを入力してください。';
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'メールアドレスの形式で入力してください（例：sample@example.com）。';
    },
    count: () => {
      const v = val('count');
      if (!v) return '参加人数を選んでください。';
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > CAPACITY) return '参加人数は1〜6名で選んでください。';
      if (!ui.selected) return '先にカレンダーから日程を選んでください。';
      const r = remaining(ui.selected);
      if (n > r) return `この日の残席は${r}名です。人数を見直すか、別の日程をお選びください。`;
      return '';
    },
    members: () => (val('members') ? '' : '参加者の内訳を入力してください（例：母1名、子ども1名）。'),
    allergy: () => (val('allergy') ? '' : 'アレルギーの有無を選んでください。'),
    allergyDetail: () => (val('allergy') === 'あり' && !val('allergyDetail') ? 'アレルギーのある食材を入力してください。' : ''),
  };

  function setError(name, msg) {
    const wrap = form.querySelector(`[data-field="${name}"]`);
    wrap.classList.toggle('is-error', !!msg);
    $(`#e-${name}`).textContent = msg;
    const inputs = name === 'allergy' ? form.querySelectorAll('input[name="allergy"]') : [form.elements[name]];
    inputs.forEach((el) => el.setAttribute('aria-invalid', msg ? 'true' : 'false'));
  }
  function validateField(name) { const msg = rules[name](); setError(name, msg); return msg; }
  function validateAll() {
    return Object.keys(rules).filter((k) => validateField(k));
  }

  // 人数は選んだ時点で残席チェック
  $('#f-count').addEventListener('change', () => validateField('count'));
  ['name', 'email', 'members', 'allergyDetail'].forEach((name) => {
    const el = form.elements[name];
    el.addEventListener('blur', () => { if (ui.submitted || el.value.trim()) validateField(name); });
    el.addEventListener('input', () => { if (form.querySelector(`[data-field="${name}"]`).classList.contains('is-error')) validateField(name); });
  });
  form.querySelectorAll('input[name="allergy"]').forEach((r) => r.addEventListener('change', () => {
    const on = val('allergy') === 'あり';
    $('#allergyDetailWrap').hidden = !on;
    if (!on) setError('allergyDetail', '');
    validateField('allergy');
  }));

  $('#fillSample').addEventListener('click', () => {
    form.elements.name.value = 'くまの はなこ（サンプル）';
    form.elements.email.value = 'hanako.sample@example.com';
    form.elements.count.value = '2';
    form.elements.members.value = '母1名、子ども1名（6歳）';
    form.querySelector('input[name="allergy"][value="あり"]').checked = true;
    $('#allergyDetailWrap').hidden = false;
    form.elements.allergyDetail.value = '子ども：キウイ';
    validateAll();
    $('#e-form').textContent = '';
    toast('サンプル情報を入力しました');
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    ui.submitted = true;
    // 確定時にも残席を再確認（validateAll内のcountルール）
    const errors = validateAll();
    if (!ui.selected || statusOf(ui.selected) !== 'open') {
      $('#e-form').textContent = 'この日程は満席になりました。カレンダーから別の日程をお選びください。';
      renderCalendar(); renderPick();
      return;
    }
    if (errors.length) {
      $('#e-form').textContent = `入力内容をご確認ください（${errors.length}件）。`;
      const first = errors[0] === 'allergy' ? form.querySelector('input[name="allergy"]') : form.elements[errors[0]];
      first.focus();
      return;
    }
    $('#e-form').textContent = '';
    db.seq++;
    const r = {
      id: `R-${String(db.seq).padStart(3, '0')}`,
      date: ui.selected,
      name: val('name'),
      email: val('email'),
      count: Number(val('count')),
      members: val('members'),
      allergy: val('allergy'),
      allergyDetail: val('allergy') === 'あり' ? val('allergyDetail') : '',
      createdAt: Date.now(),
    };
    db.reservations.push(r);
    ui.newIds.add(r.id);
    ui.activeId = r.id;
    showDone(r);
    resetForm();
    ui.selected = null;
    renderCalendar(); renderPick(); renderAdmin();
    toast('予約を受け付けました');
  });

  function resetForm() {
    form.reset();
    ui.submitted = false;
    $('#allergyDetailWrap').hidden = true;
    Object.keys(rules).forEach((k) => setError(k, ''));
    $('#e-form').textContent = '';
  }

  function showDone(r) {
    $('#formWrap').hidden = true;
    const rows = [
      ['予約番号', esc(r.id)],
      ['予約日時', `${fmtDate(r.date)}<br>${TIME_TEXT}`],
      ['お名前', esc(r.name)],
      ['参加人数', `${r.count}名`],
      ['参加者の内訳', esc(r.members)],
      ['アレルギー', r.allergy === 'あり' ? `あり（${esc(r.allergyDetail)}）` : 'なし'],
      ['参加費', `${FEE_TEXT}<br><span class="small">親子参加でも参加費は変わりません。当日お支払いください。</span>`],
    ];
    $('#doneList').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    $('#done').dataset.id = r.id;
    $('#done').hidden = false;
    $('#doneTitle').focus({ preventScroll: true });
    $('#done').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('#bookAgain').addEventListener('click', () => {
    $('#done').hidden = true;
    $('#calendar').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#calDays button')?.focus({ preventScroll: true });
  });
  $('#goAdmin').addEventListener('click', () => {
    const r = db.reservations.find((x) => x.id === $('#done').dataset.id);
    if (r) { ui.filter = r.date; ui.activeId = r.id; }
    setView('admin');
  });

  /* ------------------------------------------------------------
   * 運営者ページ
   * ------------------------------------------------------------ */
  function renderAdmin() {
    const lessons = db.lessons.filter((l) => l.date >= todayStr && l.status !== 'none');

    $('#adminSummary').innerHTML = lessons.map((l) => {
      const b = booked(l.date); const st = statusOf(l.date);
      return `<li><strong>${fmtShort(l.date)}</strong>予約 ${b}名 ／ 残席 ${remaining(l.date)}名`
        + `<div class="bar" aria-hidden="true"><span style="width:${Math.min(100, (b / CAPACITY) * 100)}%"></span></div>`
        + `<span class="legend__chip st-${st}">${STATUS_LABEL[st]}</span></li>`;
    }).join('');

    const sel = $('#adminFilter');
    const opts = [`<option value="all">すべての開催日（${db.reservations.length}件）</option>`].concat(
      lessons.map((l) => {
        const n = db.reservations.filter((r) => r.date === l.date).length;
        return `<option value="${l.date}">${fmtShort(l.date)} ${n}件・${booked(l.date)}名</option>`;
      }));
    sel.innerHTML = opts.join('');
    if (ui.filter !== 'all' && !lessons.some((l) => l.date === ui.filter)) ui.filter = 'all';
    sel.value = ui.filter;

    const list = db.reservations
      .filter((r) => ui.filter === 'all' || r.date === ui.filter)
      .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1));

    const total = list.reduce((s, r) => s + r.count, 0);
    $('#adminCount').textContent = `${list.length}件・合計${total}名`;
    $('#adminEmpty').hidden = list.length > 0;
    $('#adminRows').innerHTML = list.map((r) => `
      <tr class="${r.id === ui.activeId ? 'is-active' : ''}">
        <td data-label="開催日" class="nowrap">${fmtShort(r.date)}</td>
        <td data-label="予約者名"><span>${esc(r.name)}${ui.newIds.has(r.id) ? '<span class="badge">NEW</span>' : ''}</span></td>
        <td data-label="人数" class="nowrap">${r.count}名</td>
        <td data-label="参加者の内訳">${esc(r.members)}</td>
        <td data-label="アレルギー"><span>${r.allergy === 'あり' ? '<span class="badge badge--allergy">あり</span>' : 'なし'}</span></td>
        <td><button type="button" class="btn btn--ghost" data-id="${r.id}" aria-label="${esc(r.name)}さんの予約詳細">詳細</button></td>
      </tr>`).join('');

    renderDetail();
  }

  function renderDetail() {
    const r = db.reservations.find((x) => x.id === ui.activeId);
    const box = $('#adminDetail');
    if (!r) { box.innerHTML = '<p class="muted">一覧の「詳細」を押すと、ここに表示されます。</p>'; return; }
    const rows = [
      ['予約番号', esc(r.id) + (ui.newIds.has(r.id) ? '<span class="badge">NEW</span>' : '')],
      ['開催日', `${fmtDate(r.date)}<br>${TIME_TEXT}`],
      ['予約者名', esc(r.name)],
      ['メール', `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>`],
      ['参加人数', `${r.count}名`],
      ['参加者の内訳', esc(r.members)],
      ['アレルギー', r.allergy === 'あり' ? '<span class="badge badge--allergy">あり</span>' : 'なし'],
      ['記入内容', r.allergy === 'あり' ? esc(r.allergyDetail) : '—'],
      ['受付日時', fmtStamp(r.createdAt)],
    ];
    box.innerHTML = `<dl class="info">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  }

  $('#adminFilter').addEventListener('change', (e) => { ui.filter = e.target.value; renderAdmin(); });
  $('#adminRows').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    ui.activeId = btn.dataset.id;
    renderAdmin();
    if (window.matchMedia('(max-width: 999px)').matches) {
      $('#detail-title').focus({ preventScroll: true });
      $('#detail-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  /* ------------------------------------------------------------
   * 表示切り替え・初期化
   * ------------------------------------------------------------ */
  function setView(view) {
    document.querySelectorAll('.seg').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    $('#view-customer').hidden = view !== 'customer';
    $('#view-admin').hidden = view !== 'admin';
    if (view === 'admin') renderAdmin();
    window.scrollTo({ top: 0 });
    (view === 'admin' ? $('#adminTitle') : null)?.focus({ preventScroll: true });
  }
  document.querySelectorAll('.seg').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

  function init() {
    db = createSeed();
    Object.assign(ui, { selected: null, filter: 'all', activeId: null, submitted: false });
    ui.newIds = new Set();
    ui.month = new Date(today.getFullYear(), today.getMonth(), 1);
    // 今月に予約できる日がなければ、最初の開催月を表示
    const firstOpen = db.lessons.find((l) => statusOf(l.date) === 'open');
    if (firstOpen) { const d = parse(firstOpen.date); ui.month = new Date(d.getFullYear(), d.getMonth(), 1); }
    resetForm();
    $('#formWrap').hidden = true;
    $('#done').hidden = true;
    renderCalendar(); renderPick(); renderAdmin();
  }
  $('#resetData').addEventListener('click', () => { init(); toast('サンプルデータを初期化しました'); });

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-show'), 2400);
  }

  /* ------------------------------------------------------------
   * 写真スライダー
   * ------------------------------------------------------------ */
  const track = $('#slideTrack');
  const slides = Array.from(track.children);
  const dots = $('#slideDots');
  dots.innerHTML = slides.map((_, i) => `<button type="button" class="dot" data-i="${i}" aria-label="${i + 1}枚目の写真を表示"></button>`).join('');

  function goSlide(i) {
    ui.slide = (i + slides.length) % slides.length;
    track.style.transform = `translateX(-${ui.slide * 100}%)`;
    slides.forEach((s, n) => { s.setAttribute('aria-hidden', String(n !== ui.slide)); });
    dots.querySelectorAll('.dot').forEach((d, n) => d.setAttribute('aria-current', String(n === ui.slide)));
    $('#slideCount').textContent = `${ui.slide + 1} / ${slides.length}`;
  }
  $('#slidePrev').addEventListener('click', () => goSlide(ui.slide - 1));
  $('#slideNext').addEventListener('click', () => goSlide(ui.slide + 1));
  dots.addEventListener('click', (e) => { const d = e.target.closest('.dot'); if (d) goSlide(Number(d.dataset.i)); });

  // スワイプ操作
  let startX = null;
  const vp = $('.slider__viewport');
  vp.addEventListener('pointerdown', (e) => { startX = e.clientX; });
  vp.addEventListener('pointerup', (e) => {
    if (startX === null) return;
    const dx = e.clientX - startX; startX = null;
    if (Math.abs(dx) > 40) goSlide(ui.slide + (dx < 0 ? 1 : -1));
  });
  vp.addEventListener('pointercancel', () => { startX = null; });

  goSlide(0);
  init();
})();
