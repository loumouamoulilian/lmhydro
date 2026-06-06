const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const zoneData = {
  dense: { c: 0.78, label: "Poto-Poto / Bacongo", range: "0.70 - 0.90" },
  residentiel: { c: 0.60, label: "Ouenzé / Talangaï", range: "0.50 - 0.70" },
  admin: { c: 0.90, label: "Administratif / bitumé", range: "0.85 - 0.95" },
  collines: { c: 0.32, label: "Kinsoundi / savanes", range: "0.20 - 0.40" },
  manuel: { c: 0.65, label: "Coefficient manuel", range: "saisie libre" }
};

const steelDiameters = [8, 10, 12, 14, 16, 20, 25];
const spacings = [300, 250, 200, 175, 150, 125, 100];
const standardDiameters = [300, 400, 500, 600, 800, 1000, 1200, 1500, 1800, 2000];

const state = {
  hydro: {},
  section: {},
  steel: {},
  plan: ""
};

function n(id) {
  return Number($(`#${id}`).value) || 0;
}

function roundUp(value, step = 0.05) {
  return Math.ceil((value - 1e-9) / step) * step;
}

function fmt(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : "-";
}

function tcKirpichMinutes(L, S) {
  return 0.01923 * Math.pow(L, 0.77) * Math.pow(S, -0.385);
}

function rainfallIntensity(tc, T, a = 660, b = 0.5) {
  const safeTc = Math.max(tc, 1);
  return a * Math.pow(safeTc, -b);
}

function calculateHydrology(animated = true) {
  const zone = zoneData[$("#zone").value];
  const C = Math.min(0.98, Math.max(0.05, n("runoffC")));
  const A = n("areaHa");
  const areaKm2 = A / 100;
  const T = n("returnPeriod");
  const L = n("lengthL");
  const S = n("slopeS");
  const intensityA = n("intensityA") || 660;
  const intensityB = n("intensityB") || 0.5;
  const tc = $("#tcMode").value === "manual" ? Math.max(1, n("tcManual")) : tcKirpichMinutes(L, S);
  const i = rainfallIntensity(tc, T, intensityA, intensityB);
  const qpRaw = 0.278 * C * i * areaKm2;
  const margin = $("#sedimentMargin").checked ? 1.2 : 1;
  const qp = qpRaw * margin;

  state.hydro = { zone: zone.label, range: zone.range, C, A, areaKm2, T, L, S, tc, intensityA, intensityB, i, qpRaw, margin, qp, formuleQp: "Qp = 0,278 x C x I10 x S(km2)" };
  $("#designQp").value = fmt(qp, 3);
  updateHydroUI(animated);
  drawIdfChart();
  updateReport();
  drawRain();
  drawHeroCanvas();
  return state.hydro;
}

function updateHydroUI(animated) {
  const h = state.hydro;
  animateNumber($("#qpValue"), Number($("#qpValue").textContent) || 0, h.qp, animated ? 650 : 0);
  $("#heroQp").textContent = fmt(h.qp, 2);
  $("#flowBar").style.width = `${Math.min(100, h.qp * 18)}%`;
  $(".result-ring").style.setProperty("--angle", `${Math.min(340, 40 + h.qp * 35)}deg`);
  $("#idfPoint").textContent = `tc ${fmt(h.tc, 1)} min - i ${fmt(h.i, 1)} mm/h`;
  $("#hydroMetrics").innerHTML = [
    ["tc", `${fmt(h.tc, 1)} min`],
    ["I10", `${fmt(h.i, 1)} mm/h`],
    ["S", `${fmt(h.areaKm2, 3)} km2`],
    ["Qp = 0,278.C.I10.S", `${fmt(h.qpRaw, 3)} m3/s`],
    ["a / b", `${fmt(h.intensityA, 0)} / ${fmt(h.intensityB, 2)}`],
    ["Marge", `${fmt((h.margin - 1) * 100, 0)} %`],
    ["Zone", h.zone],
    ["Plage C", h.range]
  ].map(([label, value]) => `<div class="metric"><strong>${value}</strong><span>${label}</span></div>`).join("");

  const warnings = [];
  if (h.A > 400) warnings.push(["critical", "Bassin > 400 ha : la méthode rationnelle devient peu fiable, préférer Caquot ou modèle hydrologique."]);
  else if (h.A > 100) warnings.push(["critical", "Bassin > 100 ha : vérifier le découpage en sous-bassins et la synchronisation des hydrogrammes."]);
  if (h.tc < 5) warnings.push(["critical", "tc très court : risque de surestimation de l'intensité, contrôler longueur et pente."]);
  if (h.margin > 1) warnings.push(["ok", "Marge sédimentation activée : Qp majoré de 20% pour les sols érosifs de Brazzaville."]);
  if (!warnings.length) warnings.push(["ok", "Paramètres cohérents pour un pré-dimensionnement de caniveau urbain."]);
  $("#warnings").innerHTML = warnings.map(([type, text]) => `<div class="warning ${type}">${text}</div>`).join("");
}

