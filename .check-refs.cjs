const fs = require('fs');
const path = require('path');
const issues = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.json')) {
      const c = fs.readFileSync(p, 'utf8');
      let j;
      try { j = JSON.parse(c); } catch { continue; }
      if (!j.id || j.schema !== 0) continue;
      if (!j.units) continue;
      const ups = {};
      for (const u of (j.upgrades || [])) ups[u.id] = u;
      const ids = new Set(Object.keys(j.units));
      for (const fm of (j.formations || [])) {
        for (const u of fm.units || []) {
          const slot = u.oneOf ? u.oneOf : [u.unit];
          for (const s of slot) {
            if (!ids.has(s)) issues.push('DANGLING UNIT in ' + p + ' formation ' + fm.id + ' slot ' + JSON.stringify(u));
          }
        }
        for (const u of fm.upgrades || []) {
          const up = typeof u === 'string' ? ups[u] : ups[(u || {}).upgrade];
          if (!up) issues.push('DANGLING FM UPGRADE in ' + p + ' formation ' + fm.id + ' upgrade ' + JSON.stringify(u));
        }
      }
      for (const u of (j.upgrades || [])) {
        for (const v of u.variants || []) {
          for (const e of v.effects || []) {
            const t = e.unit || e.to;
            if (t && e.op === 'add' && !ids.has(t)) issues.push('DANGLING ADD UNIT in ' + p + ' upgrade ' + u.id + ' effect ' + JSON.stringify(e));
            if (e.from && e.op === 'replace' && !ids.has(e.from)) issues.push('DANGLING REPLACE FROM in ' + p + ' upgrade ' + u.id + ' effect ' + JSON.stringify(e));
          }
        }
      }
    }
  }
}
walk('data/ear-de');
console.log(issues.join('\n') || 'NO DANGLING REFERENCES FOUND');
console.log('total issues:', issues.length);
