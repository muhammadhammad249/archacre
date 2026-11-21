(() => {
  const section = document.querySelector(".home-projects");
  if (!section) return;

  const panel = section.querySelector(".home-projects-panel");
  const photos = section.querySelector(".home-projects-photos");
  const cards = [...photos.querySelectorAll(".home-projects-card")];
  if (cards.length < 2) return;

  const navigation = section.querySelector(".home-projects-navigation");
  const indexList = navigation.querySelector(".home-projects-index");
  let current = -1;
  let previous = -1;
  let scrollStep = 0;
  let stickyTop = 0;
  let frame = 0;
  let swipe = null;

  const buttons = cards.map((card, index) => {
    card.setAttribute("aria-hidden", "true");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = card.querySelector("figcaption").textContent;
    button.addEventListener("click", () => scrollToProject(index));
    indexList.append(button);
    return button;
  });

  function selectProject(index) {
    if (index === current) return;
    if (previous >= 0) cards[previous].classList.remove("is-previous");
    if (current >= 0) {
      cards[current].classList.replace("is-active", "is-previous");
      cards[current].setAttribute("aria-hidden", "true");
      buttons[current].removeAttribute("aria-current");
      section.classList.toggle("is-reversing", index < current);
      section.classList.add("is-shifting");
    }
    previous = current;
    current = index;
    cards[current].classList.add("is-active");
    cards[current].removeAttribute("aria-hidden");

    const button = buttons[current];
    button.setAttribute("aria-current", "true");
    const railBounds = indexList.getBoundingClientRect();
    const buttonBounds = button.getBoundingClientRect();
    if (buttonBounds.left < railBounds.left || buttonBounds.right > railBounds.right) {
      indexList.scrollLeft += buttonBounds.left - railBounds.left - (railBounds.width - buttonBounds.width) / 2;
    }
  }

  function updatePosition() {
    const distance = stickyTop - section.getBoundingClientRect().top;
    const index = Math.round(distance / scrollStep);
    selectProject(Math.max(0, Math.min(cards.length - 1, index)));
  }

  function requestUpdate() {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      updatePosition();
    });
  }

  function measure() {
    stickyTop = parseFloat(getComputedStyle(panel).top);
    scrollStep = Math.round(Math.min(270, Math.max(170, panel.clientHeight * 0.29)));
    section.style.setProperty("--project-scroll-length", `${scrollStep * (cards.length - 1)}px`);
    updatePosition();
  }

  function scrollToProject(index) {
    if (index < 0 || index >= cards.length) return;
    const start = window.scrollY + section.getBoundingClientRect().top - stickyTop;
    window.scrollTo({ top: start + index * scrollStep, behavior: "instant" });
    selectProject(index);
  }

  photos.addEventListener("pointerdown", (event) => {
    if (event.isPrimary && event.pointerType === "touch") {
      swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }
  });
  photos.addEventListener("pointerup", (event) => {
    if (!swipe || swipe.id !== event.pointerId) return;
    const horizontal = event.clientX - swipe.x;
    const vertical = event.clientY - swipe.y;
    swipe = null;
    if (Math.abs(horizontal) >= 48 && Math.abs(horizontal) > Math.abs(vertical) * 1.35) {
      scrollToProject(current + Math.sign(horizontal));
    }
  });
  photos.addEventListener("pointercancel", () => { swipe = null; });

  section.classList.add("scroll-linked");
  photos.removeAttribute("tabindex");
  navigation.hidden = false;
  measure();
  window.addEventListener("scroll", requestUpdate, { passive: true });
  new ResizeObserver(measure).observe(panel);
})();