function drawIdfChart() {
  const svg = $("#idfChart");
  const periods = [2, 5, 10, 25, 50];
  const colors = ["#2fb7a5", "#f3bf5b", "#c96f43", "#f25f5c", "#8cc8ff"];
  const w = 900, h = 420, pad = 54;
  const durations = Array.from({ length: 90 }, (_, i) => i + 1);
  const a = n("intensityA") || 660;
  const b = n("intensityB") || 0.5;
  const intensities = periods.flatMap((T) => durations.map((d) => rainfallIntensity(d, T, a, b)));
  const maxI = Math.ceil(Math.max(...intensities) / 20) * 20;
  const x = (d) => pad + (d - 1) * (w - pad * 2) / 89;
  const y = (i) => h - pad - i * (h - pad * 2) / maxI;
  const grid = [0, .25, .5, .75, 1].map((p) => {
    const yy = pad + p * (h - pad * 2);
    const val = Math.round(maxI * (1 - p));
    return `<line class="grid" x1="${pad}" x2="${w - pad}" y1="${yy}" y2="${yy}"/><text x="12" y="${yy + 4}">${val}</text>`;
  }).join("");
  const curves = periods.map((T, idx) => {
    const d = durations.map((dur, i) => `${i ? "L" : "M"} ${x(dur)} ${y(rainfallIntensity(dur, T, a, b))}`).join(" ");
    return `<path class="curve" d="${d}" stroke="${colors[idx]}"/><text x="${w - pad + 8}" y="${y(rainfallIntensity(90, T, a, b)) + 4}" fill="${colors[idx]}">T${T}</text>`;
  }).join("");
  const hp = state.hydro;
  const px = x(Math.min(90, Math.max(1, hp.tc || 1)));
  const py = y(Math.min(maxI, hp.i || 0));
  svg.innerHTML = `
    ${grid}
    <line class="axis" x1="${pad}" x2="${w - pad}" y1="${h - pad}" y2="${h - pad}"/>
    <line class="axis" x1="${pad}" x2="${pad}" y1="${pad}" y2="${h - pad}"/>
    ${curves}
    <line x1="${px - 13}" x2="${px + 13}" y1="${py}" y2="${py}" stroke="#ffffff" stroke-width="3"/>
    <line x1="${px}" x2="${px}" y1="${py - 13}" y2="${py + 13}" stroke="#ffffff" stroke-width="3"/>
    <circle cx="${px}" cy="${py}" r="7" fill="#111716" stroke="#ffffff" stroke-width="3"/>
    <text x="${pad}" y="${h - 14}">Durée t (min)</text>
    <text x="${pad}" y="24">Intensité i (mm/h)</text>`;
}

function hydraulicCapacityRect(b, h, K, I, fill = 1) {
  const y = h * fill;
  const area = b * y;
  const perimeter = b + 2 * y;
  const rh = area / perimeter;
  const q = K * area * Math.pow(rh, 2 / 3) * Math.sqrt(I);
  return { q, area, rh, velocity: q / area, y };
}

function hydraulicCapacityCircular(D, K, I, fill = 1) {
  const area = Math.PI * D * D / 4 * fill;
  const rh = D / 4;
  const q = K * area * Math.pow(rh, 2 / 3) * Math.sqrt(I);
  return { q, area, rh, velocity: q / area };
}

function sectionOversize(capacity, Qp) {
  return Qp > 0 ? (capacity / Qp - 1) * 100 : 0;
}

function optimizeRectangularSection(Qp, K, I, fill, imposedB) {
  const maxCapacity = Qp * 1.25;
  const minSize = 0.25;
  const maxSize = 8;
  let bestWithin = null;
  let bestFallback = null;

  const evaluate = (b, h) => {
    const cap = hydraulicCapacityRect(b, h, K, I, fill);
    if (cap.q < Qp) return;
    const candidate = {
      b,
      h,
      cap,
      area: b * h,
      oversize: sectionOversize(cap.q, Qp),
      squarePenalty: Math.abs(b - h)
    };
    if (cap.q <= maxCapacity) {
      if (
        !bestWithin ||
        candidate.area < bestWithin.area - 1e-9 ||
        (Math.abs(candidate.area - bestWithin.area) < 1e-9 && candidate.oversize < bestWithin.oversize)
      ) bestWithin = candidate;
    }
    if (
      !bestFallback ||
      candidate.oversize < bestFallback.oversize ||
      (Math.abs(candidate.oversize - bestFallback.oversize) < 1e-9 && candidate.area < bestFallback.area)
    ) bestFallback = candidate;
  };

  if (imposedB > 0) {
    const b = roundUp(Math.max(minSize, imposedB), .05);
    for (let h = minSize; h <= maxSize; h = roundUp(h + .05, .05)) evaluate(b, h);
  } else {
    for (let b = minSize; b <= maxSize; b = roundUp(b + .05, .05)) {
      const minH = Math.max(minSize, b * .55);
      const maxH = Math.min(maxSize, b * 1.8);
      for (let h = roundUp(minH, .05); h <= maxH; h = roundUp(h + .05, .05)) evaluate(b, h);
    }
  }

  return bestWithin || bestFallback;
}

function squareHydraulicBase(Qp, K, I) {
  return Math.pow((Qp * 2.08) / (K * Math.sqrt(I)), 3 / 8);
}

function constructiveAllowance(Qp) {
  return 0.2 + 0.15 * Math.pow(Qp, 1 / 3);
}

function hydraulicCapacitySquareBase(b, K, I) {
  const area = b * b;
  const rh = b / 3;
  const q = K * area * Math.pow(rh, 2 / 3) * Math.sqrt(I);
  return { q, area, rh, velocity: q / area, y: b };
}

function solveHeightForImposedWidth(Qp, b, K, I, fill) {
  let low = 0.05;
  let high = 0.25;
  while (hydraulicCapacityRect(b, high, K, I, fill).q < Qp && high < 12) high += 0.25;
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    if (hydraulicCapacityRect(b, mid, K, I, fill).q >= Qp) high = mid;
    else low = mid;
  }
  const h = roundUp(high, .05);
  return { h, cap: hydraulicCapacityRect(b, h, K, I, fill) };
}

function automaticConcreteThickness(width) {
  const epVoile = roundUp((((width * 100) / 40) + 12.5) * 0.01, 0.05);
  const epRadier = roundUp(epVoile + 0.05, 0.05);
  return { epVoile, epRadier };
}

function thicknessAutoEnabled() {
  return $("#autoThickness") ? $("#autoThickness").checked : true;
}

function applyAutomaticThicknesses(width) {
  if (!thicknessAutoEnabled()) return;
  const { epVoile, epRadier } = automaticConcreteThickness(width);
  $("#wallT").value = fmt(epVoile, 2);
  $("#slabT").value = fmt(epRadier, 2);
}

