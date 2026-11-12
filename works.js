/* =========================================================
   Lumineglyph 制作実績データ（トップページと実績一覧ページで共通）

   ▼実績を追加するとき
   ・下の WORKS に { } を1件ずつ追加します。上にあるものから順に表示されます。
   ・トップページには最初の4件、実績一覧ページ（works.html）にはすべてが表示されます。
   ・トップページ左のスライドショーには、すべての実績がランダムな順番で表示されます。
   ・image にはサイトのファーストビュー画像を指定します（PC表示・横16:縦9、1600×900px目安）。
     画像が見つからないあいだは、サイト名入りの仮の枠が表示されます。
   ========================================================= */
const WORKS = [
  {
    url:   "https://mommienglish.com/",
    image: "assets/works/mommienglish.jpg",
    title: { ja:"MommiEnglish", en:"MommiEnglish" },
    category: { ja:"ホームページ制作", en:"Website" },
    desc: {
      ja:"ママ向けのおうち英語レッスンと、子ども向けオンライン英語教室「Smilingual」を運営する英語事業のホームページ。",
      en:"Website for an English education business offering at-home English lessons for moms and Smilingual, an online English school for kids."
    }
  },
  {
    url:   "https://annemusic.studio.site/",
    image: "assets/works/annemusic.jpg",
    title: { ja:"Anne Music", en:"Anne Music" },
    category: { ja:"ホームページ制作 / STUDIO", en:"Website / STUDIO" },
    desc: {
      ja:"「音楽はいつもそばに。」をコンセプトに、音楽鑑賞事業と、野球応援などのスポーツ応援事業を手がけるAnne Music様のホームページ。",
      en:"Website for Anne Music, offering music appreciation programs and live music for sports cheering such as baseball, under the concept “Music is always by your side.”"
    }
  }
];

/* ---------- 表示用の共通パーツ（通常は編集不要） ---------- */
const WORK_TEXT = {
  ja:{ view:"サイトを見る", newTab:"（新しいタブで開きます）", fv:"のファーストビュー" },
  en:{ view:"View Site",    newTab:" (opens in a new tab)",   fv:" — first view" }
};
function workEsc(v){ return String(v).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
const WORK_EXT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8"/></svg>';

/* 画像部分：画像が無いときは img を消して、サイト名入りの仮の枠を見せる */
function workImgHTML(w, lang){
  const t = WORK_TEXT[lang];
  return '<span class="ph-label">'+workEsc(w.title[lang])+'</span>'+
    (w.image ? '<img src="'+workEsc(w.image)+'" alt="'+workEsc(w.title[lang]+t.fv)+'" loading="lazy" onerror="this.remove()">' : '');
}
/* 実績1件のカード */
function workCardHTML(w, lang){
  const t = WORK_TEXT[lang];
  const url = workEsc(w.url);
  return '<article class="work">'+
    '<a class="work-img ph" href="'+url+'" target="_blank" rel="noopener" aria-label="'+workEsc(w.title[lang]+t.newTab)+'">'+workImgHTML(w,lang)+'</a>'+
    '<p class="work-cat">'+workEsc(w.category[lang])+'</p>'+
    '<h3 class="work-title">'+workEsc(w.title[lang])+'</h3>'+
    '<p class="work-desc">'+workEsc(w.desc[lang])+'</p>'+
    '<a class="work-link" href="'+url+'" target="_blank" rel="noopener">'+t.view+WORK_EXT_ICON+'<span class="sr-only">'+t.newTab+'</span></a>'+
  '</article>';
}
/* ページ間リンク：表示中の言語と、比較用の配色指定（?theme）を引き継ぐ */
function pageLink(base, lang, hash){
  const q = new URLSearchParams();
  if(lang === "en") q.set("lang","en");
  const theme = document.documentElement.getAttribute("data-theme");
  if(theme) q.set("theme", theme);
  const qs = q.toString();
  return base + (qs ? "?"+qs : "") + (hash || "");
}
function initialLang(){
  try{ return new URLSearchParams(location.search).get("lang") === "en" ? "en" : "ja"; }catch(e){ return "ja"; }
}
