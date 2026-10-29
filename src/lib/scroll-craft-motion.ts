const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function initScrollCraftMotion(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }

  const media = window.matchMedia(REDUCED_MOTION);
  if (media.matches || typeof IntersectionObserver === "undefined") {
    return () => undefined;
  }

  const root = document.documentElement;
  root.classList.add("sc-motion-ready");

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add("sc-visible");
          observer.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -4% 0px" },
  );

  const observe = (node: Node) => {
    if (!(node instanceof Element)) return;
    if (node.matches("[data-scroll-reveal]")) observer.observe(node);
    node.querySelectorAll("[data-scroll-reveal]").forEach((element) => observer.observe(element));
  };

  observe(document.body);
  const mutations = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach(observe);
    }
  });
  mutations.observe(document.body, { childList: true, subtree: true });

  const stopForReducedMotion = (event: MediaQueryListEvent) => {
    if (!event.matches) return;
    root.classList.remove("sc-motion-ready");
    document.querySelectorAll("[data-scroll-reveal]").forEach((element) => element.classList.add("sc-visible"));
    observer.disconnect();
    mutations.disconnect();
  };
  media.addEventListener("change", stopForReducedMotion);

  return () => {
    media.removeEventListener("change", stopForReducedMotion);
    observer.disconnect();
    mutations.disconnect();
    root.classList.remove("sc-motion-ready");
  };
}