function sizeHydraulicSection() {
  const Qp = n("designQp") || state.hydro.qp || 0.1;
  const K = n("stricklerK");
  const I = n("collectorSlope");
  const fill = Math.min(1, Math.max(.5, n("fillRatio")));
  const type = $("#sectionType").value;
  let result;

  if (type === "circ") {
    const requiredFull = Qp / fill;
    const found = standardDiameters.find((mm) => hydraulicCapacityCircular(mm / 1000, K, I, 1).q >= requiredFull) || standardDiameters.at(-1);
    const cap = hydraulicCapacityCircular(found / 1000, K, I, fill);
    const oversize = sectionOversize(cap.q, Qp);
    result = {
      section_proposee: "Circulaire",
      dimensions: { diametre_mm: found },
      vitesse_ecoulement: cap.velocity,
      taux_remplissage: fill,
      capacite: cap.q,
      surcapacite_pct: oversize,
      optimisation: oversize <= 25 ? "OK: surcapacite <= 25%" : "Diametre standard superieur: surcapacite > 25%, verifier un diametre non standard ou une section rectangulaire.",
      observations_techniques: velocityObservation(cap.velocity, Qp, K, I)
    };
  } else {
    const imposedB = n("fixedWidth");
    const hasImposedB = imposedB > 0;
    const baseB = hasImposedB ? roundUp(Math.max(.25, imposedB), .05) : roundUp(squareHydraulicBase(Qp, K, I), .05);
    const solved = hasImposedB ? solveHeightForImposedWidth(Qp, baseB, K, I, fill) : null;
    const baseH = solved ? solved.h : baseB;
    const allowanceR = constructiveAllowance(Qp);
    const finalWidth = roundUp(baseB + allowanceR, .05);
    const finalHeight = roundUp(baseH + allowanceR, .05);
    const automaticThickness = automaticConcreteThickness(finalWidth);
    const cap = solved ? solved.cap : hydraulicCapacitySquareBase(baseB, K, I);
    const oversize = sectionOversize(cap.q, Qp);
    result = {
      section_proposee: "Carrée b=h",
      dimensions: {
        largeur_m: Number(fmt(finalWidth, 2)),
        hauteur_m: Number(fmt(finalHeight, 2)),
        b_hydraulique_m: Number(fmt(baseB, 3)),
        h_hydraulique_m: Number(fmt(baseH, 3)),
        R_m: Number(fmt(allowanceR, 3)),
        epaisseur_parois_auto_m: Number(fmt(automaticThickness.epVoile, 2)),
        epaisseur_radier_auto_m: Number(fmt(automaticThickness.epRadier, 2))
      },
      vitesse_ecoulement: cap.velocity,
      taux_remplissage: Math.min(1, baseH / finalHeight),
      capacite: cap.q,
      surcapacite_pct: oversize,
      optimisation: oversize >= -0.5 && oversize <= 25 ? "OK: b=h selon formule, surcapacite <= 25%" : oversize < -0.5 ? "Alerte: b impose insuffisant pour Qp avec b=h." : "Alerte: surcapacite > 25%, verifier K, pente ou b impose.",
      hauteur_eau_m: cap.y,
      observations_techniques: `${velocityObservation(cap.velocity, Qp, K, I)} Base hydraulique b=h=${fmt(baseB, 3)} m, R=${fmt(allowanceR, 3)} m.`
    };
    if (hasImposedB) {
      result.section_proposee = "Rectangulaire b impose";
      result.optimisation = oversize >= -0.5 && oversize <= 25
        ? "OK: b impose, h calcule, surcapacite <= 25%"
        : oversize < -0.5 ? "Alerte: section insuffisante pour Qp." : "Alerte: surcapacite > 25%, verifier K, pente ou b impose.";
      result.observations_techniques = `${velocityObservation(cap.velocity, Qp, K, I)} Base hydraulique b=${fmt(baseB, 3)} m, h=${fmt(baseH, 3)} m, R=${fmt(allowanceR, 3)} m.`;
    }
    $("#chanB").value = fmt(finalWidth, 2);
    $("#chanH").value = fmt(finalHeight, 2);
    applyAutomaticThicknesses(finalWidth);
  }

  state.section = { parametres_entree: { Qp, K, I }, resultats: result };
  updateSectionUI();
  calculateSteel();
  return state.section;
}

function velocityObservation(v, Qp, K, I) {
  if (v < 0.6) return "Vitesse inférieure à l'autocurage : augmenter la pente, réduire la section ou améliorer K.";
  if (v > 3.5) return "Vitesse élevée : vérifier l'érosion, les chutes et la protection du béton.";
  return "Vitesse compatible avec l'autocurage recommandé 0,6 m/s < V < 3,5 m/s.";
}

function updateSectionUI() {
  const s = state.section.resultats;
  const dims = s.section_proposee === "Circulaire"
    ? `Diamètre ${s.dimensions.diametre_mm} mm`
    : `${fmt(s.dimensions.largeur_m, 2)} m x ${fmt(s.dimensions.hauteur_m, 2)} m`;
  const squareDetail = s.dimensions.b_hydraulique_m
    ? `<div class="metric"><strong>b=${fmt(s.dimensions.b_hydraulique_m, 3)} m | h=${fmt(s.dimensions.h_hydraulique_m || s.dimensions.b_hydraulique_m, 3)} m</strong><span>R=${fmt(s.dimensions.R_m, 3)} m, section finale=(b+R)x(h+R)</span></div>`
    : "";
  $("#heroSection").textContent = s.section_proposee;
  const oversizeClass = s.surcapacite_pct >= -0.5 && s.surcapacite_pct <= 25 ? "ok" : "critical";
  const oversizeSign = s.surcapacite_pct >= 0 ? "+" : "";
  $("#sectionResult").innerHTML = `
    <div class="headline">${dims}</div>
    ${squareDetail}
    <div class="metric"><strong>${fmt(s.capacite, 3)} m3/s</strong><span>Capacité à ${fmt(s.taux_remplissage * 100, 0)}% de remplissage</span></div>
    <div class="metric ${oversizeClass}"><strong>${oversizeSign}${fmt(s.surcapacite_pct, 1)}%</strong><span>${s.optimisation}</span></div>
    <div class="metric"><strong>${fmt(s.vitesse_ecoulement, 2)} m/s</strong><span>${s.observations_techniques}</span></div>`;
  $("#jsonOutput").textContent = JSON.stringify(state.section, null, 2);
  updateReport();
  draw3D();
}

function calculateKa(phiDeg) {
  const phi = phiDeg * Math.PI / 180;
  return Math.pow(Math.tan(Math.PI / 4 - phi / 2), 2);
}

