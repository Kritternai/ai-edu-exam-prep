// Shared helpers: session manifest, quiz loading, best-score storage.
// Paths are resolved against the site root so pages in /sessions/ work too.
const ROOT = new URL(document.currentScript.src, location.href).href.replace(/assets\/site\.js.*$/, "");

const Site = {
  url(path) {
    return ROOT + path;
  },

  async sessions() {
    const res = await fetch(Site.url("data/sessions.json"));
    if (!res.ok) throw new Error("โหลดรายการ session ไม่สำเร็จ");
    return res.json();
  },

  async quiz(session) {
    const res = await fetch(Site.url(session.quiz));
    if (!res.ok) throw new Error(`โหลดข้อสอบ Session ${session.id} ไม่สำเร็จ`);
    const data = await res.json();
    return data.questions.map((q) => ({ ...q, session: session.id }));
  },

  // Best score per exam set, kept only in this browser.
  bestKey(ids) {
    return "best:" + [...ids].sort().join("+");
  },
  getBest(ids) {
    try {
      return JSON.parse(localStorage.getItem(Site.bestKey(ids)) || "null");
    } catch {
      return null;
    }
  },
  saveBest(ids, pct, correct, total) {
    const prev = Site.getBest(ids);
    if (prev && prev.pct >= pct) return;
    try {
      localStorage.setItem(Site.bestKey(ids), JSON.stringify({ pct, correct, total, at: Date.now() }));
    } catch {
      /* storage blocked: best score is a convenience only */
    }
  },

  el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  },
};
