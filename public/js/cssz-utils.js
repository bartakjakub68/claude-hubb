/**
 * cssz-utils.js — sdílená výpočetní knihovna pro důchody, vdovský, sirotčí, PN.
 * Zdroj pravdy pro všechny kalkulačky v portálu (důchodová, pojistná, ostatní).
 *
 * Změny v této knihovně se okamžitě projeví ve všech kalkulačkách.
 *
 * Norma: zákon č. 155/1995 Sb. (důchodové pojištění), č. 187/2006 (nemocenské),
 * č. 589/1992 (sociální pojištění OSVČ), reforma 2024 (zák. 270/2023 Sb.),
 * MPSV vyhláška a sdělení 2026.
 *
 * Verze: 2026-05-22
 */
(function (root) {
  'use strict';

  // ═══════════════════════════════════════════════════════════
  // ČSSZ KONSTANTY 2026
  // ═══════════════════════════════════════════════════════════
  const CSSZ = {
    rh1: 21546, rh2: 195868, rh1zapocet: 0.99,
    zakladVymera: 4900,
    dnp_rh1: 1633, dnp_rh2: 2449, dnp_rh3: 4897,
    vdovskaPctVymery: 0.50,
    sirotciPctVymery: 0.40,
    // Minima procentních výměr (§ 33, MPSV vyhláška 2026)
    sirotciMinProc: 1960,
    vdovskaMinProc: 2450,
    // Minimum celkového důchodu — reforma 2026 (§ 107, 14 % průměrné mzdy 48 967)
    sirotciMinCelkem: 6860,
    // Měsíční hranice pro 23 % sazbu daně 2026 = 3× průměrná mzda 48 967
    danHranice23: 146901,
    // Sleva na poplatníka 2026: 30 840 Kč/rok = 2 570 Kč/měsíc
    slevaPoplatnikMesic: 2570,
    // Garantovaný minimální starobní/invalidní důchod 2026 = 20 % průměrné mzdy
    minStarobni: 9800,
    // Výchovné za vychované dítě (od 2026)
    vychovnePerDite: 500,
  };

  // Modelový reálný růst mzdy klienta nad inflací (% p.a.).
  // mzda_v_roce_X (v dnešní hodnotě) = dnešní_mzda / (1 + růst)^(2026 − rok)
  const MZDOVY_RUST_REAL = 0.015;

  // ═══════════════════════════════════════════════════════════
  // DŮCHODOVÝ VĚK — příloha zák. 155/1995 Sb. (po reformě 2024)
  // ═══════════════════════════════════════════════════════════
  // Vrací důchodový věk v měsících (např. 65 let 8 měsíců = 788).
  function duchodovyVekMesicu(rokNarozeni, pohlavi, pocetDeti) {
    // Pro narozené po 1988: 67 let (strop dle reformy 2024)
    if (rokNarozeni > 1988) return 67 * 12;

    // Pro narozené 1974–1988: 65 let 8 měsíců + (rok − 1973) měsíců, max 67
    if (rokNarozeni >= 1974 && rokNarozeni <= 1988) {
      const zaklad = 65 * 12 + 8;
      return Math.min(67 * 12, zaklad + (rokNarozeni - 1973));
    }

    // Tabulka muži / bezdětné ženy — příloha zák. 155/1995 + reforma 2024
    const tabM = {
      1953: [63,2], 1954: [63,4], 1955: [63,6], 1956: [63,8], 1957: [63,10],
      1958: [64,0], 1959: [64,2], 1960: [64,4], 1961: [64,6], 1962: [64,8],
      1963: [64,10],
      1964: [65,0], 1965: [65,0], 1966: [65,1], 1967: [65,2], 1968: [65,3],
      1969: [65,4], 1970: [65,5], 1971: [65,6], 1972: [65,7], 1973: [65,8],
    };

    let baseMesicu;
    if (tabM[rokNarozeni]) {
      baseMesicu = tabM[rokNarozeni][0] * 12 + tabM[rokNarozeni][1];
    } else if (rokNarozeni < 1953) {
      baseMesicu = 63 * 12;
    } else {
      baseMesicu = 65 * 12 + 8;
    }

    // Ženy s dětmi: snížení v měsících (§ 32 + příl. zák. 155/1995)
    // Efekt mizí postupně u ročníků 1972+ (reforma 2024)
    if (pohlavi === 'F' && pocetDeti > 0 && rokNarozeni <= 1971) {
      const snizeniPerDite = { 1: 4, 2: 8, 3: 14, 4: 14, 5: 20 };
      const snizeni = snizeniPerDite[Math.min(pocetDeti, 5)] || 20;
      let efekt = 1.0;
      if (rokNarozeni >= 1966) efekt = Math.max(0, (1972 - rokNarozeni) / 6);
      baseMesicu = Math.max(60 * 12, baseMesicu - Math.round(snizeni * efekt));
    }

    return baseMesicu;
  }

  // Procentní sazba za rok pojištění dle roku přiznání (MPSV).
  // Reforma 2024: 1,5 % postupně klesá na 1,45 % v 2035.
  function sazbaProcentniVymery(rokPriznani) {
    if (rokPriznani < 2026) return 0.015;
    if (rokPriznani === 2026) return 0.01495;
    if (rokPriznani === 2027) return 0.01490;
    if (rokPriznani === 2028) return 0.01485;
    if (rokPriznani === 2029) return 0.01480;
    if (rokPriznani === 2030) return 0.01475;
    if (rokPriznani === 2031) return 0.01470;
    if (rokPriznani === 2032) return 0.01465;
    if (rokPriznani >= 2035) return 0.01450;
    return 0.01465 - 0.00005 * (rokPriznani - 2032);
  }

  // Zápočet do první redukční hranice dle roku přiznání.
  // Reforma 2026: 99 % klesá o 1 % p.a. do 90 % v 2035.
  function zapocetRh1(rokPriznani) {
    if (rokPriznani < 2026) return 1.00;
    if (rokPriznani >= 2035) return 0.90;
    return 1.00 - 0.01 * (rokPriznani - 2025);
  }

  // ═══════════════════════════════════════════════════════════
  // DAŇOVÉ VÝPOČTY
  // ═══════════════════════════════════════════════════════════
  // Iterativně odhadne hrubou mzdu zaměstnance z čisté (vše měsíční).
  // Sleva na poplatníka 2 570 Kč/měs (= 30 840 / 12). Pro daň > 23% hranice
  // (3× průměrná mzda) progresivní sazba 23 % nad hranicí.
  function cistyNaHruby(cisty) {
    let hruba = cisty * 1.35;
    const hranice23 = CSSZ.danHranice23;
    const sleva = CSSZ.slevaPoplatnikMesic;
    for (let i = 0; i < 10; i++) {
      const odvody = hruba * 0.11; // SP 6,5 % + ZP 4,5 %
      const dan = hruba <= hranice23
        ? Math.max(hruba * 0.15 - sleva, 0)
        : Math.max(hranice23 * 0.15 + (hruba - hranice23) * 0.23 - sleva, 0);
      const diff = cisty - (hruba - odvody - dan);
      if (Math.abs(diff) < 50) break;
      hruba += diff * 0.8;
    }
    return Math.round(hruba);
  }

  // Iterativně odhadne měsíční vyměřovací základ OSVČ z čistého příjmu.
  // VZ = 50 % daňového základu (§ 5b zák. 589/1992).
  // Sleva na poplatníka 2 570 Kč/měs (stejná jako zaměstnanec).
  function osvcZakladMes(prijemCisty) {
    const sleva = CSSZ.slevaPoplatnikMesic;
    let zaklad = prijemCisty * 1.7;
    for (let i = 0; i < 20; i++) {
      const vz = zaklad * 0.50;
      const sp = vz * 0.292;
      const zp = vz * 0.135;
      const dan = Math.max((zaklad - sp - zp) * 0.15 - sleva, 0);
      const diff = prijemCisty - (zaklad - sp - zp - dan);
      if (Math.abs(diff) < 100) break;
      zaklad += diff * 0.8;
    }
    return zaklad;
  }

  // ═══════════════════════════════════════════════════════════
  // OVZ (osobní vyměřovací základ) — model reálného růstu mzdy
  // ═══════════════════════════════════════════════════════════
  // hrubaMes — dnešní (2026) hrubá nebo VZ OSVČ
  // rokZacatku — kdy klient začal být pojištěn (typicky věk 18)
  // rokKonce — poslední rok rozhodného období (2025 pro invalidní; rokPriznani-1 pro starobní)
  function spocitejOVZ(hrubaMes, rokZacatku, rokKonce) {
    const prvniRok = Math.max(rokZacatku, 1986);
    const posledniRok = Math.min(rokKonce, 2099);

    let sumValVZ = 0;
    let pocetDni = 0;
    for (let rok = prvniRok; rok <= posledniRok; rok++) {
      const letOdDneska = 2026 - rok; // > 0 minulost, < 0 budoucnost
      const realnaMzda = hrubaMes / Math.pow(1 + MZDOVY_RUST_REAL, letOdDneska);
      sumValVZ += realnaMzda * 12;
      pocetDni += 365;
    }
    return {
      ovzMes: pocetDni > 0 ? Math.round(sumValVZ / pocetDni * 30.4167) : 0,
      prvniRok,
      posledniRok,
    };
  }

  // Redukce OVZ → výpočtový základ (§ 16 zák. 155/1995).
  function redukujOVZ(ovzMes, rokPriznani) {
    const { rh1, rh2 } = CSSZ;
    const zap1 = zapocetRh1(rokPriznani);
    let redOVZ;
    if (ovzMes <= rh1) redOVZ = ovzMes * zap1;
    else if (ovzMes <= rh2) redOVZ = rh1 * zap1 + (ovzMes - rh1) * 0.26;
    else redOVZ = rh1 * zap1 + (rh2 - rh1) * 0.26;
    return Math.ceil(redOVZ);
  }

  // ═══════════════════════════════════════════════════════════
  // INVALIDNÍ DŮCHOD (I/II/III stupeň) — hypotetický "kdyby vznikl teď"
  // ═══════════════════════════════════════════════════════════
  function odhadInvDuc(prijemCisty, rokNarozeni, pohlavi, pocetVychDeti, stupen, isOSVC, rokZacatku) {
    const hrubaMes = isOSVC
      ? osvcZakladMes(prijemCisty) * 0.50 // VZ = 50 % daňového základu
      : cistyNaHruby(prijemCisty);

    const vek = 2026 - rokNarozeni;
    const rokPojisteni = rokZacatku || (2026 - Math.max(vek - 18, 1));

    const { ovzMes, prvniRok, posledniRok } = spocitejOVZ(hrubaMes, rokPojisteni, 2025);

    const rokPriznaniInv = 2026;
    const redOVZ = redukujOVZ(ovzMes, rokPriznaniInv);

    // Doba pojištění = odpracovaná + dopočtená do důchodového věku (§ 41)
    const odprac = posledniRok - prvniRok + 1;
    const ducVekRoku = duchodovyVekMesicu(rokNarozeni, pohlavi, pocetVychDeti) / 12;
    const dopoctena = Math.max(Math.round(ducVekRoku - vek), 0);
    const celk = odprac + dopoctena;

    const sazba = sazbaProcentniVymery(rokPriznaniInv);
    const plnaIII = redOVZ * celk * sazba;
    const mult = { I: 1 / 3, II: 1 / 2, III: 1.0 }[stupen];
    const minProcVym = { I: 1634, II: 2450, III: 4900 }[stupen];
    const procVym = Math.max(Math.round(plnaIII * mult), minProcVym);

    return {
      duchod: Math.round(CSSZ.zakladVymera + procVym),
      zakladVymera: CSSZ.zakladVymera,
      procVym,
      redOVZ,
      celkDoba: celk,
      odprac,
      dopoctena,
      ovzMes,
      rokZacatku: prvniRok,
      ducVekRoku,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // VDOVSKÝ DŮCHOD — § 50 zák. 155/1995
  // ═══════════════════════════════════════════════════════════
  function vdovskyDuc(prijemCisty, rokNarozeni, pohlavi, pocetVychDeti, isOSVC, maDetiNeboZav, rokZacatku) {
    const inv3 = odhadInvDuc(prijemCisty, rokNarozeni, pohlavi, pocetVychDeti, 'III', isOSVC, rokZacatku);
    const procVymZemr = Math.max(inv3.procVym, 0);
    // 50 % procentní výměry zemřelého, s minimem 2 450 Kč (MPSV 2026)
    const procVymVdov = Math.max(Math.round(procVymZemr * CSSZ.vdovskaPctVymery), CSSZ.vdovskaMinProc);
    const vdovDucBase = CSSZ.zakladVymera + procVymVdov;

    // Bez dětí má pozůstalý/á nárok pouze 1 rok (§ 50).
    // Celkovou jednorázovou částku (12× měsíční výše) rozprostíráme přes
    // zbývající měsíce do důchodového věku pro účely finančního plánování.
    let duchod = vdovDucBase;
    let rozpoctenoMesicne = null;
    if (!maDetiNeboZav) {
      const aktualniRok = new Date().getFullYear();
      const vek = aktualniRok - rokNarozeni;
      const ducVekRokuFlt = duchodovyVekMesicu(rokNarozeni, pohlavi, pocetVychDeti) / 12;
      const letDoDuch = Math.max(ducVekRokuFlt - vek, 1);
      const mesicuDoDuch = Math.max(Math.round(letDoDuch * 12), 1);
      const rocniSuma = vdovDucBase * 12;
      rozpoctenoMesicne = Math.round(rocniSuma / mesicuDoDuch);
      duchod = rozpoctenoMesicne;
    }

    return {
      duchod,
      mesicniVyplata: vdovDucBase,
      trvaly: maDetiNeboZav,
      trvaniMesicu: maDetiNeboZav ? null : 12,
      rozpoctenoMesicne,
      procVymZemr,
      procVymVdov,
      zakladVymera: CSSZ.zakladVymera,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // SIROTČÍ DŮCHOD — § 52 zák. 155/1995, reforma 2026 (§ 107)
  // ═══════════════════════════════════════════════════════════
  function sirotciDuc(prijemCisty, rokNarozeni, pohlavi, pocetVychDeti, isOSVC, detiVeky, rokZacatku) {
    const inv3 = odhadInvDuc(prijemCisty, rokNarozeni, pohlavi, pocetVychDeti, 'III', isOSVC, rokZacatku);
    const procVymZemr = Math.max(inv3.procVym, 0);
    // § 33: 40 % procentní výměry zemřelého, min 1 960 Kč
    const sirotciProcVym = Math.max(procVymZemr * CSSZ.sirotciPctVymery, CSSZ.sirotciMinProc);
    let naDite = Math.round(CSSZ.zakladVymera + sirotciProcVym);
    // Reforma 2026: dorovnání na 14 % průměrné mzdy = 6 860 Kč
    const dorovnano = naDite < CSSZ.sirotciMinCelkem;
    if (dorovnano) naDite = CSSZ.sirotciMinCelkem;
    const pocet = (detiVeky && detiVeky.length) || 0;
    return {
      naDite,
      celkem: naDite * pocet,
      pocet,
      procVymZemr,
      sirotciProcVym: Math.round(sirotciProcVym),
      dorovnano,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // STAROBNÍ DŮCHOD — projekce do budoucna
  // ═══════════════════════════════════════════════════════════
  function starobniDuc(prijemCisty, rokNarozeni, pohlavi, pocetVychDeti, isOSVC, rokZacatku) {
    const ducVekMes = duchodovyVekMesicu(rokNarozeni, pohlavi, pocetVychDeti);
    const ducVekRoku = Math.floor(ducVekMes / 12);
    const ducVekMesicu = ducVekMes % 12;
    const rokPriznani = rokNarozeni + ducVekRoku + (ducVekMesicu > 0 ? 1 : 0);

    const hrubaMes = isOSVC
      ? osvcZakladMes(prijemCisty) * 0.50
      : cistyNaHruby(prijemCisty);

    const vek = 2026 - rokNarozeni;
    const rokPojisteni = rokZacatku || (2026 - Math.max(vek - 18, 1));

    const { ovzMes, prvniRok, posledniRok } = spocitejOVZ(hrubaMes, rokPojisteni, rokPriznani - 1);
    const redOVZ = redukujOVZ(ovzMes, rokPriznani);
    const celkLet = posledniRok - prvniRok + 1;
    const sazba = sazbaProcentniVymery(rokPriznani);
    const procVym = Math.round(redOVZ * celkLet * sazba);
    const vychovne = pocetVychDeti * CSSZ.vychovnePerDite;

    let duchod = CSSZ.zakladVymera + procVym + vychovne;
    const dorovnano = duchod < CSSZ.minStarobni;
    if (dorovnano) duchod = CSSZ.minStarobni;

    const letDoDuchodu = rokPriznani - 2026;

    return {
      duchod,
      procVym,
      vychovne,
      zakladVymera: CSSZ.zakladVymera,
      redOVZ,
      ovzMes,
      celkLet,
      sazba,
      zap1: zapocetRh1(rokPriznani),
      rokPriznani,
      ducVekRoku,
      ducVekMesicu,
      letDoDuchodu,
      dorovnano,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // NEMOCENSKÁ / PN (informativně — pro pojistnou kalkulačku)
  // ═══════════════════════════════════════════════════════════
  function vypocetPN(prijemCisty) {
    const hruba = cistyNaHruby(prijemCisty);
    const dvz = hruba * 12 / 365;
    let raw = Math.min(dvz, CSSZ.dnp_rh1) * 0.90;
    if (dvz > CSSZ.dnp_rh1) raw += Math.min(dvz - CSSZ.dnp_rh1, CSSZ.dnp_rh2 - CSSZ.dnp_rh1) * 0.60;
    if (dvz > CSSZ.dnp_rh2) raw += Math.min(dvz - CSSZ.dnp_rh2, CSSZ.dnp_rh3 - CSSZ.dnp_rh2) * 0.30;
    const redDvz = Math.ceil(raw);
    const d15_30 = Math.ceil(redDvz * 0.60);
    const d31_60 = Math.ceil(redDvz * 0.66);
    const d61p = Math.ceil(redDvz * 0.72);
    return { redDvz, d15_30, d31_60, d61p, dvzDenni: Math.round(dvz * 100) / 100, hruba };
  }

  // ═══════════════════════════════════════════════════════════
  // EXPORT (browser globals)
  // ═══════════════════════════════════════════════════════════
  root.CSSZ_UTILS = {
    CSSZ,
    MZDOVY_RUST_REAL,
    duchodovyVekMesicu,
    sazbaProcentniVymery,
    zapocetRh1,
    cistyNaHruby,
    osvcZakladMes,
    spocitejOVZ,
    redukujOVZ,
    odhadInvDuc,
    vdovskyDuc,
    sirotciDuc,
    starobniDuc,
    vypocetPN,
  };

  // Zpětná kompatibilita: zpřístupnit některé symboly jako globální (window),
  // aby existující inline kód v důchodové kalkulačce dál fungoval beze změn.
  root.CSSZ = CSSZ;
  root.MZDOVY_RUST_REAL = MZDOVY_RUST_REAL;
  root.duchodovyVekMesicu = duchodovyVekMesicu;
  root.sazbaProcentniVymery = sazbaProcentniVymery;
  root.zapocetRh1 = zapocetRh1;
  root.cistyNaHruby = cistyNaHruby;
  root.odhadInvDuc = odhadInvDuc;
  root.vdovskyDuc = vdovskyDuc;
  root.sirotciDuc = sirotciDuc;
  root.starobniDuc = starobniDuc;
  root.vypocetPN = vypocetPN;
})(typeof window !== 'undefined' ? window : globalThis);