function chooseBars(asReqMm2m) {
  for (const dia of steelDiameters) {
    const area = Math.PI * dia * dia / 4;
    for (const spacing of spacings) {
      const provided = area * 1000 / spacing;
      if (provided >= asReqMm2m) return { dia, spacing, provided };
    }
  }
  return { dia: 25, spacing: 100, provided: Math.PI * 25 * 25 / 4 * 10 };
}

function barProvided(dia, spacing) {
  return Math.PI * dia * dia / 4 * 1000 / spacing;
}

function barLabel(bar) {
  return `HA${bar.dia} / ${bar.spacing} mm`;
}

function setSelectValue(id, value) {
  const el = $(`#${id}`);
  if (el) el.value = String(value);
}

function manualBar(key, autoBar) {
  if (!$("#manualSteel")?.checked) return autoBar;
  const dia = n(`${key}Dia`) || autoBar.dia;
  const spacing = n(`${key}Spacing`) || autoBar.spacing;
  return { dia, spacing, provided: barProvided(dia, spacing), manual: true };
}

function syncManualSteelControls(bars, required) {
  if (!$("#manualSteel")) return;
  const rows = [
    ["radierMain", "Radier long.", bars.radierMain, required.radier],
    ["radierDist", "Radier trans.", bars.radierDist, required.radierDistribution],
    ["wallVert", "Parois vert.", bars.wallVert, required.wall],
    ["wallHoriz", "Parois horiz.", bars.wallHoriz, required.wallDistribution]
  ];

  if (!$("#manualSteel").checked) {
    rows.forEach(([key, , bar]) => {
      setSelectValue(`${key}Dia`, bar.dia);
      setSelectValue(`${key}Spacing`, bar.spacing);
    });
    setSelectValue("angleDia", Math.max(12, bars.wallVert.dia));
  }

  $("#manualSteelCheck").innerHTML = rows.map(([, label, bar, req]) => {
    const ok = bar.provided >= req;
    return `<span class="${ok ? "ok" : "critical"}">${label}: ${Math.round(bar.provided)} / ${Math.ceil(req)} mm2/m</span>`;
  }).join("");
}

function calculateSteel() {
  const b = n("chanB");
  const h = n("chanH");
  const slabT = n("slabT");
  const wallT = n("wallT");
  const length = n("chanLength");
  const fy = n("steelFy");
  const cover = n("cover") / 1000;
  const gamma = n("soilGamma");
  const phi = n("soilPhi");
  const ka = n("kaManual") > 0 ? n("kaManual") : calculateKa(phi);
  const water = $("#waterPresence").value === "yes" ? 9.81 : 0;
  const traffic = n("trafficLoad") + ({ leger: 4, moyen: 8, lourd: 15 }[$("#trafficType").value] || 0);
  const dSlab = Math.max(.05, slabT - cover - .006);
  const dWall = Math.max(.05, wallT - cover - .006);
  const qRadier = traffic + 25 * slabT + 10;
  const mRadier = qRadier * b * b / 8;
  const asRadier = (mRadier * 1e6) / (0.9 * dSlab * 1000 * fy);
  const mWall = (ka * gamma + water) * Math.pow(h, 3) / 6 + traffic * h * h / 2 * 0.25;
  const asWall = (mWall * 1e6) / (0.9 * dWall * 1000 * fy);
  const minSlab = 0.0013 * 1000 * slabT * 1e6 / 1000;
  const minWall = 0.0013 * 1000 * wallT * 1e6 / 1000;
  const required = {
    radier: Math.max(asRadier, minSlab),
    radierDistribution: Math.max(minSlab * .7, asRadier * .45),
    wall: Math.max(asWall, minWall),
    wallDistribution: Math.max(minWall * .7, asWall * .35)
  };
  const autoBars = {
    radierMain: chooseBars(required.radier),
    radierDist: chooseBars(required.radierDistribution),
    wallVert: chooseBars(required.wall),
    wallHoriz: chooseBars(required.wallDistribution)
  };
  const radierMain = manualBar("radierMain", autoBars.radierMain);
  const radierDist = manualBar("radierDist", autoBars.radierDist);
  const wallVert = manualBar("wallVert", autoBars.wallVert);
  const wallHoriz = manualBar("wallHoriz", autoBars.wallHoriz);
  const angleDia = $("#manualSteel")?.checked ? Math.max(10, n("angleDia")) : Math.max(12, wallVert.dia);
  const anchor = Math.ceil((45 * Math.max(radierMain.dia, wallVert.dia, angleDia)) / 10) * 10;
  const steelMass = estimateSteelMass({ b, h, length, radierMain, radierDist, wallVert, wallHoriz });
  syncManualSteelControls({ radierMain, radierDist, wallVert, wallHoriz }, required);

  state.steel = {
    input: { b, h, slabT, wallT, length, fy, cover_mm: cover * 1000, gamma, phi, ka, traffic },
    efforts: { qRadier, mRadier, mWall },
    ferraillage_manuel: !!$("#manualSteel")?.checked,
    aciers_proposes_auto: {
      radier_longitudinal: barLabel(autoBars.radierMain),
      radier_transversal: barLabel(autoBars.radierDist),
      parois_verticales: barLabel(autoBars.wallVert),
      parois_horizontales: barLabel(autoBars.wallHoriz)
    },
    acier: {
      As_radier_mm2m: Math.ceil(required.radier),
      As_parois_mm2m: Math.ceil(required.wall),
      As_radier_fourni_mm2m: Math.round(radierMain.provided),
      As_parois_fourni_mm2m: Math.round(wallVert.provided),
      radier_longitudinal: barLabel(radierMain),
      radier_transversal: barLabel(radierDist),
      parois_verticales: barLabel(wallVert),
      parois_horizontales: barLabel(wallHoriz),
      renforts_angles: `2 HA${angleDia} continus`,
      ancrage_mm: anchor,
      masse_estimee_kg: Math.round(steelMass)
    },
    verifications: {
      elu: "OK en pré-dimensionnement si les hypothèses de charge sont validées",
      els: cover * 1000 >= 35 ? "Enrobage compatible ambiance extérieure" : "Augmenter l'enrobage",
      autocurage: state.section.resultats?.observations_techniques || "A vérifier après dimensionnement hydraulique"
    }
  };

  updateSteelUI();
  generatePlan();
  draw3D();
  updateReport();
  return state.steel;
}

