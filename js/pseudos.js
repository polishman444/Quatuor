// =====================================================================
// Quatuor · pseudos : format, filtre des mots interdits (FR + EN), pseudo proposé, code ami
// ⚠️ Le serveur applique EXACTEMENT le même filtre (supabase/migrations/0002, fonction pseudo_interdit,
//    table mots_interdits) : les tests vérifient que les listes et les résultats concordent.
// =====================================================================
(function (racine, fabrique) {
  const m = fabrique();
  if (typeof module === "object" && module.exports) module.exports = m; else racine.QuatuorPseudos = m;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 3 à 16 caractères : lettres (accents compris), chiffres, tiret, underscore
  const FORMAT = /^[A-Za-zÀ-ÖØ-öø-ÿ0-9_-]{3,16}$/;

  // Mots interdits, sans accents ni majuscules.
  // PARTOUT : interdits même au milieu d'un pseudo (mots longs, sans ambiguïté).
  // MOTS    : interdits seulement comme mot entier (séparé par - _ un chiffre ou une majuscule : « GrosCon », « con_42 »),
  //           car on les trouve dans des mots innocents (« con » dans Constance, « cul » dans Hercule…).
  const PARTOUT = [
    // français
    "connard", "connasse", "salope", "salopard", "salaud", "encule", "enculer", "putain", "batard", "enfoire",
    "tafiole", "gouine", "negre", "negresse", "bougnoul", "youpin", "couille", "branleur", "branlette", "branler", "pouffiasse",
    "poufiasse", "trisomique", "attarde", "pedophile", "pedophil", "zoophile", "violeur", "merdeux", "merde", "fdp", "ntm",
    "tamere", "tagueule", "suceur", "suceuse", "grossepute", "filsdepute", "porno",
    // anglais
    "fuck", "shit", "bitch", "bastard", "asshole", "cunt", "pussy", "whore", "slut", "faggot", "nigger", "nigga", "retarded",
    "rapist", "porn", "dildo", "wank", "twat", "jizz", "cumshot", "blowjob", "handjob", "hentai",
    // haine
    "hitler", "nazi", "kkk", "jihad", "siegheil", "heilhitler"
  ];
  const MOTS = [
    // français
    "con", "cons", "conne", "cul", "nique", "niquer", "pute", "putes", "pd", "pede", "tapette", "bite", "chatte", "suce", "sucer", "abruti", "debile",
    "cretin", "mongol", "triso", "pedo", "viol", "sexe", "zizi", "penis", "vagin", "fion", "teub", "keuf", "salo", "bouffon",
    // anglais
    "fck", "fuk", "ass", "dick", "cock", "fag", "rape", "sex", "tits", "boobs", "anal", "cum", "nazis",
    // usurpation (rôle officiel)
    "admin", "administrateur", "moderateur", "modo", "staff", "support", "officiel", "quatuor"
  ];

  // Normalisation (identique à la version SQL) : majuscule après minuscule → espace (mots collés),
  // accents retirés, minuscules ; variante « leet » (0→o, 1→i, 3→e, 4→a, 5→s, 7→t, 8→b, @→a, $→s).
  const AVEC = "ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ";
  const SANS = "AAAAAAACEEEEIIIIDNOOOOOOUUUUYTsaaaaaaaceeeeiiiidnoooooouuuuyty";
  const LEET_DE = "0134578@$", LEET_EN = "oieastbas";
  const traduire = (s, de, en) => [...s].map(c => { const i = de.indexOf(c); return i < 0 ? c : en[i]; }).join("");
  function analyser(p) {
    const separe = String(p || "").replace(/([a-zà-ÿ])([A-ZÀ-Þ])/g, "$1 $2");
    const brut = traduire(separe, AVEC, SANS).toLowerCase();
    const leet = traduire(brut, LEET_DE, LEET_EN);
    const continu = leet.replace(/[^a-z]/g, "");
    const jetons = new Set([...brut.split(/[^a-z]+/), ...leet.split(/[^a-z]+/)].filter(Boolean));
    return { continu, jetons };
  }
  function interdit(p) {
    const { continu, jetons } = analyser(p);
    return PARTOUT.some(m => continu.includes(m)) || MOTS.some(m => jetons.has(m));
  }
  // { ok:true } ou { ok:false, raison:"vide"|"court"|"long"|"caracteres"|"interdit", message }
  function valider(p) {
    p = String(p || "").trim();
    const non = (raison, message) => ({ ok: false, raison, message });
    if (!p) return non("vide", "Choisis un pseudo.");
    if (p.length < 3) return non("court", "3 caractères minimum.");
    if (p.length > 16) return non("long", "16 caractères maximum.");
    if (!FORMAT.test(p)) return non("caracteres", "Lettres, chiffres, tiret et underscore uniquement.");
    if (interdit(p)) return non("interdit", "Ce pseudo n'est pas autorisé.");
    return { ok: true, pseudo: p };
  }

  // Pseudo proposé : animal + adjectif accordé + 2 chiffres (« RenardMalin42 », « LoutreRusée07 »)
  const ANIMAUX = [["Renard", 0], ["Loutre", 1], ["Hibou", 0], ["Panda", 0], ["Koala", 0], ["Tigre", 0], ["Baleine", 1], ["Lynx", 0],
    ["Castor", 0], ["Chouette", 1], ["Pingouin", 0], ["Tortue", 1], ["Lama", 0], ["Gazelle", 1], ["Dauphin", 0], ["Abeille", 1],
    ["Faucon", 0], ["Girafe", 1], ["Ours", 0], ["Fourmi", 1], ["Hérisson", 0], ["Mouette", 1], ["Lapin", 0], ["Pieuvre", 1]];
  const ADJECTIFS = [["Malin", "Maligne"], ["Rusé", "Rusée"], ["Futé", "Futée"], ["Agile", "Agile"], ["Curieux", "Curieuse"],
    ["Rapide", "Rapide"], ["Joyeux", "Joyeuse"], ["Savant", "Savante"], ["Zen", "Zen"], ["Vif", "Vive"], ["Brillant", "Brillante"],
    ["Têtu", "Têtue"], ["Calme", "Calme"], ["Habile", "Habile"], ["Sage", "Sage"], ["Génial", "Géniale"], ["Lucide", "Lucide"]];
  function proposer(alea = Math.random) {
    for (let essai = 0; essai < 50; essai++) {
      const [animal, f] = ANIMAUX[Math.floor(alea() * ANIMAUX.length)], adj = ADJECTIFS[Math.floor(alea() * ADJECTIFS.length)][f];
      const p = animal + adj + String(Math.floor(alea() * 100)).padStart(2, "0");
      if (valider(p).ok) return p;
    }
    return "Joueur" + String(Math.floor(alea() * 1e6)).padStart(6, "0");
  }

  // Code ami : 6 caractères faciles à lire (sans 0/O ni 1/I) ; saisie tolérante (espaces, tirets, minuscules)
  const ALPHABET_CODE = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const nettoyerCode = s => String(s || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  const codeValide = s => /^[2-9A-HJ-NP-Z]{6}$/.test(s);

  // Avatars (index enregistré dans profils.avatar)
  const AVATARS = ["🦊", "🐼", "🐨", "🦁", "🐯", "🐸", "🐵", "🦉", "🐙", "🦄", "🐢", "🐧", "🐰", "🐻", "🦋", "🐳"];

  return { FORMAT, PARTOUT, MOTS, analyser, interdit, valider, proposer, ALPHABET_CODE, nettoyerCode, codeValide, AVATARS };
});
