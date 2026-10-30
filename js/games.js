// The five experiments. Each one defines its rules, input, scoring and reveal.
import { stripChart, barChart, esc } from './charts.js';

const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r1 = v => Math.round(v * 10) / 10;
const money = v => `$${Number.isInteger(v) ? v : v.toFixed(2)}`;

// slider + big readout. Lock-in stays disabled until the player moves it,
// so nobody gets anchored by a default value.
export function slider({ name, min, max, step = 1, label, prefix = '', suffix = '', hint = '' }) {
  return `
  <label class="slider" data-name="${name}">
    <span class="slider-label">${label}</span>
    <output class="slider-out" data-prefix="${prefix}" data-suffix="${suffix}">?</output>
    <input type="range" name="${name}" min="${min}" max="${max}" step="${step}" value="${(min + max) / 2}" data-touched="0" aria-label="${esc(label)}">
    <span class="slider-ends"><span>${prefix}${min}${suffix}</span>${hint ? `<span class="slider-hint">${hint}</span>` : ''}<span>${prefix}${max}${suffix}</span></span>
  </label>`;
}
const readSlider = (root, name) => {
  const el = root.querySelector(`input[name="${name}"]`);
  if (!el || el.dataset.touched !== '1') return null;
  return Number(el.value);
};

export const GAMES = {
  beauty: {
    key: 'beauty',
    title: 'Guess ⅔ of the average',
    short: 'Keynes’s beauty contest',
    rules: () => `<p>Everyone picks a whole number from 0 to 100. The winner is whoever lands closest to <strong>two-thirds of the group’s average</strong>.</p>
      <p class="muted">You’re not guessing a number. You’re guessing what everyone else will guess.</p>`,
    makeParams: () => ({}),
    input: () => slider({ name: 'n', min: 0, max: 100, label: 'Your number' }),
    read: root => { const n = readSlider(root, 'n'); return n == null ? { error: 'Move the slider to pick a number.' } : { value: n }; },
    describe: v => `You picked ${v}`,
    resolve(params, subs) {
      const vals = Object.values(subs);
      const mean = avg(vals);
      const target = (2 / 3) * mean;
      const pts = {}, out = {};
      const best = Math.min(...vals.map(v => Math.abs(v - target)));
      for (const [pid, v] of Object.entries(subs)) {
        const d = Math.abs(v - target);
        pts[pid] = Math.max(0, Math.round(100 - 3 * d)) + (d === best ? 25 : 0);
        out[pid] = d === best ? `You picked ${v}, closest to ${r1(target)}. Winner.` : `You picked ${v}, ${r1(d)} away from ${r1(target)}.`;
      }
      // steps of reasoning: 50 × (2/3)^k = mean
      const depth = mean > 0 ? Math.log(mean / 50) / Math.log(2 / 3) : 9;
      return { pts, out, stats: { mean: r1(mean), target: r1(target), depth: r1(Math.max(0, depth)), zeros: vals.filter(v => v === 0).length, n: vals.length } };
    },
    reveal(params, subs, res, ctx) {
      const s = res.stats;
      const chart = stripChart({
        min: 0, max: 100,
        points: Object.entries(subs).map(([pid, v]) => ({ v, label: ctx.name(pid), me: pid === ctx.me })),
        markers: [
          { v: s.target, label: `Target ${s.target}`, cls: 'you-mk' },
          { v: s.mean, label: `Average ${s.mean}`, cls: 'ink-mk' },
          { v: 0, label: 'Nash: 0', cls: 'nash' },
        ],
      });
      return { chart, theory: `If everyone is perfectly rational, everyone keeps shading down (50 → 33 → 22 → 15 …) until all pick <strong>0</strong>.`,
        group: (s.depth < 0.5
          ? `Your group averaged <strong>${s.mean}</strong>. That’s ${s.mean > 52 ? 'above' : 'close to'} 50, what purely random guesses would average, so most of you didn’t shade down for what others would pick.`
          : `Your group averaged <strong>${s.mean}</strong>, about <strong>${s.depth}</strong> steps of “they’ll think that I think…” reasoning.`) + (s.zeros ? ` ${s.zeros} of you went straight to 0.` : ''),
        lab: `In Rosemarie Nagel’s 1995 lab experiments, first-round averages were around 36. When a Danish newspaper ran it for over 19,000 readers, the average was 33. Being “right” about theory loses to being right about people.` };
    },
    summary: (res) => `Beauty contest: average ${res.stats.mean}, target ${res.stats.target} (Nash 0), ~${res.stats.depth} steps of reasoning.`,
  },

  public: {
    key: 'public',
    title: 'The group pot',
    short: 'Public goods game',
    rules: () => `<p>You each get <strong>10 tokens</strong>. Put any amount into the group pot and keep the rest.</p>
      <p>The pot is <strong>doubled</strong> and split equally among everyone, whether they chipped in or not.</p>`,
    makeParams: () => ({ endow: 10, mult: 2 }),
    input: () => slider({ name: 'c', min: 0, max: 10, label: 'Tokens into the pot', suffix: '' , hint: 'keep the rest' }),
    read: root => { const c = readSlider(root, 'c'); return c == null ? { error: 'Move the slider to choose your contribution.' } : { value: c }; },
    describe: v => `You put in ${v} token${v === 1 ? '' : 's'}`,
    resolve(params, subs) {
      const ids = Object.keys(subs);
      const n = ids.length;
      const pot = ids.reduce((a, k) => a + subs[k], 0);
      const share = (pot * params.mult) / n;
      const pts = {}, out = {};
      for (const pid of ids) {
        const pay = params.endow - subs[pid] + share;
        pts[pid] = Math.round(pay * 4);
        out[pid] = `You put in ${subs[pid]}, kept ${params.endow - subs[pid]}, got back ${r1(share)}. Total ${r1(pay)} tokens.`;
      }
      const pct = n ? Math.round((pot / (n * params.endow)) * 100) : 0;
      return { pts, out, stats: { pot, share: r1(share), pct, n, freeRiders: ids.filter(k => subs[k] === 0).length, allIn: params.endow * params.mult } };
    },
    reveal(params, subs, res, ctx) {
      const s = res.stats;
      const chart = barChart({
        max: 10,
        bars: Object.entries(subs).map(([pid, v]) => ({ v, label: ctx.name(pid), me: pid === ctx.me })),
        line: { v: s.pot / Math.max(1, s.n), label: `Group average ${r1(s.pot / Math.max(1, s.n))}`, cls: 'you-mk' },
      });
      return { chart,
        theory: `Each token you give returns less than a token to you, so the selfish best move is <strong>give 0</strong>. But if everyone gives 10, everyone walks away with ${s.allIn}.`,
        group: `Your group put in <strong>${s.pct}%</strong> of its tokens. Everyone got back ${s.share} from the pot.${s.freeRiders ? ` ${s.freeRiders} free rider${s.freeRiders > 1 ? 's' : ''} gave nothing.` : ' Nobody free-rode.'}`,
        lab: `In lab studies, people typically give 40–60% at first, and giving falls when the game repeats and free riders go unpunished. It’s the logic behind tax compliance, open-source code and group projects.` };
    },
    summary: res => `Public goods: group contributed ${res.stats.pct}% (Nash 0%), ${res.stats.freeRiders} free rider(s).`,
  },

  ultimatum: {
    key: 'ultimatum',
    title: 'Split the $10',
    short: 'Ultimatum game',
    rules: (params, ctx) => {
      const to = params.pairs[ctx.me];
      const from = Object.keys(params.pairs).find(k => params.pairs[k] === ctx.me);
      return `<p>You make one offer and answer one offer, at the same time.</p>
      <p><strong>As proposer</strong>, you split $10 with <strong>${esc(ctx.name(to))}</strong>. <strong>As responder</strong>, you set the smallest offer you’ll accept from <strong>${esc(ctx.name(from))}</strong>.</p>
      <p class="muted">If an offer is below the responder’s minimum, both of you get nothing from that deal.</p>`;
    },
    makeParams(ids, rng) {
      const order = shuffle(ids, rng);
      const pairs = {};
      order.forEach((pid, i) => { pairs[pid] = order[(i + 1) % order.length]; });
      return { pairs };
    },
    input: () => slider({ name: 'offer', min: 0, max: 10, label: 'I offer them', prefix: '$' }) +
      slider({ name: 'min', min: 0, max: 10, label: 'I’ll accept at least', prefix: '$' }),
    read(root) {
      const offer = readSlider(root, 'offer'), min = readSlider(root, 'min');
      if (offer == null || min == null) return { error: 'Set both sliders: your offer and your minimum.' };
      return { value: { offer, min } };
    },
    describe: v => `You offered $${v.offer} and will accept $${v.min}+`,
    resolve(params, subs) {
      const pts = {}, out = {}, earn = {};
      const deals = [];
      for (const pid of Object.keys(subs)) earn[pid] = 0;
      for (const [prop, resp] of Object.entries(params.pairs)) {
        const p = subs[prop], q = subs[resp];
        if (!p || !q) continue; // one side missing: deal skipped
        const ok = p.offer >= q.min;
        deals.push({ prop, resp, offer: p.offer, min: q.min, ok });
        if (ok) { earn[prop] += 10 - p.offer; earn[resp] += p.offer; }
      }
      for (const pid of Object.keys(subs)) {
        pts[pid] = earn[pid] * 5;
        const mine = deals.find(d => d.prop === pid), theirs = deals.find(d => d.resp === pid);
        const a = mine ? (mine.ok ? `Your $${mine.offer} offer was accepted.` : `Your $${mine.offer} offer was rejected (they wanted $${mine.min}).`) : '';
        const b = theirs ? (theirs.ok ? `You accepted $${theirs.offer}.` : `You rejected $${theirs.offer}.`) : '';
        out[pid] = `${a} ${b} You earned $${earn[pid]}.`.trim();
      }
      const rej = deals.filter(d => !d.ok);
      return { pts, out, stats: { deals, meanOffer: r1(avg(deals.map(d => d.offer))), rejected: rej.length, burned: rej.length * 10, n: deals.length } };
    },
    reveal(params, subs, res, ctx) {
      const s = res.stats;
      const counts = Array.from({ length: 11 }, () => ({ ok: 0, no: 0 }));
      s.deals.forEach(d => counts[d.offer][d.ok ? 'ok' : 'no']++);
      const chart = barChart({
        max: Math.max(...counts.map(c => c.ok + c.no), 1),
        bars: counts.map((c, i) => ({ v: c.ok + c.no, label: `$${i}`, cls: c.no ? 'rejected' : '', always: true })),
      }).replace('aria-label="Bar chart"', 'aria-label="How many offers at each dollar amount; red bars include rejected offers"');
      return { chart, chartNote: 'How many offers were made at each amount. Red bars include at least one rejected deal.',
        theory: `A money-maximizer accepts anything over $0, so the proposer should offer <strong>$1</strong> (or even $0) and keep the rest.`,
        group: `Your group’s average offer was <strong>$${s.meanOffer}</strong>. ${s.rejected ? `<strong>${s.rejected}</strong> deal${s.rejected > 1 ? 's were' : ' was'} rejected, burning $${s.burned} to punish unfairness.` : 'Every deal went through.'}`,
        lab: `Since Güth’s 1982 study, offers usually land at 40–50%, and offers under about 20% get rejected roughly half the time. People pay real money to punish unfairness.` };
    },
    summary: res => `Ultimatum: average offer $${res.stats.meanOffer} (theory ~$1), ${res.stats.rejected} of ${res.stats.n} deals rejected.`,
  },

  auction: {
    key: 'auction',
    title: 'The mystery jar',
    short: 'Winner’s curse auction',
    rules: (params, ctx) => `<p>A jar of coins is worth a secret amount between $20 and $80. Each of you got a <strong>noisy estimate</strong> that’s off by up to $${params.noise}.</p>
      <p class="estimate">Your estimate: <strong>$${params.signals[ctx.me] ?? '—'}</strong></p>
      <p>Sealed bids. Highest bid wins the jar and pays their bid.</p>`,
    makeParams(ids, rng) {
      const noise = 15;
      const value = 20 + Math.floor(rng() * 61);
      const signals = {};
      ids.forEach(pid => { signals[pid] = value + Math.round((rng() * 2 - 1) * noise); });
      return { value, noise, signals, tiebreak: Math.floor(rng() * 1e6) };
    },
    input: () => slider({ name: 'bid', min: 0, max: 100, label: 'Your bid', prefix: '$' }),
    read: root => { const b = readSlider(root, 'bid'); return b == null ? { error: 'Move the slider to set your bid.' } : { value: b }; },
    describe: v => `You bid $${v}`,
    resolve(params, subs) {
      const ids = Object.keys(subs);
      const top = Math.max(...ids.map(k => subs[k]));
      const tied = ids.filter(k => subs[k] === top).sort();
      const winner = tied[params.tiebreak % tied.length];
      const profit = params.value - top;
      const pts = {}, out = {};
      for (const pid of ids) {
        if (pid === winner) {
          pts[pid] = Math.max(-40, 30 + 3 * profit);
          out[pid] = profit >= 0 ? `You won at $${top} for a jar worth $${params.value}. Profit $${profit}.` : `You won at $${top}, but the jar was worth $${params.value}. You lost $${-profit}. That’s the winner’s curse.`;
        } else {
          pts[pid] = 30;
          out[pid] = `You bid $${subs[pid]}. The winner paid $${top} for a jar worth $${params.value}.`;
        }
      }
      const n = ids.length;
      const shade = Math.round((params.noise * (n - 1)) / (n + 1));
      return { pts, out, stats: { winner, top, profit, value: params.value, shade, n } };
    },
    reveal(params, subs, res, ctx) {
      const s = res.stats;
      const pts = [];
      for (const [pid, b] of Object.entries(subs)) {
        pts.push({ v: b, label: `${ctx.name(pid)} bid`, me: pid === ctx.me, cls: pid === s.winner ? 'winner' : '' });
      }
      const chart = stripChart({
        min: 0, max: 100, unit: '',
        points: pts,
        markers: [
          { v: s.value, label: `Jar worth $${s.value}`, cls: 'you-mk' },
          { v: s.top, label: `Winning bid $${s.top}`, cls: 'ink-mk' },
        ],
      });
      return { chart, chartNote: 'Each dot is a bid. The outlined dot won.',
        theory: `If you win, it’s probably because your estimate was the most optimistic. With ${s.n} bidders, the top estimate runs about <strong>$${s.shade}</strong> high on average, so bid at least that far below your estimate.`,
        group: s.profit < 0 ? `The winner paid <strong>$${s.top}</strong> for a $${s.value} jar and <strong>lost $${-s.profit}</strong>. Cursed.` : `The winner paid <strong>$${s.top}</strong> for a $${s.value} jar and made <strong>$${s.profit}</strong>. The curse was dodged.`,
        lab: `In Bazerman and Samuelson’s classic MBA classroom study, jars worth $8 drew winning bids averaging about $10. The same trap shows up in oil-lease auctions, IPOs and corporate takeovers.` };
    },
    summary: res => `Winner's curse: jar worth $${res.stats.value}, winning bid $${res.stats.top} (${res.stats.profit < 0 ? 'cursed' : 'profit'} ${money(Math.abs(res.stats.profit))}).`,
  },

  farol: {
    key: 'farol',
    title: 'Friday at the bar',
    short: 'El Farol problem',
    rules: params => `<p>The bar is fun only if it’s not packed. It fits <strong>${params.cap} of you</strong>.</p>
      <p>Go and it’s not crowded: <strong>100 pts</strong>. Stay home: <strong>50 pts</strong>. Go and it’s packed: <strong>0 pts</strong>.</p>
      <p class="muted">Nobody can talk. Everyone decides at once.</p>`,
    makeParams: ids => ({ cap: Math.max(1, Math.floor(ids.length * 0.6)) }),
    input: () => `<div class="choice" role="radiogroup" aria-label="Go or stay home">
      <button type="button" class="choice-btn" data-val="go" role="radio" aria-checked="false">Go out</button>
      <button type="button" class="choice-btn" data-val="stay" role="radio" aria-checked="false">Stay home</button>
    </div>`,
    read(root) {
      const sel = root.querySelector('.choice-btn[aria-checked="true"]');
      return sel ? { value: sel.dataset.val } : { error: 'Pick Go out or Stay home.' };
    },
    describe: v => (v === 'go' ? 'You’re going out' : 'You’re staying home'),
    resolve(params, subs) {
      const goers = Object.keys(subs).filter(k => subs[k] === 'go');
      const crowded = goers.length > params.cap;
      const pts = {}, out = {};
      for (const [pid, v] of Object.entries(subs)) {
        if (v === 'stay') { pts[pid] = 50; out[pid] = `You stayed home. ${goers.length} went out (fits ${params.cap}).`; }
        else if (crowded) { pts[pid] = 0; out[pid] = `You went, along with ${goers.length - 1} others. Packed.`; }
        else { pts[pid] = 100; out[pid] = `You went and it was ${goers.length === params.cap ? 'exactly full' : 'roomy'}. Great night.`; }
      }
      return { pts, out, stats: { went: goers.length, cap: params.cap, n: Object.keys(subs).length, crowded } };
    },
    reveal(params, subs, res, ctx) {
      const s = res.stats;
      const chart = barChart({
        max: Math.max(s.n, 1),
        bars: [{ v: s.went, label: 'Went out', cls: s.crowded ? 'rejected' : '' }, { v: s.n - s.went, label: 'Stayed home' }],
        line: { v: s.cap, label: `Fits ${s.cap}`, cls: 'nash' },
      });
      return { chart,
        theory: `There’s no single right answer. If everyone reasons the same way, everyone makes the same choice and it fails. The equilibrium is to <strong>randomize</strong>, going about 60% of the time.`,
        group: s.crowded ? `<strong>${s.went}</strong> went to a bar that fits ${s.cap}. Packed.` : `<strong>${s.went}</strong> went to a bar that fits ${s.cap}. ${s.went === s.cap ? 'Perfect coordination.' : `${s.cap - s.went} spot${s.cap - s.went > 1 ? 's' : ''} went unused.`}`,
        lab: `Economist W. Brian Arthur posed this in 1994 about a real Santa Fe bar. In his simulations, people using simple rules of thumb kept attendance hovering near the limit with no one in charge, a toy model of how markets coordinate.` };
    },
    summary: res => `El Farol: ${res.stats.went} went, bar fits ${res.stats.cap}${res.stats.crowded ? ' (packed)' : ''}.`,
  },
};

export const GAME_ORDER = ['beauty', 'public', 'ultimatum', 'auction', 'farol'];

export function rngFrom(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