function estimateSteelMass({ b, h, length, radierMain, radierDist, wallVert, wallHoriz }) {
  const kgm = (dia) => dia * dia / 162;
  const countMain = Math.ceil((b * 1000) / radierMain.spacing) + 1;
  const countDist = Math.ceil((length * 1000) / radierDist.spacing) + 1;
  const wallV = Math.ceil((length * 1000) / wallVert.spacing) * 2;
  const wallH = Math.ceil((h * 1000) / wallHoriz.spacing) * 2;
  return countMain * length * kgm(radierMain.dia) + countDist * b * kgm(radierDist.dia) + wallV * h * kgm(wallVert.dia) + wallH * length * kgm(wallHoriz.dia);
}

function updateSteelUI() {
  const s = state.steel;
  $("#heroSteel").textContent = s.acier.radier_longitudinal;
  $("#steelResults").innerHTML = [
    ["Mode", s.ferraillage_manuel ? "Ferraillage modifiÃ© manuellement par l'utilisateur" : "Ferraillage automatique proposÃ© par le moteur"],
    ["Moments", `Radier M = ${fmt(s.efforts.mRadier, 2)} kN.m/ml, Paroi M = ${fmt(s.efforts.mWall, 2)} kN.m/ml`],
    ["Sections acier", `Radier requis ${s.acier.As_radier_mm2m} mm2/m, fourni ${s.acier.As_radier_fourni_mm2m} mm2/m. Parois requis ${s.acier.As_parois_mm2m} mm2/m, fourni ${s.acier.As_parois_fourni_mm2m} mm2/m.`],
    ["Radier", `Longitudinal ${s.acier.radier_longitudinal}, transversal ${s.acier.radier_transversal}`],
    ["Parois", `Vertical ${s.acier.parois_verticales}, horizontal ${s.acier.parois_horizontales}`],
    ["Détails", `${s.acier.renforts_angles}, ancrage ${s.acier.ancrage_mm} mm, masse estimée ${s.acier.masse_estimee_kg} kg`],
    ["Vérifications", `${s.verifications.elu}. ${s.verifications.els}.`]
  ].map(([title, text]) => `<article class="steel-card"><strong>${title}</strong><p class="steel-line">${text}</p></article>`).join("");
}

function generatePlan() {
  const st = state.steel.acier;
  if (!st) return;
  const b = n("chanB");
  const h = n("chanH");
  const slab = n("slabT");
  const wall = n("wallT");
  const scale = Math.min(420 / (b + wall * 2), 330 / (h + slab));
  const ox = 240, oy = 455;
  const outerW = (b + wall * 2) * scale;
  const outerH = (h + slab) * scale;
  const innerW = b * scale;
  const innerH = h * scale;
  const wallPx = wall * scale;
  const slabPx = slab * scale;
  const x0 = ox - outerW / 2;
  const y0 = oy - outerH;
  const ix = x0 + wallPx;
  const iy = y0;
  const barColor = "#b1261e";
  const svg = `
    <rect width="960" height="560" fill="#f7f4ee"/>
    <text x="34" y="42" font-size="24" font-weight="800" fill="#19211f">LOUMOUAMOU HYDRO - Plan de ferraillage caniveau BA</text>
    <text x="34" y="68" font-size="13" fill="#42504b">Coupe type, dimensions en m, aciers HA, export DXF disponible</text>
    <path d="M ${x0} ${y0} L ${x0} ${oy} L ${x0 + outerW} ${oy} L ${x0 + outerW} ${y0} L ${x0 + outerW - wallPx} ${y0} L ${x0 + outerW - wallPx} ${oy - slabPx} L ${ix} ${oy - slabPx} L ${ix} ${y0} Z" fill="#ddd7cc" stroke="#19211f" stroke-width="3"/>
    ${repeatBars(ix + 14, oy - slabPx + 18, innerW - 28, 0, 9, barColor)}
    ${repeatBars(ix + 18, y0 + 18, 0, innerH - 22, 7, barColor)}
    ${repeatBars(ix + innerW - 18, y0 + 18, 0, innerH - 22, 7, barColor)}
    <path d="M ${ix - 16} ${oy - slabPx - 4} Q ${ix - 16} ${oy - slabPx + 26} ${ix + 26} ${oy - slabPx + 26}" fill="none" stroke="${barColor}" stroke-width="5"/>
    <path d="M ${ix + innerW + 16} ${oy - slabPx - 4} Q ${ix + innerW + 16} ${oy - slabPx + 26} ${ix + innerW - 26} ${oy - slabPx + 26}" fill="none" stroke="${barColor}" stroke-width="5"/>
    ${dimensionLine(ix, oy + 36, ix + innerW, oy + 36, `b = ${fmt(b, 2)} m`)}
    ${dimensionLine(x0 - 35, y0, x0 - 35, oy - slabPx, `h = ${fmt(h, 2)} m`)}
    ${dimensionLine(x0, oy + 72, x0 + outerW, oy + 72, `largeur extérieure = ${fmt(b + 2 * wall, 2)} m`)}
    <g transform="translate(610 118)">
      <rect x="0" y="0" width="300" height="270" rx="6" fill="#ffffff" stroke="#19211f"/>
      <text x="18" y="34" font-size="18" font-weight="800">Nomenclature</text>
      ${legendLine(18, 70, "Radier long.", st.radier_longitudinal)}
      ${legendLine(18, 105, "Radier trans.", st.radier_transversal)}
      ${legendLine(18, 140, "Parois vert.", st.parois_verticales)}
      ${legendLine(18, 175, "Parois horiz.", st.parois_horizontales)}
      ${legendLine(18, 210, "Angles", st.renforts_angles)}
      ${legendLine(18, 245, "Ancrage", `${st.ancrage_mm} mm`)}
    </g>`;
  $("#planSvg").innerHTML = svg;
  state.plan = svg;
}

function repeatBars(x, y, dx, dy, count, color) {
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : i / (count - 1);
    const cx = x + dx * t;
    const cy = y + dy * t;
    return dx ? `<circle cx="${cx}" cy="${cy}" r="5" fill="${color}"/>` : `<line x1="${cx - 8}" x2="${cx + 8}" y1="${cy}" y2="${cy}" stroke="${color}" stroke-width="5"/>`;
  }).join("");
}

