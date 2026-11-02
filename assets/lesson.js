// Builds the slide index of a full lesson page from its <section class="slide" data-n="…"> blocks.
(() => {
  const list = document.getElementById("lessonToc");
  if (!list) return;
  for (const sec of document.querySelectorAll("section.slide")) {
    const h = sec.querySelector("h2");
    if (!sec.id || !h) continue;
    const a = document.createElement("a");
    a.href = "#" + sec.id;
    const n = document.createElement("span");
    n.className = "n";
    n.textContent = sec.dataset.n || "";
    a.append(n, h.textContent);
    const li = document.createElement("li");
    li.append(a);
    list.append(li);
  }
})();
