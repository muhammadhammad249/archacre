/* ============================================================
   ARCH ACRE — shared script
   Transparent→solid header, reveal-on-scroll, line-draw rules,
   stat counters, mobile menu, inquiry form
   ============================================================ */
(function () {
  "use strict";
  document.documentElement.classList.add("js");

  function onReady(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  onReady(function () {
    /* ---------- hero entrance ---------- */
    function go() { document.body.classList.add("loaded"); }
    if (document.readyState === "complete") go();
    else {
      window.addEventListener("load", go);
      setTimeout(go, 900); // never trap the headline
    }

    /* ---------- header: transparent over hero → solid on scroll ---------- */
    var head = document.querySelector(".site-head");
    var hasHero = !!document.querySelector(".hero, .dark-hero");
    function syncHead() {
      if (!head) return;
      var solid = hasHero ? (window.scrollY > 40) : true;
      head.classList.toggle("solid", solid);
    }
    syncHead();
    window.addEventListener("scroll", syncHead, { passive: true });

    /* ---------- mobile menu ---------- */
    var btn = document.getElementById("menuBtn");
    var mnav = document.getElementById("mobileNav");
    var mclose = document.getElementById("mClose");
    if (head && btn && mnav && mclose && typeof mnav.showModal === "function") {
      var mobileViewport = window.matchMedia("(max-width: 960px)");
      head.classList.add("menu-ready");
      btn.addEventListener("click", function () {
        mnav.showModal();
        btn.setAttribute("aria-expanded", "true");
        document.body.classList.add("menu-open");
      });
      mclose.addEventListener("click", function () { mnav.close(); });
      mnav.querySelectorAll("a").forEach(function (a) {
        a.addEventListener("click", function () { mnav.close(); });
      });
      mnav.addEventListener("close", function () {
        btn.setAttribute("aria-expanded", "false");
        document.body.classList.remove("menu-open");
        var returnFocus = mobileViewport.matches ? btn : head.querySelector(".brand");
        if (returnFocus) returnFocus.focus({ preventScroll: true });
      });
      mobileViewport.addEventListener("change", function (ev) {
        if (!ev.matches && mnav.open) mnav.close();
      });
    }

    /* ---------- reveal on scroll ---------- */
    var revealEls = document.querySelectorAll(".rv, .rule-draw");
    if ("IntersectionObserver" in window && revealEls.length) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
      revealEls.forEach(function (el) { io.observe(el); });
    } else {
      revealEls.forEach(function (el) { el.classList.add("in"); });
    }

    /* ---------- stat counters ---------- */
    var counters = document.querySelectorAll("[data-count]");
    if ("IntersectionObserver" in window && counters.length) {
      var cio = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          var el = e.target;
          cio.unobserve(el);
          var target = parseFloat(el.getAttribute("data-count"));
          var dur = 1400, t0 = null;
          var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          if (reduce) { el.textContent = target; return; }
          function step(ts) {
            if (!t0) t0 = ts;
            var p = Math.min((ts - t0) / dur, 1);
            var eased = 1 - Math.pow(1 - p, 3);
            el.textContent = Math.round(target * eased);
            if (p < 1) requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
        });
      }, { threshold: 0.4 });
      counters.forEach(function (el) { cio.observe(el); });
    }

    /* ---------- hide floating buttons over contact block ---------- */
    var fl = document.getElementById("float");
    var ct = document.getElementById("contact");
    if (fl && ct && "IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        fl.classList.toggle("hide", entries[0].isIntersecting);
      }, { threshold: 0.12 }).observe(ct);
    }

    /* ---------- year ---------- */
    var yr = document.getElementById("yr");
    if (yr) yr.textContent = new Date().getFullYear();

    /* ---------- contact inquiries ---------- */
    var form = document.getElementById("enquiry");
    if (form) {
      var status = document.getElementById("formStatus");
      var submitBtn = form.querySelector('button[type="submit"]');
      var submitLabel = submitBtn.textContent;
      var managedForm = form.getAttribute("action") === "/api/inquiries";
      var submission = form.elements.namedItem("submission_id");
      var contactEmail = form.getAttribute("data-contact-email") || "archacre@gmail.com";
      var fallback = "Something went wrong while sending. Please try again, or email us directly at " + contactEmail + ".";
      function show(msg, ok) {
        status.className = "form-status " + (ok ? "ok" : "err");
        status.textContent = msg;
      }
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        if (submitBtn.disabled) return;
        status.textContent = "";
        status.className = "form-status";
        submitBtn.disabled = true;
        submitBtn.textContent = "Sending…";
        fetch(form.action, {
          method: "POST",
          body: new FormData(form),
          headers: { "Accept": "application/json" },
          signal: typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
            ? AbortSignal.timeout(25000)
            : undefined
        }).then(function (r) {
          if (r.ok) {
            show("Thank you — your enquiry has been received. We usually reply within one working day.", true);
            form.reset();
            if (submission) {
              submission.value = window.crypto?.randomUUID?.() || "";
            }
          } else if (managedForm) {
            return r.json().then(function (body) {
              if (r.status >= 500) return show(fallback, false);
              var message = body && typeof body.message === "string" ? body.message : fallback;
              show(message, false);
            }, function () {
              show(fallback, false);
            });
          } else {
            show(fallback, false);
          }
        }).catch(function () {
          show(fallback, false);
        }).finally(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = submitLabel;
        });
      });
    }
  });
})();