function dimensionLine(x1, y1, x2, y2, label) {
  const tx = (x1 + x2) / 2, ty = (y1 + y2) / 2 - 8;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#19211f" stroke-width="1.5"/><text x="${tx}" y="${ty}" text-anchor="middle" font-size="13" fill="#19211f">${label}</text>`;
}

function legendLine(x, y, a, b) {
  return `<text x="${x}" y="${y}" font-size="13" fill="#19211f">${a}</text><text x="${x + 118}" y="${y}" font-size="13" font-weight="800" fill="#b1261e">${b}</text>`;
}

function draw3D() {
  const canvas = $("#threeCanvas");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const b = n("chanB"), h = n("chanH"), wall = n("wallT"), slab = n("slabT"), len = Math.min(4, Math.max(1.2, n("chanLength") / 8));
  const rot = n("viewRotation") * Math.PI / 180;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#eef0ea";
  ctx.fillRect(0, 0, W, H);
  const s = 120;
  const cx = W / 2, cy = H * .63;
  const pts = boxPoints((b + 2 * wall) * s, len * s, (h + slab) * s, rot, cx, cy);
  drawFace(ctx, [pts[0], pts[1], pts[2], pts[3]], "#c9c0b4");
  drawFace(ctx, [pts[1], pts[5], pts[6], pts[2]], "#aeb8b3");
  drawFace(ctx, [pts[2], pts[6], pts[7], pts[3]], "#d8d1c6");
  const inner = boxPoints(b * s, len * s * .88, h * s, rot, cx, cy - slab * s * .45);
  drawFace(ctx, [inner[0], inner[1], inner[2], inner[3]], "#295a59");
  ctx.strokeStyle = "#1a2421";
  ctx.lineWidth = 3;
  [...pts, pts[0]].forEach((p, i, arr) => { if (i && i < 4) line(ctx, arr[i - 1], p); });
  ctx.fillStyle = "#1a2421";
  ctx.font = "700 20px Inter, sans-serif";
  ctx.fillText(`b ${fmt(b, 2)} m | h ${fmt(h, 2)} m | parois ${fmt(wall, 2)} m`, 30, 42);
}

function boxPoints(w, d, h, rot, cx, cy) {
  const raw = [[-w/2,-d/2,0],[w/2,-d/2,0],[w/2,d/2,0],[-w/2,d/2,0],[-w/2,-d/2,-h],[w/2,-d/2,-h],[w/2,d/2,-h],[-w/2,d/2,-h]];
  return raw.map(([x, y, z]) => {
    const xr = x * Math.cos(rot) - y * Math.sin(rot);
    const yr = x * Math.sin(rot) + y * Math.cos(rot);
    return { x: cx + (xr - yr) * .72, y: cy + (xr + yr) * .32 + z };
  });
}

function drawFace(ctx, points, color) {
  ctx.beginPath();
  points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "rgba(24,33,31,.35)";
  ctx.stroke();
}

function line(ctx, a, b) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function animateNumber(el, start, end, duration) {
  if (!duration) {
    el.textContent = fmt(end, 2);
    return;
  }
  const t0 = performance.now();
  function frame(now) {
    const p = Math.min(1, (now - t0) / duration);
    el.textContent = fmt(start + (end - start) * (1 - Math.pow(1 - p, 3)), 2);
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

let drops = [];
function drawRain() {
  const canvas = $("#rainCanvas");
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  canvas.width = innerWidth * ratio;
  canvas.height = innerHeight * ratio;
  const intensity = Math.min(220, 50 + (state.hydro.qp || 1) * 22);
  drops = Array.from({ length: intensity }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    l: 8 * ratio + Math.random() * 18 * ratio,
    v: 5 * ratio + Math.random() * 8 * ratio
  }));
  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(194, 239, 236, .34)";
    ctx.lineWidth = 1 * ratio;
    drops.forEach((d) => {
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.l * .26, d.y + d.l);
      ctx.stroke();
      d.y += d.v;
      d.x -= d.v * .12;
      if (d.y > canvas.height) {
        d.y = -20;
        d.x = Math.random() * canvas.width;
      }
    });
    requestAnimationFrame(tick);
  }
  if (!window.__rainStarted) {
    window.__rainStarted = true;
    tick();
  }
}

