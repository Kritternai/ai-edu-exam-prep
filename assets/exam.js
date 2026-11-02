// Exam mode: pick sessions, draw shuffled questions, run in practice or exam mode, review results.
(() => {
  const { el } = Site;
  const $ = (id) => document.getElementById(id);
  const KEYS = ["ก", "ข", "ค", "ง", "จ"];

  const views = { setup: $("viewSetup"), run: $("viewRun"), result: $("viewResult") };
  function show(name) {
    for (const [k, v] of Object.entries(views)) v.hidden = k !== name;
    window.scrollTo({ top: 0 });
  }

  let sessions = [];
  let bank = new Map(); // session id -> questions
  let exam = null; // { items, mode, ids, idx, startedAt, finishedAt, partial }
  let timerId = null;

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Shuffle a question's choices and remember where the right one landed.
  function prepare(q) {
    const order = shuffle(q.choices.map((_, i) => i));
    return {
      q,
      choices: order.map((i) => q.choices[i]),
      correct: order.indexOf(q.answer),
      picked: null,
    };
  }

  // ---------- setup ----------
  async function initSetup() {
    const want = new URLSearchParams(location.search).getAll("s").flatMap((v) => v.split(","));
    try {
      sessions = await Site.sessions();
    } catch (err) {
      $("sessionOpts").replaceChildren(el("p", { class: "hint" }, err.message));
      return;
    }
    const withQuiz = sessions.filter((s) => s.quiz);
    await Promise.all(
      withQuiz.map((s) =>
        Site.quiz(s)
          .then((qs) => bank.set(s.id, qs))
          .catch(() => bank.set(s.id, []))
      )
    );
    const anyWanted = want.some((id) => bank.get(id)?.length);
    $("sessionOpts").replaceChildren(
      ...sessions.map((s) => {
        const n = bank.get(s.id)?.length || 0;
        const checked = n > 0 && (anyWanted ? want.includes(s.id) : true);
        return el("label", { class: "opt" },
          el("input", { type: "checkbox", name: "session", value: s.id, id: "ses" + s.id, checked, disabled: n === 0 }),
          el("span", {}, `Session ${s.id} · ${s.en}`, el("small", {}, n ? `${s.title} · ${n} ข้อ` : "ยังไม่มีข้อสอบ"))
        );
      })
    );
    updateHint();
  }

  function selectedIds() {
    return [...document.querySelectorAll('input[name="session"]:checked')].map((i) => i.value);
  }

  function updateHint() {
    const ids = selectedIds();
    const total = ids.reduce((n, id) => n + (bank.get(id)?.length || 0), 0);
    $("btnStart").disabled = total === 0;
    $("setupHint").textContent = total ? `มีข้อสอบในคลัง ${total} ข้อจาก ${ids.length} session` : "เลือกอย่างน้อย 1 session ที่มีข้อสอบ";
  }

  $("setupForm").addEventListener("change", updateHint);
  $("setupForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const ids = selectedIds();
    const count = new FormData(e.target).get("count");
    const mode = new FormData(e.target).get("mode");
    const pool = ids.flatMap((id) => bank.get(id) || []);
    if (!pool.length) return;
    const n = count === "all" ? pool.length : Math.min(Number(count), pool.length);
    start(shuffle(pool).slice(0, n), mode, ids, false);
  });

  // ---------- runner ----------
  function start(questions, mode, ids, partial) {
    exam = {
      items: questions.map(prepare),
      mode,
      ids,
      partial,
      idx: 0,
      startedAt: Date.now(),
      finishedAt: null,
    };
    $("runMode").textContent = mode === "practice" ? "ฝึกทำ" : "สอบจริง";
    $("confirmBox").hidden = true;
    clearInterval(timerId);
    timerId = setInterval(tick, 1000);
    tick();
    show("run");
    renderQuestion();
  }

  function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }
  function tick() {
    if (exam) $("runTimer").textContent = fmtTime(Date.now() - exam.startedAt);
  }

  function locked(item) {
    return exam.mode === "practice" && item.picked !== null;
  }

  function renderQuestion() {
    const { items, idx } = exam;
    const item = items[idx];
    const answered = items.filter((it) => it.picked !== null).length;
    $("runCounter").textContent = `ข้อ ${idx + 1} / ${items.length} · ตอบแล้ว ${answered}`;
    $("runProgress").style.width = (answered / items.length) * 100 + "%";
    $("qTag").textContent = `Session ${item.q.session}` + (item.q.ref ? ` · ${item.q.ref}` : "");
    $("qText").textContent = `${idx + 1}. ${item.q.q}`;

    const isLocked = locked(item);
    $("qChoices").replaceChildren(
      ...item.choices.map((text, i) => {
        let cls = "choice";
        if (isLocked) {
          if (i === item.correct) cls += " correct";
          else if (i === item.picked) cls += " wrong";
        } else if (i === item.picked) cls += " picked";
        return el("button", { type: "button", class: cls, disabled: isLocked, "aria-pressed": String(i === item.picked), onclick: () => pick(i) },
          el("span", { class: "key" }, KEYS[i]),
          el("span", {}, text)
        );
      })
    );

    const ex = $("qExplain");
    if (isLocked) {
      const ok = item.picked === item.correct;
      ex.replaceChildren(
        el("div", { class: "verdict " + (ok ? "ok" : "no") }, ok ? "ถูกต้อง" : `ยังไม่ถูก · คำตอบคือ ${KEYS[item.correct]}. ${item.choices[item.correct]}`),
        el("div", {}, item.q.explain)
      );
      ex.hidden = false;
    } else {
      ex.hidden = true;
    }

    $("btnPrev").disabled = idx === 0;
    const last = idx === items.length - 1;
    $("btnNext").textContent = last ? "ดูผล" : "ถัดไป →";
    $("btnNext").dataset.last = last ? "1" : "";
    $("btnSubmit").hidden = last; // on the last question "ดูผล" already submits
    renderNav();
  }

  function renderNav() {
    $("navGrid").replaceChildren(
      ...exam.items.map((it, i) => {
        let cls = "";
        if (it.picked !== null) cls = locked(it) ? (it.picked === it.correct ? "ok" : "no") : "done";
        if (i === exam.idx) cls += " cur";
        return el("button", { type: "button", class: cls.trim(), "aria-label": `ไปข้อ ${i + 1}`, onclick: () => go(i) }, i + 1);
      })
    );
  }

  function pick(i) {
    const item = exam.items[exam.idx];
    if (locked(item)) return;
    item.picked = i;
    renderQuestion();
  }

  function go(i) {
    if (!exam) return;
    exam.idx = Math.max(0, Math.min(exam.items.length - 1, i));
    $("confirmBox").hidden = true;
    renderQuestion();
  }

  function askSubmit() {
    const left = exam.items.filter((it) => it.picked === null).length;
    if (left === 0) return finish();
    $("confirmText").textContent = `ยังไม่ได้ตอบ ${left} ข้อ ข้อที่ไม่ตอบจะนับว่าผิด ต้องการส่งเลยหรือไม่`;
    $("confirmBox").hidden = false;
    $("btnConfirm").focus();
  }

  $("btnPrev").addEventListener("click", () => go(exam.idx - 1));
  $("btnNext").addEventListener("click", () => ($("btnNext").dataset.last ? askSubmit() : go(exam.idx + 1)));
  $("btnSubmit").addEventListener("click", askSubmit);
  $("btnConfirm").addEventListener("click", finish);
  $("btnCancel").addEventListener("click", () => ($("confirmBox").hidden = true));

  document.addEventListener("keydown", (e) => {
    if (views.run.hidden || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest("input, select, textarea")) return;
    const n = Number(e.key);
    if (n >= 1 && n <= exam.items[exam.idx].choices.length) {
      pick(n - 1);
    } else if (e.key === "ArrowRight") {
      go(exam.idx + 1);
    } else if (e.key === "ArrowLeft") {
      go(exam.idx - 1);
    }
  });

  // ---------- result ----------
  function finish() {
    clearInterval(timerId);
    exam.finishedAt = Date.now();
    const { items } = exam;
    const correct = items.filter((it) => it.picked === it.correct).length;
    const skipped = items.filter((it) => it.picked === null).length;
    const total = items.length;
    const pct = Math.round((correct / total) * 100);

    if (!exam.partial) Site.saveBest(exam.ids, pct, correct, total);
    const best = Site.getBest(exam.ids);

    $("resEyebrow").textContent = (exam.partial ? "ผลทำข้อที่ผิดซ้ำ" : "ผลสอบ") + ` · Session ${exam.ids.join(", ")}`;
    $("resPct").textContent = pct + "%";
    $("resOf").textContent = `ถูก ${correct} จาก ${total} ข้อ`;
    $("resMsg").textContent =
      pct >= 80 ? "แม่นแล้ว ทบทวนข้อที่พลาดอีกนิดก็พร้อมสอบ" :
      pct >= 60 ? "เข้าใจภาพรวมแล้ว กลับไปอ่านหัวข้อของข้อที่ผิดแล้วลองใหม่" :
      "ยังไม่แน่น อ่านสรุปอีกรอบแล้วลองทำเฉพาะข้อที่ผิด";

    const stats = [
      ["ถูก", correct],
      ["ผิด", total - correct - skipped],
      ["ไม่ได้ตอบ", skipped],
      ["เวลา", fmtTime(exam.finishedAt - exam.startedAt)],
    ];
    if (best && !exam.partial) stats.push(["คะแนนดีสุดชุดนี้", `${best.correct}/${best.total}`]);
    if (exam.ids.length > 1) {
      for (const id of exam.ids) {
        const mine = items.filter((it) => it.q.session === id);
        if (mine.length) stats.push([`Session ${id}`, `${mine.filter((it) => it.picked === it.correct).length}/${mine.length}`]);
      }
    }
    $("resStats").replaceChildren(
      ...stats.map(([k, v]) => el("div", { class: "stat" }, el("div", { class: "k" }, k), el("div", { class: "v" }, v)))
    );

    $("btnRetryWrong").disabled = correct === total;
    renderReview("all");
    show("result");
  }

  function renderReview(filter) {
    $("fAll").classList.toggle("ghost", filter === "all");
    $("fWrong").classList.toggle("ghost", filter === "no");
    const rows = exam.items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => filter === "all" || it.picked !== it.correct);
    $("resReview").replaceChildren(
      ...(rows.length
        ? rows.map(({ it, i }) => {
            const ok = it.picked === it.correct;
            return el("div", { class: "review-item " + (ok ? "ok" : "no") },
              el("div", { class: "q-tag" }, `ข้อ ${i + 1} · Session ${it.q.session}` + (it.q.ref ? ` · ${it.q.ref}` : "")),
              el("div", { style: "font-weight:500" }, it.q.q),
              el("div", { class: "ans-line" }, "คุณตอบ: ", el("b", {}, it.picked === null ? "ไม่ได้ตอบ" : `${KEYS[it.picked]}. ${it.choices[it.picked]}`)),
              ok ? null : el("div", { class: "ans-line" }, "เฉลย: ", el("b", {}, `${KEYS[it.correct]}. ${it.choices[it.correct]}`)),
              el("div", {}, it.q.explain)
            );
          })
        : [el("p", { class: "hint" }, "ไม่มีข้อผิด")])
    );
  }

  $("fAll").addEventListener("click", () => renderReview("all"));
  $("fWrong").addEventListener("click", () => renderReview("no"));
  $("btnRetryWrong").addEventListener("click", () => {
    const wrong = exam.items.filter((it) => it.picked !== it.correct).map((it) => it.q);
    if (wrong.length) start(shuffle(wrong), exam.mode, exam.ids, true);
  });
  $("btnAgain").addEventListener("click", () => {
    const pool = exam.ids.flatMap((id) => bank.get(id) || []);
    const n = exam.partial ? Math.min(20, pool.length) : exam.items.length;
    start(shuffle(pool).slice(0, n), exam.mode, exam.ids, false);
  });
  $("btnSetup").addEventListener("click", () => {
    exam = null;
    show("setup");
  });

  initSetup();
})();
