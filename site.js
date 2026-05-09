(() => {
  const root = document.documentElement;
  const button = document.querySelector("[data-lang-toggle]");
  const saved = localStorage.getItem("saturnws.lang");
  const setLang = (lang) => {
    root.dataset.lang = lang;
    root.lang = lang;
    document.body.dir = lang === "ar" ? "rtl" : "ltr";
    if (button) button.textContent = lang === "ar" ? "EN" : "AR";
    localStorage.setItem("saturnws.lang", lang);
  };
  setLang(saved === "ar" ? "ar" : "en");
  button?.addEventListener("click", () => setLang(root.dataset.lang === "ar" ? "en" : "ar"));
})();