let heroParticles = [];
function drawHeroCanvas() {
  const canvas = $("#heroCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width || canvas.width);
  const height = Math.max(1, rect.height || canvas.height);
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  function terrainY(x) {
    const p = x / width;
    return height * (.48 + .08 * Math.sin(p * Math.PI * 1.2) - .18 * p);
  }

  function frame() {
    const qp = state.hydro.qp || 1;
    const tc = state.hydro.tc || 20;
    const intensity = state.hydro.i || 100;
    const flowSpeed = Math.min(2.8, .55 + qp / 8);
    const particleCount = Math.min(90, Math.round(22 + intensity / 4));
    if (heroParticles.length !== particleCount) {
      heroParticles = Array.from({ length: particleCount }, () => ({
        t: Math.random(),
        lane: Math.random(),
        r: 1.4 + Math.random() * 2.8,
        drift: Math.random() * 16 - 8
      }));
    }

    ctx.clearRect(0, 0, width, height);
    const sky = ctx.createLinearGradient(0, 0, width, height);
    sky.addColorStop(0, "#142525");
    sky.addColorStop(.45, "#23413b");
    sky.addColorStop(1, "#8f3f2b");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    ctx.globalAlpha = .62;
    ctx.fillStyle = "#e8b66c";
    ctx.beginPath();
    ctx.arc(width * .78, height * .2, Math.min(width, height) * .12, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    drawHills(ctx, width, height, terrainY);
    drawRiver(ctx, width, height);
    drawCatchment(ctx, width, height, terrainY, tc);
    drawCanal(ctx, width, height, qp);
    drawFlowParticles(ctx, width, height, terrainY, flowSpeed);
    drawRainBands(ctx, width, height, intensity);
    drawHeroLabels(ctx, width, height, qp, intensity, tc);

    requestAnimationFrame(frame);
  }

  if (!window.__heroCanvasStarted) {
    window.__heroCanvasStarted = true;
    frame();
  }
}

function drawHills(ctx, width, height, terrainY) {
  const ground = ctx.createLinearGradient(0, height * .35, 0, height);
  ground.addColorStop(0, "#2f6756");
  ground.addColorStop(.55, "#935239");
  ground.addColorStop(1, "#4a261d");
  ctx.fillStyle = ground;
  ctx.beginPath();
  ctx.moveTo(0, height);
  for (let x = 0; x <= width; x += 28) ctx.lineTo(x, terrainY(x));
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(255,255,255,.13)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 7; i += 1) {
    ctx.beginPath();
    const offset = i * 34;
    for (let x = 0; x <= width; x += 24) {
      const y = terrainY(x) + offset + Math.sin((x + i * 60) * .014) * 8;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawRiver(ctx, width, height) {
  const river = ctx.createLinearGradient(width * .62, 0, width, height);
  river.addColorStop(0, "rgba(47,183,165,.32)");
  river.addColorStop(1, "rgba(14,111,120,.9)");
  ctx.fillStyle = river;
  ctx.beginPath();
  ctx.moveTo(width * .68, height);
  ctx.bezierCurveTo(width * .78, height * .77, width * .73, height * .5, width, height * .32);
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
}

function drawCatchment(ctx, width, height, terrainY, tc) {
  const cx = width * .56;
  const cy = terrainY(cx) - 56;
  const radius = Math.max(76, Math.min(150, 230 - tc * 3));
  ctx.fillStyle = "rgba(47,183,165,.10)";
  ctx.strokeStyle = "rgba(213,255,247,.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, radius * 1.35, radius * .72, -.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.setLineDash([8, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawCanal(ctx, width, height, qp) {
  const x = width * .58;
  const y = height * .68;
  const canalW = Math.min(250, 105 + qp * 14);
  const canalH = 72;
  ctx.fillStyle = "#d8d1c6";
  ctx.strokeStyle = "rgba(20,28,26,.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + canalW, y + 26);
  ctx.lineTo(x + canalW - 35, y + canalH);
  ctx.lineTo(x + 34, y + canalH - 18);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(47,183,165,.72)";
  ctx.beginPath();
  ctx.moveTo(x + 24, y + 32);
  ctx.lineTo(x + canalW - 20, y + 52);
  ctx.lineTo(x + canalW - 42, y + canalH - 8);
  ctx.lineTo(x + 44, y + canalH - 22);
  ctx.closePath();
  ctx.fill();
}

function drawFlowParticles(ctx, width, height, terrainY, speed) {
  ctx.fillStyle = "rgba(213,255,247,.82)";
  heroParticles.forEach((p) => {
    p.t += .0018 * speed;
    if (p.t > 1) p.t = 0;
    const x = width * (.12 + p.t * .62);
    const y = terrainY(x) - 12 + Math.sin(p.t * Math.PI * 3 + p.lane) * 12 + p.drift;
    ctx.beginPath();
    ctx.arc(x, y, p.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawRainBands(ctx, width, height, intensity) {
  const count = Math.min(65, Math.round(12 + intensity / 8));
  ctx.strokeStyle = "rgba(213,255,247,.28)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < count; i += 1) {
    const x = (i * 97 + performance.now() * .045) % width;
    const y = (i * 43 + performance.now() * .12) % (height * .55);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 12, y + 36);
    ctx.stroke();
  }
}

function drawHeroLabels(ctx, width, height, qp, intensity, tc) {
  ctx.font = "700 14px Inter, sans-serif";
  ctx.fillStyle = "rgba(248,251,246,.78)";
  ctx.fillText(`Qp ${fmt(qp, 2)} m3/s`, width * .61, height * .67);
  ctx.fillText(`i ${fmt(intensity, 0)} mm/h`, width * .73, height * .18);
  ctx.fillText(`tc ${fmt(tc, 1)} min`, width * .52, height * .39);
}

function updateReport() {
  const h = state.hydro;
  const sec = state.section.resultats;
  const st = state.steel.acier;
  $("#reportPreview").innerHTML = [
    ["Hydrologie", h.qp ? `Qp = 0,278 x C x I10 x S = ${fmt(h.qpRaw, 3)} m3/s brut, S=${fmt(h.areaKm2, 3)} km2 depuis A=${fmt(h.A, 2)} ha, C=${fmt(h.C, 2)}, I10=${fmt(h.i, 1)} mm/h, a=${fmt(h.intensityA, 0)}, b=${fmt(h.intensityB, 2)}, Qp projet=${fmt(h.qp, 3)} m3/s.` : "Calcul hydrologique en attente."],
    ["Section", sec ? `${sec.section_proposee}, capacité ${fmt(sec.capacite, 3)} m3/s, vitesse ${fmt(sec.vitesse_ecoulement, 2)} m/s.` : "Dimensionnement hydraulique en attente."],
    ["Ferraillage", st ? `Radier ${st.radier_longitudinal}, parois ${st.parois_verticales}, ancrage ${st.ancrage_mm} mm.` : "Ferraillage en attente."]
  ].map(([a, b]) => `<article><strong>${a}</strong><p>${b}</p></article>`).join("");
}

function exportPdf() {
  const win = window.open("", "_blank");
  const plan = $("#planSvg").outerHTML;
  win.document.write(`<!doctype html><html><head><title>Rapport LOUMOUAMOU HYDRO</title><style>body{font-family:Arial,sans-serif;margin:28px;color:#17211f}h1{color:#0e6f78}.box{border:1px solid #bbb;padding:12px;margin:10px 0}svg{width:100%;height:auto}</style></head><body><h1>LOUMOUAMOU HYDRO</h1><h2>${$("#projectName").value}</h2>${$("#reportPreview").innerHTML}<div class="box"><pre>${$("#jsonOutput").textContent}</pre></div>${plan}<script>print()<\/script></body></html>`);
  win.document.close();
}

function exportCsv() {
  const rows = [
    ["Projet", $("#projectName").value],
    ["Qp m3/s", fmt(state.hydro.qp, 3)],
    ["Qp brut m3/s", fmt(state.hydro.qpRaw, 3)],
    ["Formule Qp", state.hydro.formuleQp || "Qp = 0,278 x C x I10 x S(km2)"],
    ["A ha", fmt(state.hydro.A, 2)],
    ["S km2", fmt(state.hydro.areaKm2, 3)],
    ["C", fmt(state.hydro.C, 2)],
    ["tc min", fmt(state.hydro.tc, 2)],
    ["I10 mm/h", fmt(state.hydro.i, 2)],
    ["Parametre IDF a", fmt(state.hydro.intensityA, 0)],
    ["Parametre IDF b", fmt(state.hydro.intensityB, 2)],
    ["Section", state.section.resultats?.section_proposee || ""],
    ["Capacite m3/s", fmt(state.section.resultats?.capacite || 0, 3)],
    ["Vitesse m/s", fmt(state.section.resultats?.vitesse_ecoulement || 0, 2)],
    ["Radier", state.steel.acier?.radier_longitudinal || ""],
    ["Parois", state.steel.acier?.parois_verticales || ""],
    ["Masse acier kg", state.steel.acier?.masse_estimee_kg || ""]
  ];
  download("loumouamou-hydro-resultats.csv", rows.map((r) => r.join(";")).join("\n"), "text/csv");
}

function exportDxf() {
  const b = n("chanB"), h = n("chanH"), wall = n("wallT"), slab = n("slabT");
  const ow = b + 2 * wall, oh = h + slab;
  const lines = [
    [0, 0, ow, 0], [ow, 0, ow, oh], [ow, oh, ow - wall, oh], [ow - wall, oh, ow - wall, slab],
    [ow - wall, slab, wall, slab], [wall, slab, wall, oh], [wall, oh, 0, oh], [0, oh, 0, 0]
  ];
  const body = lines.map(([x1, y1, x2, y2]) => `0\nLINE\n8\nCANIVEAU\n10\n${x1}\n20\n${y1}\n30\n0\n11\n${x2}\n21\n${y2}\n31\n0`).join("\n");
  const text = `0\nSECTION\n2\nENTITIES\n${body}\n0\nENDSEC\n0\nEOF`;
  download("plan-ferraillage-caniveau.dxf", text, "application/dxf");
}

function saveProject() {
  const payload = { name: $("#projectName").value, inputs: collectInputs(), state };
  download("projet-loumouamou-hydro.json", JSON.stringify(payload, null, 2), "application/json");
}

function loadProject(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const data = JSON.parse(reader.result);
    $("#projectName").value = data.name || "Projet chargé";
    Object.entries(data.inputs || {}).forEach(([id, value]) => {
      const el = $(`#${id}`);
      if (!el) return;
      if (el.type === "checkbox") el.checked = value;
      else el.value = value;
    });
    runAll(false);
  };
  reader.readAsText(file);
}

function collectInputs() {
  const ids = $$("input, select").filter((el) => el.id).map((el) => [el.id, el.type === "checkbox" ? el.checked : el.value]);
  return Object.fromEntries(ids);
}

function download(filename, text, type) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function copyJson() {
  const data = JSON.stringify({ hydro: state.hydro, section: state.section, steel: state.steel }, null, 2);
  await navigator.clipboard.writeText(data);
  $("#copyJson").textContent = "JSON copié";
  setTimeout(() => $("#copyJson").textContent = "Copier JSON", 1200);
}

function bindEvents() {
  $("#zone").addEventListener("change", () => {
    const data = zoneData[$("#zone").value];
    $("#runoffC").value = data.c;
    calculateHydrology();
  });
  ["runoffC", "areaHa", "returnPeriod", "intensityA", "intensityB", "lengthL", "slopeS", "tcMode", "tcManual", "sedimentMargin"].forEach((id) => {
    $(`#${id}`).addEventListener("input", () => calculateHydrology());
    $(`#${id}`).addEventListener("change", () => calculateHydrology());
  });
  $("#calculateAll").addEventListener("click", () => runAll());
  $("#sizeSection").addEventListener("click", sizeHydraulicSection);
  ["designQp", "stricklerK", "collectorSlope", "sectionType", "fillRatio", "fixedWidth"].forEach((id) => {
    $(`#${id}`).addEventListener("input", sizeHydraulicSection);
    $(`#${id}`).addEventListener("change", sizeHydraulicSection);
  });
  $("#autoThickness")?.addEventListener("change", () => {
    if (thicknessAutoEnabled()) applyAutomaticThicknesses(n("chanB"));
    calculateSteel();
  });
  $("#calculateSteel").addEventListener("click", calculateSteel);
  ["chanB", "chanH", "slabT", "wallT", "chanLength", "concreteClass", "steelFy", "cover", "soilGamma", "soilPhi", "kaManual", "waterPresence", "trafficLoad", "trafficType"].forEach((id) => {
    const recalcSteel = () => {
      if (id === "chanB" && thicknessAutoEnabled()) applyAutomaticThicknesses(n("chanB"));
      calculateSteel();
    };
    $(`#${id}`).addEventListener("input", recalcSteel);
    $(`#${id}`).addEventListener("change", recalcSteel);
  });
  $("#manualSteel")?.addEventListener("change", calculateSteel);
  $$("[data-manual-steel]").forEach((input) => input.addEventListener("change", calculateSteel));
  $("#generatePlan").addEventListener("click", generatePlan);
  $("#exportPdf").addEventListener("click", exportPdf);
  $("#exportExcel").addEventListener("click", exportCsv);
  $("#exportDxf").addEventListener("click", exportDxf);
  $("#saveProject").addEventListener("click", saveProject);
  $("#copyJson").addEventListener("click", copyJson);
  $("#loadProject").addEventListener("change", (e) => e.target.files[0] && loadProject(e.target.files[0]));
  $("#viewRotation").addEventListener("input", draw3D);
  window.addEventListener("resize", () => {
    drawRain();
    drawHeroCanvas();
  });
}

function runAll(animated = true) {
  calculateHydrology(animated);
  sizeHydraulicSection();
  calculateSteel();
}

function registerPwa() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").then((r) => r.update()).catch(() => {});
}

bindEvents();
runAll(false);
registerPwa();
