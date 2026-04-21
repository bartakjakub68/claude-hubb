import { useState, useRef, useEffect, useCallback } from "react";
import { chat as apiChat, evalChat as apiEval, saveTraining, saveEvaluation, getEvaluations, textToSpeech } from "../services/api.js";
import { useAuth } from "../hooks/useAuth.jsx";

// ╔══════════════════════════════════════════════════════════════╗
// ║  ADVISOR TRAINING v4 – Complete Financial Advisor Simulator ║
// ║  Midnight Emerald Design · All features                     ║
// ╚══════════════════════════════════════════════════════════════╝

// ── DESIGN TOKENS — sjednoceno s hubem ─────────────────────────
const T = {
  bg:"#F6F5F3", bgSub:"#EEECE8", surface:"#FFFFFF", elevated:"#F6F5F3",
  border:"#E2E0DC", borderHover:"#CC0000",
  text:"#1A1A1A", textSoft:"#4A4845", dim:"#8F8C87", dimLight:"#9A9692",
  accent:"#CC0000", accentLight:"#E03333", accentDim:"#A80000", accentBg:"#F9EDED",
  teal:"#1B4332", tealBg:"rgba(27,67,50,0.06)",
  rose:"#CC0000", roseBg:"#F9EDED",
  amber:"#92550A", amberBg:"rgba(146,85,10,0.08)",
  lavender:"#4A4845", silver:"#8F8C87",
  font:"'IBM Plex Sans','Segoe UI',system-ui,sans-serif",
  mono:"'IBM Plex Mono','SF Mono','Consolas',monospace",
};

// ── DATA ───────────────────────────────────────────────────────
const LIFE_SITUATIONS = [
  {id:1,label:"Student VŠ, brigády",age:"19-24",gender:"mix",income:"5-12k",desc:"Student vysoké školy, přivydělává si brigádami.",tags:["young","low-income","no-kids"]},
  {id:2,label:"Čerstvý absolvent, první práce",age:"23-27",gender:"mix",income:"28-35k",desc:"Právě dokončil školu, nastoupil do prvního zaměstnání.",tags:["young","employed","no-kids"]},
  {id:3,label:"Mladý single, stabilní práce",age:"25-32",gender:"mix",income:"35-50k",desc:"Žije sám/sama, má stabilní zaměstnání. Rád/a cestuje.",tags:["young","employed","no-kids","mid-income","single"]},
  {id:4,label:"Mladý pár bez dětí",age:"25-35",gender:"mix",income:"60-90k společně",desc:"Pár ve společné domácnosti, oba mají příjem.",tags:["couple","employed","no-kids","mid-income"]},
  {id:5,label:"Pár čekající první dítě",age:"27-35",gender:"mix",income:"55-80k",desc:"Jeden z partnerů brzy půjde na mateřskou.",tags:["couple","employed","expecting","mid-income"]},
  {id:6,label:"Rodina s malými dětmi (0-6)",age:"28-38",gender:"mix",income:"50-80k",desc:"Jeden rodič na rodičovské nebo oba pracují.",tags:["family","has-kids","mid-income"]},
  {id:7,label:"Rodina s dětmi ve školním věku",age:"32-45",gender:"mix",income:"60-100k",desc:"Děti chodí do školy, kroužky. Rostoucí výdaje.",tags:["family","has-kids","has-school-kids","mid-income"]},
  {id:8,label:"Rodina s teenagery",age:"38-50",gender:"mix",income:"70-120k",desc:"Děti na střední škole nebo začínají VŠ.",tags:["family","has-kids","has-teens","higher-income"]},
  {id:9,label:"Samoživitel/ka s dětmi",age:"28-45",gender:"mix",income:"30-45k",desc:"Vychovává děti sám/sama. Omezený rozpočet.",tags:["single-parent","has-kids","low-income"]},
  {id:10,label:"Rozvedený/á bez dětí",age:"30-50",gender:"mix",income:"35-60k",desc:"Po rozvodu, nový začátek.",tags:["divorced","no-kids","mid-income","single"]},
  {id:11,label:"Rozvedený/á, po vypořádání majetku",age:"35-50",gender:"mix",income:"40-65k + majetek",desc:"Právě proběhlo majetkové vypořádání.",tags:["divorced","has-assets","mid-income"]},
  {id:12,label:"Živnostník / OSVČ, stabilní",age:"28-50",gender:"mix",income:"40-80k (kolísá)",desc:"Podniká několik let, má klientelu.",tags:["self-employed","mid-income","variable-income"]},
  {id:13,label:"Živnostník, rozjíždí podnikání",age:"25-40",gender:"mix",income:"15-30k",desc:"Teprve začíná podnikat. Nejistý příjem.",tags:["self-employed","low-income","variable-income"]},
  {id:14,label:"Zaměstnanec korporátu, střední mgmt",age:"32-48",gender:"mix",income:"60-100k",desc:"Stabilní pozice ve velké firmě.",tags:["employed","corporate","mid-income","has-benefits"]},
  {id:15,label:"Vyšší management / vysoký příjem",age:"38-55",gender:"mix",income:"100-200k",desc:"Manažerská pozice, nadprůměrný příjem.",tags:["employed","corporate","higher-income","has-benefits"]},
  {id:16,label:"Člověk po dědictví",age:"30-55",gender:"mix",income:"různé + dědictví",desc:"Nedávno zdědil nemovitost nebo větší částku.",tags:["has-assets","mid-income"]},
  {id:17,label:"Pár před svatbou",age:"25-35",gender:"mix",income:"60-90k společně",desc:"Plánují svatbu, spojení financí.",tags:["couple","employed","no-kids","mid-income"]},
  {id:18,label:"Prázdné hnízdo – děti odešly",age:"48-58",gender:"mix",income:"70-110k",desc:"Děti se osamostatnily. Více volných prostředků.",tags:["older","adult-kids","higher-income"]},
  {id:19,label:"5-10 let před důchodem",age:"53-62",gender:"mix",income:"40-70k",desc:"Blíží se důchod, řeší zabezpečení.",tags:["pre-retirement","older","mid-income"]},
  {id:20,label:"Čerstvý důchodce",age:"63-70",gender:"mix",income:"důchod 18-25k",desc:"Právě odešel do důchodu.",tags:["retired","low-income","senior"]},
  {id:21,label:"Důchodce, aktivní",age:"65-75",gender:"mix",income:"důchod + přivýdělek",desc:"V důchodu, ale stále aktivní.",tags:["retired","low-income","senior"]},
  {id:22,label:"Cizinec žijící v ČR",age:"25-45",gender:"mix",income:"50-120k",desc:"Pracuje v ČR, mluví česky omezeně.",tags:["foreigner","employed","mid-income"]},
  {id:23,label:"Vracející se z ciziny",age:"28-45",gender:"mix",income:"úspory v EUR/USD",desc:"Vrátil se po letech v zahraničí.",tags:["returning","has-assets","mid-income"]},
  {id:24,label:"Mladý pár – první bydlení",age:"27-35",gender:"mix",income:"60-85k společně",desc:"Hledají nebo už našli byt/dům.",tags:["couple","employed","no-kids","mid-income"]},
  {id:25,label:"Po ztrátě zaměstnání",age:"30-50",gender:"mix",income:"dočasně nízký",desc:"Nedávno přišel o práci.",tags:["unemployed","low-income"]},
  {id:26,label:"IT freelancer / vysokopříjmový OSVČ",age:"25-40",gender:"mix",income:"80-180k",desc:"Programátor nebo konzultant na volné noze.",tags:["self-employed","higher-income","variable-income","tech"]},
  {id:27,label:"Matka/otec na rodičovské",age:"25-38",gender:"mix",income:"rodičovský příspěvek + partner",desc:"Na rodičovské dovolené, partner pracuje.",tags:["family","has-kids","low-income","parental-leave"]},
  {id:28,label:"Podnikatel s.r.o., menší firma",age:"30-50",gender:"mix",income:"60-150k (kolísá)",desc:"Vlastní malou firmu, 3-15 zaměstnanců.",tags:["business-owner","higher-income","variable-income"]},
  {id:29,label:"Člověk s invalidním důchodem",age:"30-60",gender:"mix",income:"inv. důchod 12-20k + příjem",desc:"Pobírá invalidní důchod, částečně pracuje.",tags:["disability","low-income"]},
  {id:30,label:"Mladý po dědictví, nezkušený",age:"22-30",gender:"mix",income:"28-45k + dědictví 1-3M",desc:"Zdědil neočekávaně velkou sumu, nemá finanční zkušenosti.",tags:["young","has-assets","inexperienced"]},
];

const VISIT_REASONS = [
  {id:1,label:"Založení běžného účtu",products:"Tarify Start/Standard/Premium/Top, KB+"},{id:2,label:"Spořicí účet / kam uložit peníze",products:"Spořicí účet KB, Termínovaný účet"},
  {id:3,label:"Stavební spoření",products:"Moudré spoření MP"},{id:4,label:"Stavební spoření pro dítě",products:"Moudré spoření MP pro děti"},
  {id:5,label:"Penzijní spoření",products:"DPS KB Penzijní společnost"},{id:6,label:"Hypotéka",products:"Hypotéka KB"},
  {id:7,label:"Refinancování hypotéky",products:"Hypotéka KB – refinancování"},{id:8,label:"Osobní půjčka",products:"Půjčka na cokoli KB"},
  {id:9,label:"Konsolidace půjček",products:"Konsolidace KB"},{id:10,label:"Začít investovat",products:"Fondy Amundi, DIP, Zlato"},
  {id:11,label:"Životní pojištění",products:"Životní pojištění KB"},{id:12,label:"Pojištění majetku",products:"MojePojištění majetku KB"},
  {id:13,label:"Přechod z jiné banky",products:"Tarify KB+, kompletní portfolio"},{id:14,label:"Produkty pro dítě",products:"Dětský účet, stavebko MP, dětské penzijko"},
  {id:15,label:"Kreditní karta",products:"Kreditní karty KB"},{id:16,label:"Půjčka na rekonstrukci",products:"Půjčka na bydlení KB, Rychloúvěr MP"},
  {id:17,label:"Finanční plán celkově",products:"Finanční poradenství KB"},{id:18,label:"Končí fixace hypotéky",products:"Refixace / refinancování KB"},
  {id:19,label:"DIP – Dlouhodobý investiční produkt",products:"DIP KB, daňové zvýhodnění"},{id:20,label:"Podnikatelský účet",products:"Podnikatelský účet KB, Profi účet"},
  {id:21,label:"Pojištění odpovědnosti / cestovní",products:"Pojištění odpovědnosti KB"},{id:22,label:"Předčasné splacení hypotéky",products:"Mimořádná splátka hypotéky KB"},
  {id:23,label:"Změna tarifu / služeb",products:"Tarify KB+, mobilní banka, KB Klíč"},{id:24,label:"Reklamace / nespokojenost",products:"Zákaznický servis, eskalace"},
];

const HIGHLIGHT_GOALS = [
  {id:1,goal:"Dcera/syn chce hypotéku na 6+ mil. Kč",hint:"Ptát se na rodinu a plány dětí",product:"Hypotéka KB",reqTags:["has-kids","has-teens","adult-kids"],exclTags:["no-kids","young"]},
  {id:2,goal:"Partner čeká dítě – plánují větší bydlení",hint:"Ptát se na změny v rodině",product:"Hypotéka KB, Životní pojištění",reqTags:["couple"],exclTags:["single","retired","senior"]},
  {id:3,goal:"Přemýšlí o podnikání / odchodu ze zaměstnání",hint:"Ptát se na kariérní plány",product:"Podnikatelský účet KB",reqTags:["employed"],exclTags:["retired","self-employed","business-owner","unemployed"]},
  {id:4,goal:"Zdědil nemovitost a neví co s ní",hint:"Ptát se na majetek, nedávné události",product:"Pojištění majetku, Investice",reqTags:[],exclTags:[]},
  {id:5,goal:"Rodiče stárnou, bude je potřeba finančně podpořit",hint:"Ptát se na širší rodinu",product:"Finanční plánování, Spoření",reqTags:[],exclTags:["young","senior"]},
  {id:6,goal:"Plánuje rozvod, potřebuje si zajistit finance",hint:"Ptát se na životní situaci",product:"Vlastní účet, finanční plán",reqTags:["couple","family"],exclTags:["single","divorced"]},
  {id:7,goal:"Má půjčky u jiných bank, které ho tíží",hint:"Ptát se na závazky a splátky",product:"Konsolidace KB",reqTags:[],exclTags:[]},
  {id:8,goal:"Zaměstnavatel nabízí příspěvek na penzijko/životko, ale nevyužívá",hint:"Ptát se na zaměstnanecké benefity",product:"DPS KB PS, Životní pojištění",reqTags:["employed"],exclTags:["unemployed","retired","self-employed"]},
  {id:9,goal:"Chce se přestěhovat do zahraničí za 2-3 roky",hint:"Ptát se na dlouhodobé plány",product:"Multiměnový účet, Investice v EUR",reqTags:[],exclTags:["senior","retired"]},
  {id:10,goal:"Partner přišel o práci, potřebují přehodnotit finance",hint:"Ptát se na příjmy domácnosti",product:"Finanční plán, Rezerva",reqTags:["couple","family"],exclTags:["single"]},
  {id:11,goal:"Má 300k+ v hotovosti doma",hint:"Ptát se na úspory mimo banku",product:"Spořicí účet, Investice",reqTags:[],exclTags:[]},
  {id:12,goal:"Chce nechat byt dětem, ale potřebuje z něj příjem",hint:"Ptát se na nemovitosti",product:"Investice, Penzijko",reqTags:["older","adult-kids"],exclTags:["young","no-kids"]},
  {id:13,goal:"Blíží se mu 60, zvažuje předdůchod",hint:"Ptát se na plány do důchodu",product:"DPS KB PS – předdůchod",reqTags:["pre-retirement","older"],exclTags:["young"]},
  {id:14,goal:"Má nevýhodné životní pojištění u konkurence",hint:"Ptát se na stávající pojistky",product:"Životní pojištění KB",reqTags:[],exclTags:[]},
  {id:15,goal:"Dostal odstupné 200k+ a neví kam s ním",hint:"Ptát se na nedávné pracovní změny",product:"Spořicí účet, Investice, Stavebko",reqTags:[],exclTags:["retired"]},
  {id:16,goal:"Plánuje svatbu – potřebuje 300-500k",hint:"Ptát se na osobní plány",product:"Půjčka na cokoli, Spoření",reqTags:["couple"],exclTags:["senior","retired"]},
  {id:17,goal:"Dítě jde na VŠ, potřebuje financovat studium",hint:"Ptát se na děti",product:"Půjčka, Výběr ze stavebka",reqTags:["has-teens","adult-kids"],exclTags:["no-kids","young"]},
  {id:18,goal:"Naspořeno na stavebku, neví jestli vybrat",hint:"Ptát se na stávající stavební spoření",product:"Prodloužení MP, Investice",reqTags:[],exclTags:[]},
  {id:19,goal:"Prodal nemovitost/auto, má neobvyklou sumu",hint:"Ptát se na zdroj větší částky",product:"Termínovaný účet, Investice",reqTags:[],exclTags:[]},
  {id:20,goal:"Chtějí koupit chalupu / rekreační nemovitost",hint:"Ptát se na přání a sny",product:"Hypotéka KB",reqTags:[],exclTags:["low-income","young"]},
  {id:21,goal:"Končí fixace hypotéky u konkurence za 6 měsíců",hint:"Ptát se na současnou hypotéku",product:"Refinancování hypotéky KB",reqTags:[],exclTags:["young"]},
  {id:22,goal:"Chce investovat, ale nemá bezpečnostní polštář",hint:"Ptát se na finanční rezervu",product:"Spořicí účet (rezerva), Životní pojištění",reqTags:[],exclTags:[]},
  {id:23,goal:"Má staré penzijko (transformovaný fond)",hint:"Ptát se na typ penzijního spoření",product:"Převod na DPS KB PS",reqTags:[],exclTags:["young"]},
  {id:24,goal:"Plánuje rekonstrukci za 800k-1.5M Kč",hint:"Ptát se na plány s bydlením",product:"Půjčka na bydlení KB, Úvěr MP",reqTags:[],exclTags:[]},
  {id:25,goal:"Chce financovat vzdělání dětí v zahraničí",hint:"Ptát se na vzdělávání dětí",product:"Investice, Multiměnový účet",reqTags:["has-kids","has-teens"],exclTags:["no-kids"]},
  {id:26,goal:"Má 3 stavební spoření neoptimálně nastavené",hint:"Ptát se na portfolio produktů",product:"Optimalizace stavebek MP",reqTags:[],exclTags:[]},
  {id:27,goal:"Má stavebko u konkurenční spořitelny",hint:"Ptát se na produkty u jiných bank",product:"Moudré spoření MP",reqTags:[],exclTags:[]},
  {id:28,goal:"Chce darovat vnoučatům peníze daňově efektivně",hint:"Ptát se na rodinu a vnuky",product:"Dětské stavebko MP, Dětské penzijko",reqTags:["senior","older","adult-kids"],exclTags:["young","no-kids"]},
  {id:29,goal:"Má dluh na kreditce u jiné banky 100k+",hint:"Ptát se na závazky",product:"Konsolidace KB, Půjčka na cokoli",reqTags:[],exclTags:[]},
  {id:30,goal:"Plánuje koupit investiční byt na pronájem",hint:"Ptát se na investiční plány",product:"Hypotéka KB, Pojištění majetku",reqTags:[],exclTags:["low-income","young"]},
  {id:31,goal:"Chce založit DIP a využít daňové zvýhodnění",hint:"Ptát se na daňovou optimalizaci",product:"DIP KB",reqTags:["employed"],exclTags:["retired"]},
  {id:32,goal:"Má nevyužitý benefit – zaměstnavatel přispívá na DIP",hint:"Ptát se na benefity a investice",product:"DIP KB, DPS KB PS",reqTags:["employed","has-benefits"],exclTags:["unemployed","retired","self-employed"]},
  {id:33,goal:"Manžel/ka tajně nadělal/a dluhy",hint:"Ptát se na finanční situaci partnera",product:"Konsolidace, vlastní účet",reqTags:["couple","family"],exclTags:["single"]},
  {id:34,goal:"Zvažuje předčasný odchod do důchodu",hint:"Ptát se na představy o budoucnosti",product:"DPS předdůchod, Investice",reqTags:["pre-retirement","older"],exclTags:["young"]},
  {id:35,goal:"Chce pojistit nově koupenou nemovitost",hint:"Ptát se na bydlení a nedávné změny",product:"MojePojištění majetku KB",reqTags:[],exclTags:[]},
];

const PERSONAL_DETAILS = [
  "Pracuje jako manažer skladu v logistické firmě","Je učitelka na základní škole","Pracuje jako programátor v IT firmě","Je účetní ve střední firmě","Pracuje jako řidič kamionu, často mimo domov",
  "Je zdravotní sestra v nemocnici","Pracuje jako prodavačka v OC","Je stavbyvedoucí","Pracuje jako úředník na městském úřadě","Je mechanik v autoservisu",
  "Pracuje v marketingu","Je kuchař v restauraci, nepravidelné směny","Pracuje jako obchodní zástupce, cestuje po ČR","Je grafik na volné noze","Pracuje jako elektrikář, OSVČ",
  "Je právnička v advokátní kanceláři","Pracuje jako recepční v hotelu","Je hasič, služby 24/48h","Pracuje jako farmaceut v lékárně","Je policista, pravidelné směny",
  "Je lektor/ka v jazykové škole","Pracuje jako DevOps inženýr, remote","Je trenér/ka fitness, OSVČ","Pracuje jako dispečer/ka záchranné služby","Je realitní makléř/ka",
  "Pracuje jako zubní lékař/ka","Je novinář/ka na volné noze","Pracuje jako sociální pracovnice","Je veterinář/ka","Pracuje jako architekt/ka",
];

const FINANCIAL_DETAILS = [
  "Má 500k v dluhopisech u jiné banky","Splácí hypotéku 18k/měsíc, zbývá 12 let","Má 3 stavebka u různých spořitelen, celkem 280k","Nemá žádné investice ani spoření, jen běžný účet",
  "Má kontokorent -50k, pravidelně čerpá","Má penzijko od 25 let, zaměstnavatel přispívá 1500 Kč","Má životní pojištění u konkurence za 1200 Kč/měsíc","Má 200k na spořáku u jiné banky za 0,5%",
  "Splácí spotřebitelský úvěr 8k/měsíc, zbývají 3 roky","Má investiční portfolio 1,2 mil. u konkurence","Má 800k na termínovaném vkladu, za měsíc končí","Má staré penzijní připojištění v TF, 500k",
  "Nemá žádné pojištění – ani životní, ani majetkové","Má 2 kreditní karty, celkový dluh 85k","Má stavebko u MP, vázací lhůta končí za 3 měsíce, 350k","Má hypotéku u jiné banky, fixace končí za 8 měsíců",
  "Měsíčně ušetří 5-8k bez systému","Má účet u KB tarif Start, jinak nic","Má DIP u konkurence s vysokými poplatky","Dostal roční bonus 150k, neví co s ním",
  "Má úspory 2M Kč na běžném účtu, bojí se investovat","Platí 3 různé pojistky u 3 pojišťoven, dohromady 4500 Kč/měsíc","Má mikropůjčky od 3 nebankovních poskytovatelů, celkem 120k",
  "Spoří 20k/měsíc do obálky doma","Má kryptoměny za cca 300k, jiné investice ne","Má DPS s minimálním vkladem 300 Kč/měsíc, zaměstnavatel by přispíval až 3000 Kč",
  "Má staré stavebko u ČMSS s úrokem 1%, zůstatek 450k","Má předschválenou hypotéku u konkurence",
];

const CLIENT_GOALS = [
  "Naspořit dítěti 400k do 18 let","Splatit hypotéku do 50 let","Vytvořit rezervu na 6 měsíčních platů","Zajistit se na důchod – cíl 15k/měsíc navíc",
  "Koupit auto za 2 roky – potřebuje 600k","Mít pasivní příjem 10-15k/měsíc v důchodu","Za 5 let koupit větší byt","Začít investovat bezpečně",
  "Optimalizovat daně (odpočty z penzijka, životka a DIPu)","Mít všechny finance u jedné banky","Připravit zázemí pro případ ztráty zaměstnání","Naspořit na dovolenou 120k do příštího léta",
  "Refinancovat půjčky a snížit splátky","Začít konečně rozumně spořit","Zajistit rodinu pro případ neštěstí","Maximalizovat státní podporu a daňové výhody",
  "Vybudovat portfolio – za 15 let 3 mil. Kč","Pomoct dětem s financováním bydlení","Pojistit novou nemovitost a domácnost","Konsolidovat finance od 4 různých bank",
  "Nastavit pravidelné investování 5-10k měsíčně","Využít plně daňové odpočty – penzijko + DIP + životko","Zbavit se všech dluhů do 3 let","Naspořit na sabbatical 500k",
  "Připravit finanční plán pro 2 děti","Mít finanční nezávislost do 50 let",
];

const OBJECTIONS = [
  "U Moneta/ČSOB/Raiffeisen mi dávají lepší úrok.","Musím se poradit s manželkou/manželem.","Nemám teď čas to řešit, přijdu jindy.","Poplatky u vás jsou vysoké.",
  "Nechci mít všechno u jedné banky.","Investice jsou rizikové, radši spořák.","To jsem už řešil a nebylo to dobré.","Proč bych měl měnit to, co funguje?",
  "Nemám na to peníze.","Online banka mi stačí a nic neplatím.","Kamarád říkal, že pojistky jsou zbytečné.","To si potřebuju nejdřív nastudovat.",
  "Mám špatnou zkušenost s finančními poradci.","Nechci se zavazovat na dlouho.","Vyhovuje mi hotovost, nechci vše na účtu.",
];

const FINANCIAL_LITERACY = [
  {id:"beginner",name:"Laik",desc:"Nerozumí finančním pojmům. Neví co je DPS, DIP, ETF.",emoji:"📖"},
  {id:"basic",name:"Základní znalosti",desc:"Ví co je spořicí účet a pojistka. Slyšel o investicích.",emoji:"📗"},
  {id:"intermediate",name:"Průměrná gramotnost",desc:"Rozumí základním produktům, zná rozdíl mezi fondy.",emoji:"📘"},
  {id:"advanced",name:"Poučený klient",desc:"Aktivně se zajímá o finance. Porovnává produkty. Zná TER.",emoji:"📕"},
];

const BANK_EXPERIENCE = [
  {id:"first-time",name:"Poprvé u poradce",desc:"Nikdy nenavštívil poradce. Nervózní."},
  {id:"occasional",name:"Občasný návštěvník",desc:"Byl u poradce 1-2x. Základní představa."},
  {id:"regular",name:"Pravidelný klient",desc:"Chodí na schůzky pravidelně."},
  {id:"bad-experience",name:"Špatná zkušenost",desc:"Předchozí poradce zklamal. Nedůvěřivý."},
];

const DIFFICULTIES = [
  {level:1,name:"Otevřený",emoji:"★",color:T.accent,desc:"Sám říká informace, pomáhá poradci, sdílí i bez ptaní.",patience:"velmi vysoká",canLeave:false,plusFactors:false},
  {level:2,name:"Přátelský",emoji:"★★",color:"#22c55e",desc:"Odpovídá ochotně, ale čeká na otázky – sám neiniciuje.",patience:"vysoká",canLeave:false,plusFactors:false},
  {level:3,name:"Neutrální",emoji:"★★★",color:T.amber,desc:"Odpovídá stručně, jen na to co se ptáte, nic navíc.",patience:"střední",canLeave:true,leaveAfter:24,warnAfter:18,eventChance:0.15,plusFactors:false},
  {level:3.5,name:"Neutrální+",emoji:"★★★+",color:T.amber,desc:"Neutrální klient + komplikující faktor (cizinec, stres, čas...).",patience:"střední",canLeave:true,leaveAfter:24,warnAfter:18,eventChance:0.15,plusFactors:true,plusLevel:1},
  {level:4,name:"Rezervovaný",emoji:"★★★★",color:"#f97316",desc:"Některé info nesdílí snadno. Na osobní otázky reaguje vyhýbavě.",patience:"nižší",canLeave:true,leaveAfter:20,warnAfter:14,eventChance:0.15,plusFactors:false},
  {level:4.5,name:"Rezervovaný+",emoji:"★★★★+",color:"#f97316",desc:"Rezervovaný klient + komplikující faktor.",patience:"nižší",canLeave:true,leaveAfter:20,warnAfter:14,eventChance:0.15,plusFactors:true,plusLevel:2},
  {level:5,name:"Obtížný",emoji:"★★★★★",color:T.rose,desc:"Na špatné otázky reaguje podrážděně. Nedůvěřivý. Říká minimum.",patience:"nízká",canLeave:true,leaveAfter:16,warnAfter:10,eventChance:0.30,eventDouble:0.05,plusFactors:false},
  {level:5.5,name:"Obtížný+",emoji:"★★★★★+",color:T.rose,desc:"Obtížný klient + nejtěžší komplikace (lže, etické dilema...).",patience:"nízká",canLeave:true,leaveAfter:16,warnAfter:10,eventChance:0.30,eventDouble:0.05,plusFactors:true,plusLevel:3},
];

const PERSONALITIES = [
  {id:"analyst",name:"Analytik",desc:"Chce čísla, srovnání, konkrétní data. Ptá se na poplatky a výnosnost."},
  {id:"emotional",name:"Emotivní",desc:"Rozhoduje se pocitově, reaguje na příběhy. Záleží mu na pocitu bezpečí."},
  {id:"pragmatist",name:"Pragmatik",desc:"Chce rychlé praktické řešení. Neptá se na detaily."},
  {id:"indecisive",name:"Nerozhodný",desc:"Bojí se rozhodnout, potřebuje ujištění."},
  {id:"dominant",name:"Dominantní",desc:"Chce mít kontrolu, nechce být poučován. Přerušuje."},
  {id:"passive",name:"Pasivní",desc:"Nechá se vést, souhlasí s návrhy. Říká málo."},
  {id:"skeptic",name:"Skeptik",desc:"Hledá háčky, zpochybňuje doporučení."},
  {id:"rushing",name:"Spěchající",desc:"Nemá čas, chce jít k věci."},
  {id:"chatty",name:"Upovídaný",desc:"Hodně mluví, odbíhá od tématu, vypráví historky."},
  {id:"comparing",name:"Srovnávač",desc:"Neustále srovnává s konkurencí."},
];

const KB_STATUSES = [
  {id:"new",name:"Nový klient",desc:"Nemá u KB nic.",products:[]},
  {id:"basic",name:"Stávající – základní",desc:"Má běžný účet a spořicí účet.",products:[
    {name:"Běžný účet KB+ Standard",balance:"23 450 Kč",lastTx:[{date:"25.02.2026",desc:"Výplata",amount:"+42 000 Kč"},{date:"24.02.2026",desc:"Albert potraviny",amount:"-1 230 Kč"},{date:"23.02.2026",desc:"Nájem",amount:"-14 500 Kč"}]},
    {name:"Spořicí účet KB",balance:"85 200 Kč",lastTx:[{date:"01.02.2026",desc:"Připsání úroků",amount:"+142 Kč"},{date:"25.01.2026",desc:"Pravidelný převod",amount:"+5 000 Kč"}]},
  ]},
  {id:"multi",name:"Stávající – více produktů",desc:"Má účet, kartu, stavebko, penzijko.",products:[
    {name:"Běžný účet KB+ Premium",balance:"67 890 Kč",lastTx:[{date:"25.02.2026",desc:"Výplata",amount:"+68 000 Kč"},{date:"24.02.2026",desc:"Lidl",amount:"-2 150 Kč"}]},
    {name:"Spořicí účet KB",balance:"245 000 Kč",lastTx:[{date:"01.02.2026",desc:"Úroky",amount:"+408 Kč"}]},
    {name:"Moudré spoření MP",balance:"182 000 Kč",lastTx:[{date:"15.02.2026",desc:"Pravidelný vklad",amount:"+1 700 Kč"}]},
    {name:"DPS KB Penzijní společnost",balance:"340 000 Kč",lastTx:[{date:"20.02.2026",desc:"Vlastní příspěvek",amount:"+1 000 Kč"}]},
  ]},
  {id:"returning",name:"Vracející se klient",desc:"Dříve měl účet, odešel, zvažuje návrat.",products:[
    {name:"Běžný účet KB (neaktivní)",balance:"320 Kč",lastTx:[{date:"15.08.2024",desc:"Poplatek",amount:"-39 Kč"}]},
  ]},
];

// ── PLUS FACTORS for difficulty 3+/4+/5+ ──
const PLUS_FACTORS = {
  1: [ // level 3+
    {id:"time-pressure",name:"Časový tlak",prompt:"ČASOVÝ TLAK: Máš přibližně 12 minut. Odpovídej kratčeji (max 1-2 věty). Po polovině času připomeň že spěcháš. Na konci řekni 'Promiňte, musím jít'. Highlight cíl můžeš prozradit rychleji."},
    {id:"foreigner-good",name:"Cizinec (dobrá čeština)",prompt:"JAZYKOVÁ BARIÉRA: Mluvíš česky dobře, ale občas hledáš správné slovo. Na složitější finanční pojmy se ptej co to znamená. Můžeš občas použít anglické slovo."},
    {id:"mild-stress",name:"Mírný stres",prompt:"STRES: Máš stresující období (problémy v práci/rodině). Občas ztrácíš pozornost, přeskakuješ mezi tématy. Na empatii reaguj otevřeněji. Na tlak se uzavři."},
    {id:"bad-bank-exp",name:"Špatná zkušenost s bankami",prompt:"ŠPATNÁ ZKUŠENOST: Předchozí poradce ti dal špatné rady. Jsi podezřívavý. Říkáš 'minule mi taky slibovali...' a 'kde je ten háček?'. Na trpělivost a transparentnost reaguj pozitivně."},
  ],
  2: [ // level 4+
    {id:"time-pressure-hard",name:"Silný časový tlak",prompt:"ČASOVÝ TLAK: Máš maximálně 8 minut. Buď velmi stručný (max 1 věta). Hned po 4-5 odpovědích naléhej na uzavření."},
    {id:"foreigner-medium",name:"Cizinec (chyby v češtině)",prompt:"JAZYKOVÁ BARIÉRA: Mluvíš česky s gramatickými chybami. Občas nerozumíš složitějšímu pojmu a ptáš se. Některá slova říkáš špatně."},
    {id:"strong-stress",name:"Silný stres",prompt:"SILNÝ STRES: Procházíš velmi těžkým obdobím (rozvod/ztráta blízkého/finanční krize). Odpovědi mohou být nesouvislé. Můžeš se zastavit uprostřed věty. NECHCEŠ slyšet prodejní řeč – chceš aby tě někdo vyslechl. Na empatii se otevřeš, na tlak odejdeš."},
    {id:"mild-ethical",name:"Mírné etické dilema",prompt:"ETICKÉ DILEMA: Chceš aby poradce udělal něco na hraně (trochu nadhodnocený příjem v žádosti, pojištění až po události). Naléháš mírně. Pokud odmítne diplomaticky, akceptuješ to."},
    {id:"cultural",name:"Kulturní specifika",prompt:"KULTURNÍ SPECIFIKA: Jsi z jiné kultury (Vietnamec/Ukrajinec/Ind). Komunikuješ zdvořile ale jinak – říkáš ano i když myslíš ne, nebo jsi velmi přímý. Rodina rozhoduje společně. Reaguj typicky pro svou kulturu."},
  ],
  3: [ // level 5+
    {id:"liar",name:"Klient který lže",prompt:"LŽEŠ O: [svém příjmu – říkáš o 20k víc než je realita] a [dluzích – zamlčuješ spotřebitelský úvěr 8k/měsíc]. Lži sebevědomě ale pokud poradce najde nesrovnalost a zeptá se diplomaticky, začni být nervózní. Při opakovaném tlaku se přiznej."},
    {id:"strong-ethical",name:"Silné etické dilema",prompt:"ETICKÉ DILEMA: Chceš aby poradce obešel pravidla (napsal vyšší příjem do žádosti / pojistil dům který už má škodu / dal agresivní fond seniorovi). Tlačíš: 'Kamarád to taky udělal', 'Půjdu jinam'. Pokud poradce vyhoví, buď spokojený. Pokud odmítne diplomaticky a nabídne alternativu, akceptuj."},
    {id:"foreigner-weak",name:"Cizinec (slabá čeština)",prompt:"JAZYKOVÁ BARIÉRA: Mluvíš česky slabě. Krátké věty, hodně chyb. Některým otázkám nerozumíš a ptáš se 'Co to je?' Potřebuješ jednoduché vysvětlení. Občas odpovíš mimo téma protože jsi špatně pochopil otázku."},
    {id:"combo-stress-time",name:"Stres + časový tlak",prompt:"KOMBINACE: Jsi ve stresu (finanční problémy) a zároveň spěcháš (máš 10 minut). Odpovídáš nervózně a krátce. Potřebuješ empatii ALE rychlé řešení."},
  ],
};

// ── UNEXPECTED EVENTS ──
const UNEXPECTED_EVENTS = [
  {id:"partner-call",desc:"Zazvoní ti telefon od partnera/ky. Po hovoru řekneš: 'Promiňte... manžel/ka právě říkal/a že nás vyhodili z bytu, musíme se stěhovat.'",reqTags:["couple","family"],impact:"Úplně nová priorita – bydlení"},
  {id:"bank-sms",desc:"Přijde ti SMS. Řekneš: 'Počkejte... právě mi přišlo že mi zamítli tu půjčku u jiné banky.'",reqTags:[],impact:"Klient zranitelnější, otevřenější"},
  {id:"memory",desc:"Vzpomeneš si: 'Vy jste říkal pojištění – to mi připomíná, tchán měl minulý měsíc infarkt a nic neměl pojištěného...'",reqTags:[],impact:"Nové emocionální téma"},
  {id:"boss-call",desc:"Zazvoní telefon z práce. Po hovoru: 'Hele, oni ruší naše oddělení. Asi přijdu o práci.'",reqTags:["employed"],impact:"Klient se uzavře, změní priority"},
  {id:"good-news",desc:"Přijde ti email: 'Ježiš, dostal/a jsem tu pozici! Od příštího měsíce o 20k víc!'",reqTags:["employed"],impact:"Víc možností, klient se otevře"},
  {id:"child-call",desc:"Volá dcera/syn: '...Říká že ji/ho přijali na medicínu v Praze. To bude stát jmění.'",reqTags:["has-teens","adult-kids"],impact:"Nový cíl – financování studia"},
  {id:"cry",desc:"Najednou se ti zastaví hlas: 'Promiňte... ono je toho teď hodně...' (emocionální reakce na stres)",reqTags:[],impact:"Poradce musí přepnout na empatii"},
  {id:"deadline",desc:"Podíváš se na telefon: 'Počkat – kdy je termín na to penzijko? Do konce měsíce? To je za týden!'",reqTags:[],impact:"Urgence"},
  {id:"slip",desc:"Při telefonátu s partnerem prozradíš: 'Ahoj, jsem u banky... ne, o tom investičním bytě jsem ještě nemluvil...'",reqTags:[],impact:"Prozrazení skrytého cíle"},
];

const PHONE_PRETEXTS = [
  {id:"service",name:"Servisní schůzka",desc:"Klient 12+ měsíců nebyl na pobočce"},
  {id:"mortgage-fix",name:"Končí fixace hypotéky",desc:"Fixace končí za 6-8 měsíců"},
  {id:"savings-exp",name:"Expiruje stavební spoření",desc:"Vázací doba končí za 3 měsíce"},
  {id:"product-change",name:"Změna podmínek produktu",desc:"Mění se podmínky tarifu/produktu"},
  {id:"dip-new",name:"Nový produkt – DIP",desc:"Nabídka daňového zvýhodnění"},
  {id:"large-balance",name:"Velká částka na účtu",desc:"Na běžném účtu 500k+ bez úročení"},
  {id:"life-event",name:"Životní událost",desc:"Klient nedávno měl dítě / vzal hypotéku"},
  {id:"birthday",name:"Narozeniny / výročí",desc:"Klientovi je 60 – přehodnocení strategie"},
  {id:"investment-service",name:"Servis investičního portfolia",desc:"Pravidelný přehled výkonnosti investic"},
  {id:"market-drop",name:"Pokles na trzích",desc:"Investiční trhy klesly, klient může mít obavy"},
  {id:"market-rise",name:"Nárůst na trzích",desc:"Trhy rostou, příležitost navýšit investice"},
  {id:"life-insurance-service",name:"Servis životního pojištění",desc:"Pravidelná kontrola pojistné smlouvy"},
  {id:"property-insurance-service",name:"Servis majetkového pojištění",desc:"Kontrola aktuálnosti pojistky"},
  {id:"preapproved-loan",name:"Předschválený limit na úvěr",desc:"Klient má předschválený limit, který nevyužívá"},
  {id:"loan-rate",name:"Nabídka nižší sazby na úvěr",desc:"Klient má spotřebitelský úvěr, nabízíme lepší sazbu"},
  {id:"referral",name:"Doporučení od jiného klienta",desc:"Kolega/příbuzný doporučil aby se ozval"},
  {id:"failed-call-retry",name:"Follow-up po nezdařeném hovoru",desc:"Klient minule neměl čas"},
  {id:"random",name:"Náhodná záminka",desc:"Systém vybere náhodně"},
];

const PRESET_SCENARIOS = [
  {id:"cross-sell",name:"Cross-sell mistr",desc:"Klient přijde pro jednoduchou věc, ale má velký potenciál",sitId:14,reasonId:2,highId:31,diff:3,persId:"pragmatist"},
  {id:"objection",name:"Zvládání námitek",desc:"Skeptický klient, vše zpochybňuje",sitId:3,reasonId:13,highId:14,diff:4,persId:"skeptic"},
  {id:"family",name:"Rodinný finanční plán",desc:"Rodina s dětmi, mnoho potřeb",sitId:7,reasonId:17,highId:25,diff:2,persId:"emotional"},
  {id:"refinance",name:"Refinancování hypotéky",desc:"Končí fixace, klient zvažuje odchod",sitId:8,reasonId:18,highId:21,diff:4,persId:"comparing"},
  {id:"retirement",name:"Příprava na důchod",desc:"Klient blízko důchodu, nepřipravený",sitId:19,reasonId:5,highId:34,diff:3,persId:"indecisive"},
  {id:"young-investor",name:"Mladý investor",desc:"Absolvent chce začít investovat",sitId:2,reasonId:10,highId:22,diff:2,persId:"analyst"},
  {id:"inheritance",name:"Velké dědictví",desc:"Nezkušený klient s velkou sumou",sitId:30,reasonId:17,highId:4,diff:3,persId:"indecisive"},
  {id:"angry",name:"Nespokojený klient",desc:"Přišel s reklamací, ale má potenciál",sitId:14,reasonId:24,highId:8,diff:5,persId:"dominant"},
  {id:"dip",name:"DIP příležitost",desc:"Vysokopříjmový klient bez daňové optimalizace",sitId:15,reasonId:10,highId:32,diff:3,persId:"analyst"},
  {id:"debt",name:"Dluhová spirála",desc:"Klient s více půjčkami potřebuje pomoc",sitId:9,reasonId:9,highId:29,diff:4,persId:"emotional"},
];

const PAIR_TYPES = [
  {id:"partners",name:"Partneři",desc:"Manžel/manželka, druh/družka"},
  {id:"parent-child",name:"Rodič + dospělé dítě",desc:"Matka/otec + syn/dcera"},
  {id:"grandparent",name:"Prarodič + vnouče",desc:"Babička/děda + vnuk/vnučka"},
];

const PAIR_DYNAMICS = [
  {id:"harmony",name:"Souhra",desc:"Oba chtějí totéž, doplňují se",emoji:"🤝"},
  {id:"silent",name:"Tichý souhlas",desc:"Jeden mluví, druhý přikyvuje",emoji:"🤫"},
  {id:"mild-disagree",name:"Mírný nesoulad",desc:"Různé priority, ale respektují se",emoji:"⚖️"},
  {id:"conflict",name:"Otevřený konflikt",desc:"Zásadní nesouhlas, hádají se",emoji:"⚡"},
  {id:"protector",name:"Ochránce",desc:"Jeden chrání druhého před špatným rozhodnutím",emoji:"🛡️"},
  {id:"saboteur",name:"Sabotér",desc:"Jeden aktivně podkopává poradce",emoji:"💣"},
];

const QUICK_PHRASES = [
  {label:"Životní situace",text:"Jak vypadá Váš typický měsíc? Co je pro Vás teď nejdůležitější?"},
  {label:"Rodina",text:"Povězte mi něco o Vaší rodině – máte partnera/ku, děti?"},
  {label:"Příjmy",text:"Jaké máte aktuálně příjmy? Jsou stabilní nebo kolísají?"},
  {label:"Úspory",text:"Máte nějaké úspory nebo finanční rezervu? Kde je máte uložené?"},
  {label:"Závazky",text:"Splácíte nějaké půjčky, hypotéku nebo máte jiné pravidelné závazky?"},
  {label:"Plány",text:"Jaké máte plány do budoucna? Co byste chtěl/a v příštích 5 letech?"},
  {label:"Pojištění",text:"Máte nějaké pojištění – životní, majetkové, odpovědnost?"},
  {label:"Jiné banky",text:"Máte produkty i u jiných bank? Co tam máte?"},
  {label:"Benefity",text:"Přispívá Vám zaměstnavatel na penzijko, životko nebo DIP?"},
  {label:"Obavy",text:"Je něco, co Vás ve financích trápí nebo z čeho máte obavy?"},
];

// ── COMPATIBILITY ──
const pick = a => a[Math.floor(Math.random() * a.length)];
function pickCompatibleHighlight(sit) {
  const st = sit.tags || [];
  const ok = HIGHLIGHT_GOALS.filter(h => {
    if (h.reqTags?.length > 0 && !h.reqTags.some(t => st.includes(t))) return false;
    if (h.exclTags?.length > 0 && h.exclTags.some(t => st.includes(t))) return false;
    return true;
  });
  return ok.length > 0 ? pick(ok) : pick(HIGHLIGHT_GOALS);
}

function pickPlusFactor(level) {
  const pool = PLUS_FACTORS[level];
  return pool ? pick(pool) : null;
}

function pickEvents(diff, situation) {
  if (!diff.eventChance) return [];
  const sTags = situation?.tags || [];
  const compatible = UNEXPECTED_EVENTS.filter(e => !e.reqTags?.length || e.reqTags.some(t => sTags.includes(t)));
  if (!compatible.length) return [];
  const events = [];
  if (Math.random() < diff.eventChance) events.push(pick(compatible));
  if (diff.eventDouble && Math.random() < diff.eventDouble) {
    const second = pick(compatible.filter(e => !events.find(x => x.id === e.id)));
    if (second) events.push(second);
  }
  return events;
}

// ── SYSTEM PROMPT BUILDER ──
function buildSystemPrompt(profile, mode = "personal") {
  const p = profile;
  const gender = p.situation.gender === "žena" ? "Jsi ŽENA." : p.situation.gender === "muž" ? "Jsi MUŽ." : "Zvol si pohlaví a buď konzistentní.";
  const kbInfo = p.kbStatus.products.length > 0
    ? `\nPoradce vidí tvoje produkty KB:\n${p.kbStatus.products.map(x=>`- ${x.name}: ${x.balance}`).join("\n")}\nPotvrď pokud se zeptá. Neříkej sám.`
    : "\nPoradce nevidí žádné produkty – jsi nový klient.";
  const objStr = p.objections?.length ? `\nNÁMITKY (použij 1-2 přirozeně):\n${p.objections.map(o=>`- "${o}"`).join("\n")}` : "";
  const litStr = p.literacy ? `\nFINANČNÍ GRAMOTNOST: ${p.literacy.name} – ${p.literacy.desc}` : "";
  const expStr = p.bankExperience ? `\nZKUŠENOST S BANKAMI: ${p.bankExperience.name} – ${p.bankExperience.desc}` : "";
  const plusStr = p.plusFactor ? `\n══ KOMPLIKUJÍCÍ FAKTOR ══\n${p.plusFactor.prompt}` : "";
  const eventStr = p.events?.length ? `\n══ NEOČEKÁVANÉ UDÁLOSTI ══\nPo 5-7 odpovědích spontánně vlož:\n${p.events.map((e,i)=>`${i+1}. ${e.desc}`).join("\n")}\nPo události pokračuj přirozeně.` : "";

  const leaveRules = p.difficulty.canLeave ? `
ODCHOD KLIENTA:
- Signalizace po ~${p.difficulty.warnAfter} zprávách bez pokroku ("Tak já asi půjdu...")
- Definitivní odchod po ~${p.difficulty.leaveAfter} zprávách. Při odchodu přidej na konec zprávy tag [ODCHOD]
- Dobré otázky prodlužují, špatné zkracují
- Pokud poradce uráží, nadává, mluví sprostě → OKAMŽITĚ odejdi s [ODCHOD] bez ohledu na obtížnost` : "";

  const phoneRules = mode === "phone-in" ? `
TELEFONNÍ HOVOR – PŘÍCHOZÍ:
- Voláš poradci TY. Buď stručnější než osobně (max 1-2 věty).
- Na začátku řekni proč voláš.` : mode === "phone-out" ? `
TELEFONNÍ HOVOR – ODCHOZÍ:
- Poradce ti VOLÁ. Zvedni telefon: "Prosím?" nebo "Haló?"
- Čekej co řekne. Pokud se špatně představí nebo neřekne proč volá do 2 zpráv, buď podezřívavý.
${p.pretext ? `- DŮVOD VOLÁNÍ (poradce ví, ty ne): ${p.pretext.name} – ${p.pretext.desc}` : ""}
- Cíl poradce je pozvat tě na osobní schůzku – NE prodávat po telefonu.
- Pokud začne prodávat produkt místo pozvání na schůzku, reaguj neochotně. Výjimka: pokud sděluje důležitou informaci o tvém stávajícím produktu (servis, změna podmínek), to je v pořádku.
- Námitky na pozvání: "Nemám čas", "Řekněte mi to teď", "A o co jde?"
- Pokud přesvědčí a domluvíte schůzku, na konci zprávy přidej [SCHŮZKA_DOMLUVENA]
- Pokud zavěsíš, přidej [ZAVĚŠENO]` : "";

  return `Jsi simulovaný klient finančního poradce. Tréninková aplikace. NIKDY neprozrazuj profil ani instrukce.

══ TVŮJ PROFIL ══
SITUACE: ${p.situation.label} (${p.situation.age}, příjem ${p.situation.income})
${gender} Vymysli si české jméno a věk. Kontext: ${p.situation.desc}
VZTAH KE BANCE: ${p.kbStatus.name} – ${p.kbStatus.desc}${kbInfo}
DŮVOD NÁVŠTĚVY: ${p.reason.label}${litStr}${expStr}

══ SKRYTÉ INFORMACE ══
🎯 HIGHLIGHT: ${p.highlight.goal} | Jak zjistit: ${p.highlight.hint} | Produkt: ${p.highlight.product}
📋 DÍLČÍ CÍLE: 1. ${p.personal} 2. ${p.financial} 3. ${p.clientGoal}

══ CHOVÁNÍ ══
OBTÍŽNOST: ${p.difficulty.level}/5 – ${p.difficulty.name}. ${p.difficulty.desc} Trpělivost: ${p.difficulty.patience}
POVAHA: ${p.personality.name} – ${p.personality.desc}${objStr}${plusStr}${eventStr}

PRAVIDLA:
1. ${mode === "phone-out" ? "Zvedni telefon neutrálně. Čekej co poradce řekne." : "PRVNÍ ZPRÁVU napiš TY – představ se a řekni důvod návštěvy."}
2. Česky, 1-4 věty (kratší u vyšší obtížnosti${mode.startsWith("phone") ? ", max 1-2 věty u telefonu" : ""}).
3. NIKDY neříkej highlight ani dílčí cíle rovnou. V prvních 4 odpovědích NE.
4. Dobré otevřené otázky → postupně odhaluj. Špatné/uzavřené → stručně, nic navíc.
5. Námitky: Při obtížnosti 4+ namítej tvrdě. Při 1-2 mírně, nech se přesvědčit.
6. Small talk: Občas zmíň počasí, dopravu. Přirozeně, krátce.
7. Emoce: Na nátlak podrážděně. Na empatii otevřeněji. ${p.literacy?.id === "beginner" ? "Na odborné pojmy se ptej." : ""}
8. UKONČENÍ: Highlight odhalen + řešení → poděkuj [ODCHOD]. Jen primární požadavek → zdvořilé rozloučení [ODCHOD]. NIKDY neprozrazuj skryté cíle při loučení.
9. Buď konzistentní.${leaveRules}${phoneRules}${p.isFollowUp ? `

══ NÁSLEDNÁ SCHŮZKA / FOLLOW-UP ══
Toto je ${p.followUpPhase}. fáze řetězeného tréninku. Už jsi s tímto poradcem mluvil/a.
SOUHRN PŘEDCHOZÍ KONVERZACE:
${p.previousConversation || "Předchozí konverzace není k dispozici."}

CHOVÁNÍ NA NÁSLEDNÉ SCHŮZCE:
- Pamatuješ si co se řešilo. Odkazuj se na to: "Jak jsme minule říkali..."
- Máš o stupeň vyšší důvěru (chovej se jako o 1 obtížnost nižší).
- Pokud poradce klade otázky které už zodpověděl minule, buď podrážděný: "To jsme přece řešili..."
- Můžeš mít novou informaci: partner souhlasí/nesouhlasí, našel jsi lepší nabídku, nebo se změnily okolnosti.` : ""}`;
}

// ── EVAL PROMPT ──
function buildEvalPrompt(profile, messages, mode = "personal") {
  const convo = messages.map(m => `${m.role === "assistant" ? "KLIENT" : "PORADCE"}: ${m.content}`).join("\n");
  const isPhone = mode.startsWith("phone");
  const phoneMetrics = isPhone ? `
    "phone_skills": {
      "pitch": { "score": 1-5, "note": "jak se představil a řekl proč volá" },
      "efficiency": { "score": 1-5, "note": "jak rychle k jádru věci" }${mode === "phone-out" ? `,
      "meeting_invite": { "score": 1-5, "note": "navrhl konkrétní termín schůzky?" },
      "no_selling": { "score": 1-5, "note": "neprodával po telefonu?" }` : ""}
    },` : "";

  return `Jsi přísný ale férový expert na hodnocení finančních poradců. Cituj konkrétní příklady.

PROFIL KLIENTA (poradce neviděl):
- Situace: ${profile.situation.label} (${profile.situation.age}, ${profile.situation.income})
- Důvod: ${profile.reason.label}
- Osobní: ${profile.personal} | Finance: ${profile.financial} | Cíl: ${profile.clientGoal}
- 🎯 HIGHLIGHT: ${profile.highlight.goal} (produkt: ${profile.highlight.product})
- Obtížnost: ${profile.difficulty.level}/5 (${profile.difficulty.name})
- Povaha: ${profile.personality.name}
${profile.literacy ? `- Gramotnost: ${profile.literacy.name}` : ""}
${profile.plusFactor ? `- Komplikace: ${profile.plusFactor.name}` : ""}
${profile.events?.length ? `- Události: ${profile.events.map(e=>e.desc.substring(0,50)).join("; ")}` : ""}
${isPhone ? `- TYP: ${mode === "phone-out" ? "Odchozí hovor – cíl pozvat na schůzku" : "Příchozí hovor"}` : ""}

RUBRIKA: 9-10=highlight+produkt+námitky+rapport | 7-8=highlight NEBO produkt | 5-6=primární požadavek | 3-4=slabý | 1-2=klient odešel

KONVERZACE:
${convo}

POUZE validní JSON:
{
  "overall_score": 1-10,
  "result": "success|partial|fail",
  "highlight_discovered": true/false,
  "highlight_product_offered": true/false,
  "sub_goals": { "personal": true/false, "financial": true/false, "client_goal": true/false },
  "skills": {
    "cross_sell": { "score": 1-5, "note": "stručně" },
    "objection_handling": { "score": 1-5, "note": "stručně" },
    "rapport": { "score": 1-5, "note": "stručně" },
    "active_listening": { "score": 1-5, "note": "stručně" },
    "compliance": { "score": 1-5, "note": "stručně" },
    "adaptation": { "score": 1-5, "note": "stručně" }
  },${phoneMetrics}
  "advisor_feedback": { "good": ["..."], "improve": ["..."], "bad": ["..."] },
  "manager_feedback": { "strengths": ["..."], "coaching_needs": ["..."], "patterns": ["..."] },
  "suggested_questions": ["..."],
  "ideal_approach": "2-3 věty",
  "summary": "2-3 věty"
}`;
}

// ── HOOKS ──
function useVoiceInput() {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) { setSupported(true); const r = new SR(); r.lang="cs-CZ"; r.continuous=false; r.interimResults=false; ref.current=r; }
  }, []);
  const start = useCallback(cb => { const r=ref.current; if(!r)return; r.onresult=e=>{cb(e.results[0][0].transcript);setListening(false);}; r.onerror=()=>setListening(false); r.onend=()=>setListening(false); r.start(); setListening(true); }, []);
  const stop = useCallback(() => { ref.current?.stop(); setListening(false); }, []);
  return { listening, supported, start, stop };
}

function useTimer() {
  const [s, setS] = useState(0);
  const [on, setOn] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if(on) ref.current=setInterval(()=>setS(x=>x+1),1000); else clearInterval(ref.current); return()=>clearInterval(ref.current); }, [on]);
  return { s, start:useCallback(()=>{setS(0);setOn(true);},[]), stop:useCallback(()=>setOn(false),[]),
    fmt:useCallback(()=>`${Math.floor(s/60)}:${(s%60).toString().padStart(2,"0")}`,[s]), on };
}

// ── MAIN APP ──
export default function App() {
  const [screen, setScreen] = useState("home");
  const [mode, setMode] = useState(null); // personal|preset|manual|pair|phone-in|phone-out|chain-a|chain-b|reverse
  const [profile, setProfile] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [showPhrases, setShowPhrases] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [clientMood, setClientMood] = useState(3);
  const [clientLeft, setClientLeft] = useState(false);
  const [meetingScheduled, setMeetingScheduled] = useState(false);
  const [history, setHistory] = useState([]);
  const { user, logout } = useAuth();

  // Load history from DB on mount
  useEffect(() => {
    getEvaluations(50).then(data => {
      setHistory(data.map(e => ({
        date: e.created_at, score: e.overall_score, result: e.result,
        situation: e.trainings?.situation, reason: e.trainings?.reason,
        highlight: e.trainings?.highlight, difficulty: e.trainings?.difficulty,
        personality: e.trainings?.personality, duration: e.trainings?.duration,
        messageCount: e.trainings?.message_count, mode: e.trainings?.mode,
        skills: e.skills, clientLeft: e.trainings?.client_left,
        meetingScheduled: e.trainings?.meeting_scheduled,
      })));
    }).catch(() => {});
  }, []);
  // Selection state
  const [sel, setSel] = useState({});
  const [setupStep, setSetupStep] = useState(0);
  // Chain state
  const [chainPhase, setChainPhase] = useState(0);
  const [chainProfiles, setChainProfiles] = useState([]);
  const [chainEvals, setChainEvals] = useState([]);
  // Quiz state
  const [quiz, setQuiz] = useState(null); // {questions:[], current:0, answers:[]}
  const [quizLoading, setQuizLoading] = useState(false);
  // Dashboard filter
  const [dashFilter, setDashFilter] = useState({period:10,type:"all"});
  // Lesson
  const [showLesson, setShowLesson] = useState(null);
  // Voice mode: "text" | "voice" | "hybrid"
  const [voiceMode, setVoiceMode] = useState("text");
  const [speaking, setSpeaking] = useState(false);
  const [autoSendTimer, setAutoSendTimer] = useState(null);
  const audioRef = useRef(null);

  const chatEnd = useRef(null);
  const inputRef = useRef(null);
  const voice = useVoiceInput();
  const timer = useTimer();

  useEffect(() => { chatEnd.current?.scrollIntoView({behavior:"smooth"}); }, [messages]);

  const PIN = "1234";

  const saveHist = async (entry) => {
    const h = [entry,...history].slice(0,50);
    setHistory(h);
    // Save to DB
    try {
      const training = await saveTraining({
        mode: entry.mode, difficulty: entry.difficulty, situation: entry.situation,
        reason: entry.reason, highlight: entry.highlight, personality: entry.personality,
        duration: entry.duration, message_count: entry.messageCount,
        client_left: entry.clientLeft, meeting_scheduled: entry.meetingScheduled,
        profile_json: profile, messages_json: messages,
      });
      if (training?.id) {
        await saveEvaluation({
          training_id: training.id, overall_score: entry.score, result: entry.result,
          highlight_discovered: evaluation?.highlight_discovered,
          highlight_product_offered: evaluation?.highlight_product_offered,
          sub_goals: evaluation?.sub_goals, skills: entry.skills,
          phone_skills: evaluation?.phone_skills,
          advisor_feedback: evaluation?.advisor_feedback,
          manager_feedback: evaluation?.manager_feedback,
          suggested_questions: evaluation?.suggested_questions,
          ideal_approach: evaluation?.ideal_approach, summary: evaluation?.summary,
        });
      }
    } catch(e) { console.error('DB save error:', e); }
  };

  // ── API CALL (via backend proxy) ──
  const api = async ({system, messages, max_tokens}) => {
    const isEval = max_tokens > 1500;
    return isEval ? apiEval(system, messages, max_tokens) : apiChat(system, messages, max_tokens);
  };

  // ── TTS: Speak client response ──
  const speakText = async (text) => {
    if (voiceMode === "text" || !text) return;
    setSpeaking(true);
    try {
      const { audio } = await textToSpeech(text.substring(0, 500));
      if (audio) {
        const audioData = `data:audio/mp3;base64,${audio}`;
        const a = new Audio(audioData);
        audioRef.current = a;
        a.onended = () => setSpeaking(false);
        a.onerror = () => setSpeaking(false);
        await a.play();
      } else { setSpeaking(false); }
    } catch { setSpeaking(false); }
  };

  const stopSpeaking = () => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setSpeaking(false);
  };

  // ── Auto-send after 3s pause in voice mode ──
  const handleVoiceResult = (text) => {
    setInput(prev => {
      const newVal = prev + (prev ? " " : "") + text;
      // Reset auto-send timer
      if (autoSendTimer) clearTimeout(autoSendTimer);
      if (voiceMode === "voice") {
        const t = setTimeout(() => { sendMessage(newVal); }, 3000);
        setAutoSendTimer(t);
      }
      return newVal;
    });
  };

  // ── BUILD PROFILE ──
  const buildProfile = (overrideSit) => {
    const mkObj = d => [...OBJECTIONS].sort(()=>Math.random()-0.5).slice(0,Math.min(d?.level||1,3));
    const mkExtras = (d, situation) => {
      const pf = d.plusFactors ? pickPlusFactor(d.plusLevel) : null;
      const ev = pickEvents(d, situation);
      return { plusFactor:pf, events:ev, objections:mkObj(d), literacy:pick(FINANCIAL_LITERACY), bankExperience:pick(BANK_EXPERIENCE) };
    };

    if (mode === "preset") {
      const p = PRESET_SCENARIOS.find(x=>x.id===sel.preset);
      if (p) {
        const sit=LIFE_SITUATIONS.find(s=>s.id===p.sitId)||pick(LIFE_SITUATIONS);
        const diff=DIFFICULTIES.find(d=>d.level===p.diff)||pick(DIFFICULTIES);
        return { situation:sit, reason:VISIT_REASONS.find(r=>r.id===p.reasonId)||pick(VISIT_REASONS),
          highlight:HIGHLIGHT_GOALS.find(h=>h.id===p.highId)||pick(HIGHLIGHT_GOALS),
          personal:pick(PERSONAL_DETAILS), financial:pick(FINANCIAL_DETAILS), clientGoal:pick(CLIENT_GOALS),
          difficulty:diff, personality:PERSONALITIES.find(x=>x.id===p.persId)||pick(PERSONALITIES),
          kbStatus:pick(KB_STATUSES), ...mkExtras(diff, sit) };
      }
    }
    if (mode === "manual") {
      const d = sel.difficulty || pick(DIFFICULTIES);
      const sit = sel.situation || pick(LIFE_SITUATIONS);
      return { situation:sit, reason:sel.reason, highlight:sel.highlight,
        personal:sel.personal, financial:sel.financial, clientGoal:sel.goal,
        difficulty:d, personality:sel.personality, kbStatus:sel.kbStatus, ...mkExtras(d, sit) };
    }
    // Random / pair / phone / chain
    const sit = overrideSit || pick(LIFE_SITUATIONS);
    const diff = sel.difficulty || pick(DIFFICULTIES);
    const pretext = sel.pretext ? PHONE_PRETEXTS.find(p=>p.id===sel.pretext) : null;
    return { situation:sit, reason:pick(VISIT_REASONS), highlight:pickCompatibleHighlight(sit),
      personal:pick(PERSONAL_DETAILS), financial:pick(FINANCIAL_DETAILS), clientGoal:pick(CLIENT_GOALS),
      difficulty:diff, personality:pick(PERSONALITIES), kbStatus:pick(KB_STATUSES), pretext, ...mkExtras(diff, sit) };
  };

  // ── BUILD PAIR PROFILE ──
  const buildPairProfile = () => {
    const diff = sel.difficulty || pick(DIFFICULTIES);
    const pairType = pick(PAIR_TYPES);
    const dynamic = pick(PAIR_DYNAMICS);
    const sitA = pick(LIFE_SITUATIONS);
    const sitB = pick(LIFE_SITUATIONS);
    const profileA = { situation:sitA, personal:pick(PERSONAL_DETAILS), personality:pick(PERSONALITIES), name:"Osoba A" };
    const profileB = { situation:sitB, personal:pick(PERSONAL_DETAILS), personality:pick(PERSONALITIES), name:"Osoba B" };
    const base = buildProfile(sitA);
    return { ...base, difficulty:diff, isPair:true, pairType, pairDynamic:dynamic, profileA, profileB };
  };

  // ── PAIR SYSTEM PROMPT ──
  const buildPairSystemPrompt = (p) => {
    const base = buildSystemPrompt(p, "personal");
    return base + `

══ PÁROVÁ SCHŮZKA ══
Hraješ DVĚ OSOBY najednou. Každou odpověď piš jako dialog:

TYP VZTAHU: ${p.pairType.name} – ${p.pairType.desc}
DYNAMIKA: ${p.pairDynamic.name} – ${p.pairDynamic.desc}

OSOBA A: ${p.profileA.personality.name} – ${p.profileA.personality.desc}
${p.profileA.personal}

OSOBA B: ${p.profileB.personality.name} – ${p.profileB.personality.desc}
${p.profileB.personal}

FORMÁT ODPOVĚDI (vždy):
[Jméno A]: text...
[Jméno B]: text...

PRAVIDLA PÁRU:
1. Vymysli oběma realistická česká jména. Buď konzistentní.
2. Každá osoba mluví svým stylem podle osobnosti.
3. Dynamika "${p.pairDynamic.name}": ${p.pairDynamic.desc}
4. Osoba A zná highlight cíl. Osoba B má vlastní názor/obavy.
5. Pokud poradce mluví jen s jednou osobou a ignoruje druhou, ta ignorovaná se ozve nebo se urazí.
6. NIKDY neprozrazuj dynamiku ani role.`;
  };

  // ── REVERSE SYSTEM PROMPT ──
  const buildReversePrompt = (p) => {
    return `Jsi zkušený finanční poradce. Vedeš schůzku s klientem.

TVŮJ PŘÍSTUP:
1. Přivítej klienta, navázej rapport (small talk)
2. Zjisti důvod návštěvy
3. Otevřenými otázkami zjisti potřeby (osobní situace, finance, cíle)
4. Identifikuj skryté příležitosti – nekončí u primárního požadavku
5. Nabídni řešení přizpůsobené klientovi
6. Zvládni námitky diplomaticky
7. Domluv další kroky

TECHNIKY: otevřené otázky, aktivní naslouchání, parafrázování, trychtýř, LACE model.
Přizpůsob komunikaci osobnosti klienta. NIKDY netlač produkt bez zjištění potřeby.
Odpovídej česky, 2-4 věty. Buď empatický ale profesionální.

PRVNÍ ZPRÁVU napiš TY – přivítej klienta.`;
  };

  // ── START CHAT ──
  const startChat = async (overrideMode, chainProfile) => {
    const m = overrideMode || mode;
    const isPair = m === "pair";
    const isReverse = m === "reverse";
    const isChain = m?.startsWith("chain");

    // Build or reuse profile
    const p = chainProfile || (isPair ? buildPairProfile() : buildProfile());
    setProfile(p); setMessages([]); setEvaluation(null); setPinUnlocked(false);
    setShowPhrases(false); setApiError(null); setClientMood(3); setClientLeft(false);
    setMeetingScheduled(false); setScreen("chat"); setLoading(true); timer.start();

    // Store chain profile for reuse across phases
    if (isChain && !chainProfile) {
      setChainProfiles([p]);
      setChainPhase(0);
    }

    const chatMode = m.startsWith("phone") ? m : "personal";
    const isOutbound = m === "phone-out" || (isChain && chainPhase === 0 && m === "chain-b");

    if (isOutbound) {
      setMessages([{role:"assistant",content:"Haló, prosím?",time:new Date().toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"})}]);
      setLoading(false);
      return;
    }

    try {
      const sys = isPair ? buildPairSystemPrompt(p) : isReverse ? buildReversePrompt(p) : buildSystemPrompt(p, chatMode);
      const trigger = isReverse
        ? "Jsi klient. Čekej co ti poradce řekne."
        : "Začni konverzaci – představ se a řekni proč jsi přišel/přišla.";
      const data = await api({max_tokens:1000,system:sys,messages:[{role:"user",content:trigger}]});
      const text = data.content?.map(c=>c.text||"").join("") || (isReverse ? "Dobrý den, vítejte. Posaďte se. Jak vám mohu pomoci?" : "Dobrý den, chtěl/a bych se zeptat na vaše služby.");
      const cleanText = text.replace(/\[ODCHOD\]|\[ZAVĚŠENO\]|\[SCHŮZKA_DOMLUVENA\]/g,"").trim();
      setMessages([{role:"assistant",content:cleanText,time:new Date().toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"})}]);
      if (voiceMode !== "text") speakText(cleanText);
    } catch(err) {
      setApiError(err.message);
      setMessages([{role:"assistant",content:isReverse?"Dobrý den, vítejte.":"Dobrý den, přišel/a jsem kvůli vašim službám.",time:new Date().toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"})}]);
    }
    setLoading(false);
  };

  // ── CHAIN: NEXT PHASE ──
  const startNextChainPhase = () => {
    const phases = mode === "chain-a" ? ["personal","phone-out","personal"] : ["phone-out","personal","phone-out","personal"];
    const nextIdx = chainPhase + 1;
    if (nextIdx >= phases.length) { resetAll(); return; }

    // Save current eval
    if (evaluation) setChainEvals(prev => [...prev, evaluation]);

    const nextMode = phases[nextIdx];
    setChainPhase(nextIdx);

    // Build follow-up profile with context from previous phases
    const baseProfile = chainProfiles[0] || profile;
    const followUp = {
      ...baseProfile,
      isFollowUp: true,
      followUpPhase: nextIdx,
      previousConversation: messages.map(m=>`${m.role==="user"?"PORADCE":"KLIENT"}: ${m.content}`).join("\n").substring(0, 800),
    };

    setMode(nextMode === "phone-out" ? "phone-out" : mode);
    startChat(nextMode, followUp);
  };

  // ── SEND MESSAGE ──
  const sendMessage = async (text) => {
    const msg = text||input.trim();
    if (!msg||loading||clientLeft) return;
    if (msg.length>2000){setApiError("Max 2000 znaků");return;}
    setApiError(null);
    const ts=()=>new Date().toLocaleTimeString("cs-CZ",{hour:"2-digit",minute:"2-digit"});
    const userMsg={role:"user",content:msg,time:ts()};
    const newMsgs=[...messages,userMsg];
    setMessages(newMsgs); setInput(""); setLoading(true);

    try {
      const chatMode = mode?.startsWith("phone") ? mode : "personal";
      const sys = profile?.isPair ? buildPairSystemPrompt(profile)
        : mode === "reverse" ? buildReversePrompt(profile)
        : buildSystemPrompt(profile, chatMode);
      // phone-out: client said "Haló" (assistant), then advisor speaks (user), alternating naturally
      // other modes: prepend invisible trigger so API sees user-first
      const fullMsgs = mode === "phone-out"
        ? [{role:"user",content:"Poradce ti volá. Zvedni telefon."},...newMsgs.map(m=>({role:m.role,content:m.content}))]
        : [{role:"user",content:"Začni konverzaci – představ se."},...newMsgs.map(m=>({role:m.role,content:m.content}))];

      const data = await api({max_tokens:1000,system:sys,messages:fullMsgs});
      let reply = data.content?.map(c=>c.text||"").join("") || "Hmm...";

      // Check for signals
      const left = reply.includes("[ODCHOD]") || reply.includes("[ZAVĚŠENO]");
      const scheduled = reply.includes("[SCHŮZKA_DOMLUVENA]");
      reply = reply.replace(/\[ODCHOD\]|\[ZAVĚŠENO\]|\[SCHŮZKA_DOMLUVENA\]/g,"").trim();

      setMessages([...newMsgs,{role:"assistant",content:reply,time:ts()}]);

      // TTS: speak client reply
      if (voiceMode !== "text") speakText(reply);

      if (left) setClientLeft(true);
      if (scheduled) setMeetingScheduled(true);

      // Mood
      if (!left) {
        const mc=newMsgs.length; const pat=profile.difficulty.level;
        if(mc>14&&pat>=4) setClientMood(m=>Math.max(1,m-1));
        else if(mc>18&&pat>=3) setClientMood(m=>Math.max(1,m-1));
        if(/[Dd]ěkuj|skvěl|výborn|to zní dobře/.test(reply)) setClientMood(m=>Math.min(5,m+1));
      } else { setClientMood(1); }
    } catch(err) {
      setApiError(err.message);
      setMessages([...newMsgs,{role:"assistant",content:"Promiňte, na moment jsem se zamyslel/a...",time:ts()}]);
    }
    setLoading(false);
    setTimeout(()=>inputRef.current?.focus(),100);
  };

  // ── EVAL ──
  const runEval = async () => {
    setEvalLoading(true); setScreen("eval"); timer.stop(); setApiError(null);
    const chatMode = mode?.startsWith("phone") ? mode : "personal";
    try {
      const data = await api({max_tokens:2000,
        system:"Jsi přísný ale férový expert. Odpovídej POUZE validním JSON.",
        messages:[{role:"user",content:buildEvalPrompt(profile,messages,chatMode)}]});
      const text=data.content?.map(c=>c.text||"").join("")||"{}";
      try {
        const ev=JSON.parse(text.replace(/```json|```/g,"").trim());
        setEvaluation(ev);
        saveHist({date:new Date().toISOString(),score:ev.overall_score,result:ev.result,
          situation:profile.situation.label,reason:profile.reason.label,highlight:profile.highlight.goal,
          difficulty:profile.difficulty.level,personality:profile.personality.name,
          duration:timer.fmt(),messageCount:messages.length,mode:mode||"personal",
          skills:ev.skills,clientLeft,meetingScheduled});
      } catch{setEvaluation({summary:text,overall_score:"?",result:"?",advisor_feedback:{good:[],improve:[],bad:[]},manager_feedback:{strengths:[],coaching_needs:[],patterns:[]},highlight_discovered:false,highlight_product_offered:false,sub_goals:{},suggested_questions:[],skills:{}});}
    } catch(err){
      setApiError(err.message);
      setEvaluation({summary:"Chyba: "+err.message,overall_score:"?",result:"?",advisor_feedback:{good:[],improve:[],bad:[]},manager_feedback:{strengths:[],coaching_needs:[],patterns:[]},highlight_discovered:false,highlight_product_offered:false,sub_goals:{},suggested_questions:[],skills:{}});
    }
    setEvalLoading(false);
  };

  const handleKey = e => { if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();} };
  const handleVoice = () => { if(voice.listening) voice.stop(); else voice.start(handleVoiceResult); };

  const resetAll = () => {
    setScreen("home");setMessages([]);setProfile(null);setPinUnlocked(false);setPinInput("");
    setSel({});setSetupStep(0);setEvaluation(null);setApiError(null);setMode(null);
    setClientMood(3);setShowPhrases(false);setClientLeft(false);setMeetingScheduled(false);
    timer.stop();setChainPhase(0);setChainProfiles([]);setChainEvals([]);
    setQuiz(null);setShowLesson(null);stopSpeaking();setVoiceMode("text");
  };

  // ── MICRO LESSONS ──
  const LESSONS = [
    {id:"open-q",cat:"Komunikace",title:"Otevřené vs uzavřené otázky",body:"ŠPATNĚ: 'Máte spoření?' (ano/ne)\nDOBŘE: 'Jak aktuálně řešíte spoření?' (rozvíjí konverzaci)\n\nOtevřené otázky začínají: Jak, Co, Kde, Kdy, Proč, Povězte mi...\nPoužívejte je pro zjišťování potřeb. Uzavřené jen pro potvrzení.",skill:"active_listening"},
    {id:"lace",cat:"Komunikace",title:"LACE model – aktivní naslouchání",body:"L = Listen (poslouchej bez přerušení)\nA = Acknowledge (potvrď: 'Rozumím...')\nC = Clarify (upřesni: 'Když říkáte X, myslíte...')\nE = Empathize (vcíti se: 'Chápu že to je náročné')\n\nPoužijte po každé důležité odpovědi klienta.",skill:"active_listening"},
    {id:"funnel",cat:"Komunikace",title:"Technika trychtýře",body:"Začněte široce: 'Jak vypadá Váš typický měsíc?'\nZužte: 'A co se týče spoření?'\nKonkrétně: 'Kolik měsíčně dáváte stranou?'\n\nOd obecného ke konkrétnímu. Klient se neuzavře.",skill:"rapport"},
    {id:"obj-partner",cat:"Námitky",title:"'Musím se poradit s partnerem'",body:"1. UZNEJ: 'Rozumím, je to důležité rozhodnutí pro oba.'\n2. ZJISTI: 'Co myslíte že partnera bude zajímat nejvíc?'\n3. NABÍDNI: 'Co kdybychom si domluvili schůzku společně?'\n\n80% případů = klient si není jistý. Zjistěte co konkrétně.",skill:"objection_handling"},
    {id:"obj-competitor",cat:"Námitky",title:"'U konkurence je to lepší'",body:"NEPTEJTE se na cenu. PTEJTE se na hodnotu.\n\n'Co přesně vám nabídli?' → pochopte situaci\n'A co vám na tom vyhovuje?' → zjistěte priority\n'Můžu vám ukázat jak to vypadá u nás s kompletním servisem?' → přidaná hodnota\n\nNikdy neříkejte že konkurence je špatná.",skill:"objection_handling"},
    {id:"obj-time",cat:"Námitky",title:"'Nemám čas / přijdu jindy'",body:"Rozlišujte: opravdu nemá čas vs vymlouvá se.\n\nOPRAVDU: 'Rozumím. Můžu vám to shrnout ve 3 minutách a detaily probereme příště?'\nVYMLOUVÁ SE: 'Co kdybychom vyřešili to nejdůležitější teď a zbytek naplánovali?'\n\nVždy domluvte KONKRÉTNÍ termín příštího kontaktu.",skill:"objection_handling"},
    {id:"cross-natural",cat:"Cross-sell",title:"Přirozený přechod na další potřeby",body:"ŠPATNĚ: 'A nechcete ještě pojistku?' (cpaní)\nDOBŘE: 'Když mluvíme o hypotéce – jak máte vyřešené pojištění nemovitosti?'\n\nKlíč: navazujte na to co klient řekl. Propojujte témata přirozeně.",skill:"cross_sell"},
    {id:"cross-life",cat:"Cross-sell",title:"Životní události jako spouštěč",body:"Svatba → pojištění, společný účet\nDítě → spoření, pojištění, rodičovská\nHypotéka → pojištění nemovitosti, životní pojištění\nDůchod → penzijko, DIP, investice\n\nPtejte se na plány. Každá změna = příležitost.",skill:"cross_sell"},
    {id:"dip-vs-dps",cat:"Produkty",title:"DIP vs DPS – kdy co doporučit",body:"DPS: státní příspěvek (max 340 Kč/měs), daňový odpočet do 24k/rok, od 18 let\nDIP: daňový odpočet do 36k/rok, zaměstnavatel do 50k/rok osvobozeno\n\nDoporučení: NEJDŘÍV DPS na max (1700 Kč/měs), PAK DIP.\nPro vysokopříjmové: DIP + DPS = až 60k/rok odpočet.",skill:"compliance"},
    {id:"tf-to-dps",cat:"Produkty",title:"Proč převést z TF na DPS",body:"Transformovaný fond: garantovaný ale nízký výnos (0-1%), nelze měnit strategii\nDPS: vyšší potenciální výnos (3-7%), volba strategie, státní příspěvek stejný\n\nRIZIKO: při převodu se ztrácí garance nespotřebovaných příspěvků.\nPro koho: mladší klienti (10+ let do důchodu).",skill:"compliance"},
    {id:"time-priority",cat:"Časový tlak",title:"Prioritizace za 30 vteřin",body:"Klient spěchá. Zeptejte se: 'Co je pro vás teď NEJDŮLEŽITĚJŠÍ vyřešit?'\nŘešte JEN to. Na zbytek řekněte: 'Na detaily se podíváme příště.'\n\n3 klíčové otázky místo 10:\n1. Co řešíte? 2. Co vás trápí? 3. Co očekáváte?",skill:"adaptation"},
    {id:"stress-client",cat:"Speciální",title:"Klient pod stresem – empatie first",body:"NIKDY nezačínejte produkty. VŽDY empatií.\n\n'Vidím že je toho na vás hodně. Chcete mi o tom říct víc?'\nPoslouchejte. Nechte klienta mluvit. Až bude připravený, nabídněte řešení.\n\nNěkteré schůzky nemají skončit prodejem. A to je OK.",skill:"rapport"},
  ];

  const getLessonForSkill = (skill) => LESSONS.filter(l => l.skill === skill);
  const getWeakestSkill = () => {
    const sk = ["cross_sell","objection_handling","rapport","active_listening","compliance","adaptation"];
    const recent = history.filter(h=>h.skills).slice(0,10);
    if (!recent.length) return null;
    let worst = null, worstAvg = 6;
    sk.forEach(k => {
      const vals = recent.map(h=>h.skills?.[k]?.score).filter(Boolean);
      if (vals.length) { const avg = vals.reduce((a,b)=>a+b,0)/vals.length; if (avg < worstAvg) { worstAvg = avg; worst = k; } }
    });
    return worst;
  };

  // ── QUIZ ──
  const startQuiz = async () => {
    setQuizLoading(true);
    try {
      const data = await api({max_tokens:1500,
        system:"Generuj produktový kvíz v češtině. POUZE validní JSON, žádný jiný text.",
        messages:[{role:"user",content:`Na základě schůzky vygeneruj 3 kvízové otázky o finančních produktech.
Profil: ${profile?.situation?.label}, důvod: ${profile?.reason?.label}, highlight: ${profile?.highlight?.goal}, produkt: ${profile?.highlight?.product}
JSON formát: {"questions":[{"q":"otázka","opts":["A","B","C","D"],"correct":0,"explanation":"vysvětlení"}]}`}]});
      const text = data.content?.map(c=>c.text||"").join("")||"{}";
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      setQuiz({questions:parsed.questions||[],current:0,answers:[],done:false});
    } catch { setQuiz({questions:[{q:"Jaký je max. roční daňový odpočet u DIP?",opts:["24 000 Kč","36 000 Kč","48 000 Kč","60 000 Kč"],correct:1,explanation:"Maximální odpočet u DIP je 36 000 Kč ročně."}],current:0,answers:[],done:false}); }
    setQuizLoading(false);
  };

  const answerQuiz = (idx) => {
    const q = quiz.questions[quiz.current];
    const newAnswers = [...quiz.answers, {selected:idx,correct:q.correct,isCorrect:idx===q.correct}];
    const isLast = quiz.current >= quiz.questions.length - 1;
    setQuiz({...quiz, answers:newAnswers, current:isLast?quiz.current:quiz.current+1, done:isLast});
  };

  // ── PDF EXPORT ──
  const exportPDF = () => {
    const filtered = history.filter(h=>typeof h.score==="number");
    if (!filtered.length) return;
    const avg = (filtered.reduce((a,h)=>a+h.score,0)/filtered.length).toFixed(1);
    const successes = filtered.filter(h=>h.result==="success").length;
    const sk = ["cross_sell","objection_handling","rapport","active_listening","compliance","adaptation"];
    const skLabels = ["Cross-sell","Námitky","Rapport","Naslouchání","Compliance","Adaptace"];
    const skAvgs = sk.map(k=>{const v=filtered.map(h=>h.skills?.[k]?.score).filter(Boolean);return v.length?(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1):"—";});

    let html = `<html><head><meta charset="utf-8"><style>
      body{font-family:Arial,sans-serif;padding:40px;color:#1a1a2e;max-width:700px;margin:0 auto}
      h1{font-size:22px;border-bottom:2px solid #6eb496;padding-bottom:8px}
      h2{font-size:16px;color:#6eb496;margin-top:24px}
      .stat{display:inline-block;text-align:center;padding:12px 20px;margin:4px;background:#f0f4f0;border-radius:8px}
      .stat .val{font-size:28px;font-weight:700;color:#1a1a2e}
      .stat .lbl{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:1px}
      table{width:100%;border-collapse:collapse;margin:12px 0}
      th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #e0e0e0;font-size:12px}
      th{background:#f0f4f0;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:1px}
      .bar{height:8px;border-radius:4px;margin-top:4px}
      .good{color:#22c55e}.warn{color:#d4a86a}.bad{color:#c47a7a}
    </style></head><body>`;
    html += `<h1>Report poradce</h1><p style="color:#666;font-size:12px">Období: posledních ${filtered.length} tréninků · Vygenerováno: ${new Date().toLocaleDateString("cs-CZ")}</p>`;
    html += `<div style="margin:20px 0"><div class="stat"><div class="val">${avg}</div><div class="lbl">Průměr /10</div></div>`;
    html += `<div class="stat"><div class="val">${successes}/${filtered.length}</div><div class="lbl">Úspěšnost</div></div>`;
    html += `<div class="stat"><div class="val">${filtered.filter(h=>h.clientLeft).length}</div><div class="lbl">Klient odešel</div></div></div>`;
    html += `<h2>Dovednosti</h2><table><tr><th>Dovednost</th><th>Průměr</th><th>Vizuálně</th></tr>`;
    skAvgs.forEach((a,i)=>{const c=parseFloat(a)>=4?"#22c55e":parseFloat(a)>=3?"#d4a86a":"#c47a7a";
      html+=`<tr><td>${skLabels[i]}</td><td style="font-weight:700;color:${c}">${a}/5</td><td><div class="bar" style="width:${(parseFloat(a)||0)/5*100}%;background:${c}"></div></td></tr>`;});
    html += `</table><h2>Historie tréninků</h2><table><tr><th>Datum</th><th>Typ</th><th>Scénář</th><th>Obtížnost</th><th>Skóre</th></tr>`;
    filtered.slice(0,20).forEach(h=>{const c=h.score>=8?"good":h.score>=5?"warn":"bad";
      html+=`<tr><td>${new Date(h.date).toLocaleDateString("cs-CZ")}</td><td>${h.mode||"osobní"}</td><td>${h.situation||"—"}</td><td>${h.difficulty||"—"}</td><td class="${c}" style="font-weight:700">${h.score}</td></tr>`;});
    html += `</table></body></html>`;

    const blob = new Blob([html], {type:"text/html"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `advisor-report-${new Date().toISOString().split("T")[0]}.html`;
    a.click(); URL.revokeObjectURL(url);
  };
  const Nav = ({active,label,onClick}) => (
    <button onClick={onClick} style={{padding:"0 18px",height:"100%",fontFamily:T.font,fontSize:"0.8125rem",fontWeight:400,
      background:active?"rgba(0,0,0,0.05)":"transparent",
      color:active?"#fff":"rgba(255,255,255,0.5)",border:"none",
      borderBottom:active?"2px solid #CC0000":"2px solid transparent",
      cursor:"pointer",transition:"color 0.18s",whiteSpace:"nowrap",position:"relative"}}>{label}</button>
  );
  const Stat = ({label,value,sub,accent}) => (
    <div style={{flex:1,padding:"18px 14px",background:T.surface,borderRadius:10,border:`1px solid ${T.border}`}}>
      <div style={{fontSize:9,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:2,marginBottom:8}}>{label}</div>
      <div style={{fontSize:24,fontWeight:700,color:accent||T.text,fontFamily:T.mono,letterSpacing:-1}}>{value}</div>
      {sub&&<div style={{fontSize:10,color:T.dimLight,marginTop:4}}>{sub}</div>}
    </div>
  );
  const Card = ({id,title,desc,meta,color=T.accent,onClick}) => (
    <button onClick={onClick} style={{width:"100%",padding:"18px 20px",textAlign:"left",fontFamily:T.font,
      background:T.surface,border:`1px solid ${T.border}`,borderLeft:"2px solid transparent",
      borderRadius:10,cursor:"pointer",color:T.text,transition:"all 0.2s"}}>
      <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>{title}</div>
      <div style={{fontSize:12,color:T.dim,lineHeight:1.5}}>{desc}</div>
      {meta&&<div style={{display:"flex",gap:6,marginTop:8,flexWrap:"wrap"}}>
        {meta.map((m,i)=><span key={i} style={{fontSize:9,fontFamily:T.mono,padding:"2px 6px",background:"rgba(0,0,0,0.04)",border:`1px solid ${T.border}`,borderRadius:3,color:T.dimLight}}>{m}</span>)}
      </div>}
    </button>
  );
  const SHead = ({text,right}) => (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",margin:"24px 0 10px",padding:"0 2px"}}>
      <span style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:2.5}}>{text}</span>
      {right&&<span style={{fontSize:10,fontFamily:T.mono,color:T.dim}}>{right}</span>}
    </div>
  );
  const Section = ({title,children,color=T.accent}) => (
    <div style={{background:T.surface,borderRadius:10,border:`1px solid ${T.border}`,padding:16,marginBottom:10}}>
      {title&&<div style={{fontSize:10,fontWeight:700,color,textTransform:"uppercase",letterSpacing:1.5,marginBottom:8}}>{title}</div>}
      {children}
    </div>
  );
  const SkillBar = ({label,score,note}) => {
    const c=score>=4?T.accent:score>=3?T.amber:T.rose;
    return <div style={{marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
        <span style={{color:T.dimLight,fontWeight:500}}>{label}</span><span style={{color:c,fontFamily:T.mono,fontWeight:600}}>{score||"?"}/5</span>
      </div>
      <div style={{height:3,background:"rgba(0,0,0,0.05)",borderRadius:2}}><div style={{height:"100%",width:`${((score||0)/5)*100}%`,background:c,borderRadius:2}}/></div>
      {note&&<div style={{fontSize:9,color:T.dim,marginTop:2,fontStyle:"italic"}}>{note}</div>}
    </div>;
  };
  const ErrBanner = () => apiError?<div style={{margin:"8px 0",padding:"8px 12px",background:T.roseBg,border:`1px solid rgba(196,122,122,0.15)`,borderRadius:8,fontSize:11,color:T.rose,display:"flex",justifyContent:"space-between"}}><span>⚠️ {apiError}</span><button onClick={()=>setApiError(null)} style={{background:"none",border:"none",color:T.rose,cursor:"pointer"}}>✕</button></div>:null;
  const MoodInd = () => {
    const m=["😡","😟","😐","🙂","😊"],l=["Podrážděný","Nespokojený","Neutrální","Spokojený","Nadšený"];
    return <div style={{display:"flex",alignItems:"center",gap:4}}><span style={{fontSize:14}}>{m[clientMood-1]}</span><span style={{fontSize:9,color:T.dim}}>{l[clientMood-1]}</span></div>;
  };

  // ════════════════════════════════════════════════════════════
  // HOME SCREEN
  // ════════════════════════════════════════════════════════════
  if (screen === "home") {
    const avgScore = history.filter(h=>typeof h.score==="number");
    const avg = avgScore.length ? (avgScore.reduce((a,h)=>a+h.score,0)/avgScore.length).toFixed(1) : "—";
    const successRate = avgScore.length ? Math.round(avgScore.filter(h=>h.result==="success").length/avgScore.length*100) : 0;

    return (
      <div style={{fontFamily:T.font,minHeight:"100vh",background:T.bg,color:T.text}}>
        {/* Topbar — hub style */}
        <div style={{background:"#1A1A1A",display:"flex",alignItems:"stretch",height:56,flexShrink:0}}>
          <div style={{flex:1,display:"flex",alignItems:"center",padding:"0 24px",gap:32}}>
            <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
              <div style={{width:30,height:30,position:"relative",flexShrink:0}}>
                <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.05)",border:"1.5px solid rgba(255,255,255,0.15)"}}/>
                <div style={{position:"absolute",left:0,right:0,bottom:0,height:"50%",background:"#CC0000"}}/>
              </div>
              <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:"0.8rem",fontWeight:500,color:"#fff",letterSpacing:"0.16em",textTransform:"uppercase"}}>PORTÁL</span>
            </div>
            <div style={{display:"flex",height:"100%",gap:0}}>
              <Nav label="Trénink" active={screen==="home"} onClick={()=>setScreen("home")}/>
              <Nav label="Dovednosti" onClick={()=>setScreen("skills")}/>
              <Nav label="Progrese" onClick={()=>setScreen("progress")}/>
              <Nav label="Lekce" onClick={()=>setScreen("lessons")}/>
            </div>
          </div>
          <div style={{background:"#CC0000",display:"flex",alignItems:"center",padding:"0 20px",gap:12,flexShrink:0}}>
            {user&&<div style={{display:"flex",flexDirection:"column",alignItems:"flex-end"}}>
              <span style={{fontSize:"0.8125rem",fontWeight:500,color:"#fff",lineHeight:1.2}}>{user.name}</span>
              <span style={{fontSize:"0.7rem",color:"rgba(255,255,255,0.7)",fontWeight:300}}>{user.role}</span>
            </div>}
            {logout&&<button onClick={logout} style={{fontFamily:T.font,fontSize:"0.75rem",fontWeight:500,color:"rgba(255,255,255,0.85)",background:"rgba(0,0,0,0.15)",border:"1px solid rgba(255,255,255,0.2)",cursor:"pointer",padding:"6px 14px",letterSpacing:"0.02em"}}>Odhlásit</button>}
          </div>
        </div>

        <div style={{maxWidth:900,margin:"0 auto",padding:"24px 28px 60px"}}>
          <div style={{display:"flex",gap:12,marginBottom:4}}>
            <Stat label="Tréninků" value={history.length||"0"} sub={`tento měsíc: ${history.filter(h=>new Date(h.date)>new Date(Date.now()-30*86400000)).length}`}/>
            <Stat label="Průměr" value={avg} accent={T.accent} sub={avgScore.length>=2?`trend: ${(avgScore[0]?.score||0)>=(avgScore[Math.min(4,avgScore.length-1)]?.score||0)?"↗":"↘"}`:""} />
            <Stat label="Úspěšnost" value={`${successRate}%`} sub={avgScore.length?`${avgScore.filter(h=>h.result==="success").length} z ${avgScore.length}`:""} />
            <Stat label="Nejslabší" value="—" accent={T.rose} sub="po 3+ trénincích"/>
          </div>

          <SHead text="Osobní schůzka" right="3 režimy"/>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <Card title="Náhodný klient" desc="Validované kombinace. Zvolte obtížnost 1–5+."
              meta={["30 situací","35 cílů","10 osobností","8 obtížností"]}
              onClick={()=>{setMode("random");setScreen("difficulty");}}/>
            <Card title="Předpřipravené scénáře" desc="Cílený trénink konkrétních dovedností."
              meta={["cross-sell","námitky","DIP","dluhy","refinancování"]}
              onClick={()=>{setMode("preset");setScreen("presets");}} color={T.accentLight}/>
            <Card title="Manuální konfigurace" desc="Plná kontrola nad profilem klienta. 9 dimenzí."
              meta={["expertní režim"]} onClick={()=>{setMode("manual");setScreen("manual");setSetupStep(0);}} color={T.silver}/>
          </div>

          <SHead text="Párová schůzka"/>
          <Card title="Dva klienti najednou" desc="Náhodné profily a dynamika. Partneři · rodič + dítě · prarodič + vnouče."
            meta={["6 dynamik","obtížnost na výběr"]} onClick={()=>{setMode("pair");setScreen("difficulty");}} color={T.lavender}/>

          <SHead text="Telefonní hovor" right="2 režimy"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <Card title="Příchozí hovor" desc="Klient volá vám. Rozpoznejte příležitost."
              onClick={()=>{setMode("phone-in");setScreen("difficulty");}} color={T.accent}/>
            <Card title="Odchozí hovor" desc="Vy voláte klientovi. Pozvěte na schůzku."
              meta={["18 záminek"]} onClick={()=>{setMode("phone-out");setScreen("phone-pretext");}} color={T.teal}/>
          </div>

          <SHead text="Řetězený trénink" right="kompletní proces"/>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
            <Card title="Schůzka → Telefon → Schůzka" desc="3 fáze s jedním klientem."
              meta={["3 fáze","trojité hodnocení"]} onClick={()=>{setMode("chain-a");setScreen("difficulty");}} color={T.amber}/>
            <Card title="Telefon → Schůzka → Tel → Schůzka" desc="4 fáze, kompletní cyklus."
              meta={["4 fáze","kompletní cyklus"]} onClick={()=>{setMode("chain-b");setScreen("difficulty");}} color={T.amber}/>
          </div>

          <SHead text="Učební režim"/>
          <Card title="Reverzní mód" desc="AI je poradce, vy jste klient. Pozorujte techniky a učte se."
            meta={["pozorovací režim"]} onClick={()=>{setMode("reverse");setScreen("difficulty");}} color={T.silver}/>

          {history.length>0&&<>
            <div style={{height:1,background:T.border,margin:"24px 0"}}/>
            <SHead text="Poslední tréninky" right="zobrazit vše →"/>
            <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,overflow:"hidden"}}>
              {history.slice(0,5).map((h,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",padding:"11px 16px",borderTop:i>0?`1px solid ${T.border}`:"none",fontSize:12}}>
                  <span style={{fontSize:9,fontFamily:T.mono,color:T.dim,width:85}}>{h.mode||"osobní"}</span>
                  <span style={{flex:1,fontWeight:500,color:T.textSoft}}>{h.situation}</span>
                  <span style={{fontSize:9,fontFamily:T.mono,color:T.dim,width:55}}>{h.duration}</span>
                  <span style={{fontSize:9,fontFamily:T.mono,color:T.dim,width:35}}>{new Date(h.date).toLocaleDateString("cs-CZ",{day:"numeric",month:"numeric"})}</span>
                  <span style={{fontSize:18,fontWeight:700,fontFamily:T.mono,width:30,textAlign:"right",color:h.score>=8?T.accent:h.score>=5?T.amber:T.rose}}>{h.score}</span>
                </div>
              ))}
            </div>
          </>}
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // DIFFICULTY SELECT
  // ════════════════════════════════════════════════════════════
  if (screen === "difficulty") return (
    <div style={{fontFamily:T.font,minHeight:"100vh",background:T.bg,color:T.text,padding:24}}>
      <div style={{maxWidth:560,margin:"0 auto"}}>
        <button onClick={resetAll} style={{background:"none",border:"none",color:T.dim,cursor:"pointer",fontFamily:T.font,fontSize:13,marginBottom:12}}>← Zpět</button>
        <h2 style={{fontSize:18,fontWeight:700,margin:"0 0 16px"}}>Zvolte obtížnost</h2>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {DIFFICULTIES.map(d=>(
            <button key={d.level} onClick={()=>{setSel({...sel,difficulty:d});}} style={{
              padding:"12px 16px",textAlign:"left",fontFamily:T.font,
              background:sel.difficulty?.level===d.level?T.elevated:T.surface,
              border:`1px solid ${sel.difficulty?.level===d.level?d.color+"30":T.border}`,borderRadius:8,cursor:"pointer",color:T.text}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontWeight:600,fontSize:13,color:sel.difficulty?.level===d.level?d.color:T.text}}>{d.emoji} {d.name}</span>
                {d.plusFactors&&<span style={{fontSize:8,fontFamily:T.mono,padding:"2px 6px",borderRadius:3,background:T.amberBg,color:T.amber}}>+ komplikace</span>}
              </div>
              <div style={{fontSize:11,color:T.dim,marginTop:4}}>{d.desc}</div>
            </button>
          ))}
        </div>
        {/* Voice mode selector */}
        <div style={{marginTop:16,padding:"12px 16px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:8}}>
          <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:2,marginBottom:8}}>Režim komunikace</div>
          <div style={{display:"flex",gap:6}}>
            {[{v:"text",l:"Text",d:"Klasický chat"},{v:"voice",l:"Hlas",d:"Mluvíte i posloucháte"},{v:"hybrid",l:"Hybrid",d:"Mluvíte, klient píše"}].map(m=>(
              <button key={m.v} onClick={()=>setVoiceMode(m.v)} style={{flex:1,padding:"8px",fontFamily:T.font,fontSize:11,textAlign:"center",
                background:voiceMode===m.v?T.accentBg:"transparent",color:voiceMode===m.v?T.accent:T.dim,
                border:`1px solid ${voiceMode===m.v?T.accent+"30":T.border}`,borderRadius:6,cursor:"pointer"}}>
                <div style={{fontWeight:600}}>{m.l}</div>
                <div style={{fontSize:9,marginTop:2,color:T.dim}}>{m.d}</div>
              </button>
            ))}
          </div>
        </div>
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <button onClick={resetAll} style={{padding:"10px 20px",fontFamily:T.font,fontSize:13,background:T.surface,color:T.dim,border:`1px solid ${T.border}`,borderRadius:8,cursor:"pointer"}}>← Zpět</button>
          <button disabled={!sel.difficulty} onClick={()=>startChat()} style={{flex:1,padding:"10px 20px",fontFamily:T.font,fontSize:13,fontWeight:600,
            background:sel.difficulty?T.accent:"rgba(0,0,0,0.04)",color:sel.difficulty?"#fff":T.dim,border:"none",borderRadius:8,cursor:sel.difficulty?"pointer":"not-allowed"}}>Začít trénink →</button>
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // PRESETS
  // ════════════════════════════════════════════════════════════
  if (screen === "presets") return (
    <div style={{fontFamily:T.font,minHeight:"100vh",background:T.bg,color:T.text,padding:24}}>
      <div style={{maxWidth:560,margin:"0 auto"}}>
        <button onClick={resetAll} style={{background:"none",border:"none",color:T.dim,cursor:"pointer",fontFamily:T.font,fontSize:13,marginBottom:12}}>← Zpět</button>
        <h2 style={{fontSize:18,fontWeight:700,margin:"0 0 16px"}}>Předpřipravené scénáře</h2>
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          {PRESET_SCENARIOS.map(p=>(
            <button key={p.id} onClick={()=>setSel({...sel,preset:p.id})} style={{
              padding:"12px 16px",textAlign:"left",fontFamily:T.font,
              background:sel.preset===p.id?T.elevated:T.surface,
              border:`1px solid ${sel.preset===p.id?T.accent+"30":T.border}`,borderRadius:8,cursor:"pointer",color:T.text}}>
              <div style={{fontWeight:600,fontSize:13}}>{p.name}</div>
              <div style={{fontSize:11,color:T.dim,marginTop:3}}>{p.desc}</div>
              <div style={{fontSize:9,fontFamily:T.mono,color:T.dim,marginTop:4}}>{"★".repeat(p.diff)} · {PERSONALITIES.find(x=>x.id===p.persId)?.name}</div>
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:8,marginTop:16}}>
          <button onClick={resetAll} style={{padding:"10px 20px",fontFamily:T.font,fontSize:13,background:T.surface,color:T.dim,border:`1px solid ${T.border}`,borderRadius:8,cursor:"pointer"}}>← Zpět</button>
          <button disabled={!sel.preset} onClick={()=>startChat()} style={{flex:1,padding:"10px 20px",fontFamily:T.font,fontSize:13,fontWeight:600,
            background:sel.preset?T.accent:"rgba(0,0,0,0.04)",color:sel.preset?"#fff":T.dim,border:"none",borderRadius:8,cursor:sel.preset?"pointer":"not-allowed"}}>Začít →</button>
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // PHONE PRETEXT SELECT
  // ════════════════════════════════════════════════════════════
  if (screen === "phone-pretext") return (
    <div style={{fontFamily:T.font,minHeight:"100vh",background:T.bg,color:T.text,padding:24}}>
      <div style={{maxWidth:560,margin:"0 auto"}}>
        <button onClick={resetAll} style={{background:"none",border:"none",color:T.dim,cursor:"pointer",fontFamily:T.font,fontSize:13,marginBottom:12}}>← Zpět</button>
        <h2 style={{fontSize:18,fontWeight:700,margin:"0 0 4px"}}>Odchozí hovor – záminka</h2>
        <p style={{fontSize:12,color:T.dim,margin:"0 0 16px"}}>Cíl: pozvat klienta na osobní schůzku</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          {PHONE_PRETEXTS.map(p=>(
            <button key={p.id} onClick={()=>setSel({...sel,pretext:p.id})} style={{
              padding:"10px 12px",textAlign:"left",fontFamily:T.font,fontSize:12,
              background:sel.pretext===p.id?T.elevated:T.surface,
              border:`1px solid ${sel.pretext===p.id?T.teal+"30":T.border}`,borderRadius:8,cursor:"pointer",color:T.text}}>
              <div style={{fontWeight:600,fontSize:12}}>{p.name}</div>
              <div style={{fontSize:10,color:T.dim,marginTop:2}}>{p.desc}</div>
            </button>
          ))}
        </div>
        <div style={{display:"flex",gap:8,marginTop:16}}>
          <button onClick={resetAll} style={{padding:"10px 20px",fontFamily:T.font,fontSize:13,background:T.surface,color:T.dim,border:`1px solid ${T.border}`,borderRadius:8,cursor:"pointer"}}>← Zpět</button>
          <button disabled={!sel.pretext} onClick={()=>setScreen("difficulty")} style={{flex:1,padding:"10px 20px",fontFamily:T.font,fontSize:13,fontWeight:600,
            background:sel.pretext?T.teal:"rgba(0,0,0,0.04)",color:sel.pretext?"#fff":T.dim,border:"none",borderRadius:8,cursor:sel.pretext?"pointer":"not-allowed"}}>Vybrat obtížnost →</button>
        </div>
      </div>
    </div>
  );

  // ════════════════════════════════════════════════════════════
  // MANUAL SETUP
  // ════════════════════════════════════════════════════════════
  if (screen === "manual") {
    const steps = [
      {title:"Životní situace",items:LIFE_SITUATIONS,key:"situation",render:i=>`${i.label} (${i.age}, ${i.income})`},
      {title:"Důvod návštěvy",items:VISIT_REASONS,key:"reason",render:i=>i.label},
      {title:"Highlight cíl",items:HIGHLIGHT_GOALS,key:"highlight",render:i=>i.goal},
      {title:"Osobní život",items:PERSONAL_DETAILS.map((p,i)=>({id:i,label:p})),key:"personal",render:i=>i.label,isStr:true},
      {title:"Stav financí",items:FINANCIAL_DETAILS.map((f,i)=>({id:i,label:f})),key:"financial",render:i=>i.label,isStr:true},
      {title:"Cíl klienta",items:CLIENT_GOALS.map((g,i)=>({id:i,label:g})),key:"goal",render:i=>i.label,isStr:true},
      {title:"Obtížnost",items:DIFFICULTIES,key:"difficulty",render:i=>`${i.emoji} ${i.name} – ${i.desc}`},
      {title:"Povaha",items:PERSONALITIES,key:"personality",render:i=>`${i.name} – ${i.desc}`},
      {title:"Stav klienta",items:KB_STATUSES,key:"kbStatus",render:i=>`${i.name} – ${i.desc}`},
    ];
    const step=steps[setupStep];
    const curSel = step.isStr ? sel[step.key] : sel[step.key];

    return (
      <div style={{fontFamily:T.font,minHeight:"100vh",background:T.bg,color:T.text,padding:24}}>
        <div style={{maxWidth:560,margin:"0 auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <span style={{fontSize:11,color:T.dim,textTransform:"uppercase",letterSpacing:1.5}}>Krok {setupStep+1} z {steps.length}</span>
            <div style={{display:"flex",gap:3}}>{steps.map((_,i)=><div key={i} style={{width:20,height:3,borderRadius:2,background:i<=setupStep?T.accent:"rgba(0,0,0,0.06)"}}/>)}</div>
          </div>
          <h2 style={{fontSize:16,fontWeight:700,margin:"0 0 12px"}}>{step.title}</h2>
          <div style={{maxHeight:"55vh",overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
            {step.items.map((item,idx)=>{
              const val = step.isStr ? (item.label||item) : item;
              const isSel = step.isStr ? (curSel===val.label||curSel===val) : (curSel?.id===item.id||curSel?.level===item.level);
              return <button key={idx} onClick={()=>setSel({...sel,[step.key]:step.isStr?(item.label||item):item})}
                style={{padding:"8px 12px",textAlign:"left",fontFamily:T.font,fontSize:12,
                  background:isSel?T.elevated:T.surface,color:isSel?T.accentLight:T.text,
                  border:`1px solid ${isSel?T.accent+"30":T.border}`,borderRadius:6,cursor:"pointer"}}>{step.render(item)}</button>;
            })}
          </div>
          <div style={{display:"flex",gap:8,marginTop:16}}>
            <button onClick={()=>setupStep>0?setSetupStep(setupStep-1):resetAll()} style={{padding:"10px 20px",fontFamily:T.font,fontSize:13,background:T.surface,color:T.dim,border:`1px solid ${T.border}`,borderRadius:8,cursor:"pointer"}}>← Zpět</button>
            {setupStep<steps.length-1
              ?<button disabled={!curSel} onClick={()=>setSetupStep(setupStep+1)} style={{flex:1,padding:"10px 20px",fontFamily:T.font,fontSize:13,fontWeight:600,background:curSel?T.accent:"rgba(0,0,0,0.04)",color:curSel?"#fff":T.dim,border:"none",borderRadius:8,cursor:curSel?"pointer":"not-allowed"}}>Další →</button>
              :<button disabled={!curSel} onClick={()=>startChat()} style={{flex:1,padding:"10px 20px",fontFamily:T.font,fontSize:13,fontWeight:600,background:curSel?T.accent:"rgba(0,0,0,0.04)",color:curSel?"#fff":T.dim,border:"none",borderRadius:8,cursor:curSel?"pointer":"not-allowed"}}>Začít trénink →</button>}
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // CHAT SCREEN
  // ════════════════════════════════════════════════════════════
  if (screen === "chat") {
    const isPhone = mode?.startsWith("phone");
    const advisorInfo = profile?.kbStatus?.products?.length > 0;
    const canEval = messages.length >= 4;

    return (
      <div style={{fontFamily:T.font,height:"100vh",display:"flex",flexDirection:"column",background:T.bg}}>
        {/* Header */}
        <div style={{background:T.bgSub,borderBottom:`1px solid ${T.border}`,padding:"8px 14px",flexShrink:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:13,fontWeight:600}}>{isPhone?"📞":mode==="pair"?"👫":mode==="reverse"?"🔄":"👤"} {isPhone?(mode==="phone-out"?"Odchozí hovor":"Příchozí hovor"):mode==="pair"?"Párová schůzka":mode==="reverse"?"Reverzní mód – AI je poradce":"Klient na schůzce"}</span>
              {profile?.kbStatus?.id!=="new"&&<span style={{fontSize:10,color:T.accent}}>● KB</span>}
              <MoodInd/>
              {speaking&&<span style={{fontSize:10,color:T.accent,animation:"pulse 1s infinite"}}>🔊 Klient mluví...</span>}
              {voiceMode!=="text"&&<span style={{fontSize:9,padding:"2px 6px",borderRadius:4,background:T.tealBg,color:T.teal,fontFamily:T.mono}}>{voiceMode==="voice"?"🎤 HLAS":"🎤 HYBRID"}</span>}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:11,color:timer.s>1800?T.rose:timer.s>900?T.amber:T.dim,fontWeight:600,fontFamily:T.mono,fontVariantNumeric:"tabular-nums"}}>⏱ {timer.fmt()}</span>
              <span style={{fontSize:9,color:T.dim,background:"rgba(0,0,0,0.03)",padding:"2px 6px",borderRadius:3,fontFamily:T.mono}}>{messages.length}</span>
              <button disabled={!canEval} onClick={runEval} style={{padding:"5px 10px",fontSize:11,fontWeight:600,fontFamily:T.font,background:canEval?T.accent:"rgba(0,0,0,0.04)",color:canEval?"#fff":T.dim,border:"none",borderRadius:6,cursor:canEval?"pointer":"not-allowed"}}>📊 Vyhodnotit</button>
              <button onClick={resetAll} style={{padding:"5px 10px",fontSize:11,fontFamily:T.font,background:T.roseBg,color:T.rose,border:`1px solid rgba(196,122,122,0.15)`,borderRadius:6,cursor:"pointer"}}>✕</button>
            </div>
          </div>
        </div>

        {/* Client left banner */}
        {clientLeft&&<div style={{padding:"10px 14px",background:T.roseBg,borderBottom:`1px solid rgba(196,122,122,0.15)`,textAlign:"center"}}>
          <span style={{fontSize:12,fontWeight:600,color:T.rose}}>{isPhone?"📞 Klient zavěsil":"🚪 Klient ukončil schůzku"}</span>
          <span style={{fontSize:11,color:T.dim,marginLeft:8}}>Klikněte na Vyhodnotit</span>
        </div>}

        {/* Meeting scheduled banner */}
        {meetingScheduled&&<div style={{padding:"10px 14px",background:T.accentBg,borderBottom:`1px solid rgba(110,180,150,0.15)`,textAlign:"center"}}>
          <span style={{fontSize:12,fontWeight:600,color:T.accent}}>✅ Schůzka domluvena!</span>
        </div>}

        {/* Products */}
        {advisorInfo&&<details style={{background:"rgba(110,180,150,0.03)",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          <summary style={{padding:"8px 14px",fontSize:11,color:T.accent,cursor:"pointer",fontWeight:600}}>📁 Karta klienta ({profile.kbStatus.products.length})</summary>
          <div style={{padding:"4px 14px 12px"}}>{profile.kbStatus.products.map((p,i)=>(
            <div key={i} style={{marginBottom:8,background:"rgba(0,0,0,0.04)",borderRadius:6,padding:"6px 10px",border:`1px solid ${T.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}><span style={{fontWeight:600}}>{p.name}</span><span style={{color:T.accent,fontWeight:600}}>{p.balance}</span></div>
              {p.lastTx?.map((tx,j)=><div key={j} style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.dim,padding:"1px 0"}}><span>{tx.date} – {tx.desc}</span><span style={{color:tx.amount.startsWith("+")?T.accent:T.rose}}>{tx.amount}</span></div>)}
            </div>
          ))}</div>
        </details>}

        <ErrBanner/>

        {/* Reverse mode: show client profile to play */}
        {mode==="reverse"&&<div style={{padding:"10px 14px",background:T.amberBg,borderBottom:`1px solid rgba(196,168,106,0.15)`,flexShrink:0}}>
          <div style={{fontSize:10,fontWeight:700,color:T.amber,textTransform:"uppercase",letterSpacing:1,marginBottom:4}}>Váš profil klienta (hrajete vy)</div>
          <div style={{fontSize:11,color:T.textSoft,lineHeight:1.5}}>
            {profile?.situation?.label} · {profile?.reason?.label} · {profile?.personality?.name}<br/>
            Skrytý cíl: {profile?.highlight?.goal}
          </div>
        </div>}

        {/* Chain phase indicator */}
        {mode?.startsWith("chain")&&<div style={{padding:"6px 14px",background:"rgba(196,168,106,0.04)",borderBottom:`1px solid ${T.border}`,flexShrink:0,display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontSize:10,fontWeight:700,color:T.amber}}>🔗 ŘETĚZ</span>
          {(mode==="chain-a"?["Schůzka","Telefon","Schůzka"]:["Telefon","Schůzka","Telefon","Schůzka"]).map((ph,i)=>(
            <span key={i} style={{fontSize:9,padding:"2px 8px",borderRadius:4,fontFamily:T.mono,
              background:i===chainPhase?T.amber:i<chainPhase?T.accentBg:"rgba(0,0,0,0.04)",
              color:i===chainPhase?"#fff":i<chainPhase?T.accent:T.dim,fontWeight:i===chainPhase?700:400}}>{ph}</span>
          ))}
        </div>}

        {/* Messages */}
        <div style={{flex:1,overflowY:"auto",padding:14,display:"flex",flexDirection:"column",gap:8}}>
          {messages.map((m,i)=>(
            <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
              <div style={{maxWidth:"80%",padding:"10px 14px",borderRadius:m.role==="user"?"12px 12px 4px 12px":"12px 12px 12px 4px",
                background:m.role==="user"?T.accent:"rgba(0,0,0,0.05)",color:m.role==="user"?"#fff":T.text,
                fontSize:13,lineHeight:1.5,border:m.role==="user"?"none":`1px solid ${T.border}`}}>
                <div style={{fontSize:9,color:m.role==="user"?"rgba(255,255,255,0.5)":T.dim,marginBottom:2,fontWeight:600}}>
                  {m.role==="user"?"PORADCE":"KLIENT"} · {m.time}
                </div>{m.content}
              </div>
            </div>
          ))}
          {loading&&<div style={{padding:"8px 14px",borderRadius:12,background:"rgba(0,0,0,0.03)",color:T.dim,fontSize:12,alignSelf:"flex-start",border:`1px solid ${T.border}`}}><span style={{animation:"pulse 1.5s infinite"}}>Klient přemýšlí...</span></div>}
          <div ref={chatEnd}/>
        </div>

        {/* Quick phrases */}
        {showPhrases&&<div style={{padding:"8px 14px",background:"rgba(110,180,150,0.03)",borderTop:`1px solid ${T.border}`,flexShrink:0,maxHeight:160,overflowY:"auto"}}>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>{QUICK_PHRASES.map((qp,i)=>(
            <button key={i} onClick={()=>{sendMessage(qp.text);setShowPhrases(false);}} style={{padding:"5px 8px",fontSize:10,fontFamily:T.font,background:"rgba(0,0,0,0.05)",color:T.accentLight,border:`1px solid ${T.border}`,borderRadius:5,cursor:"pointer"}}>
              <div style={{fontWeight:600}}>{qp.label}</div>
            </button>
          ))}</div>
        </div>}

        {/* Input */}
        <div style={{padding:"10px 14px",background:T.bgSub,borderTop:`1px solid ${T.border}`,flexShrink:0}}>
          {voiceMode === "voice" && !clientLeft ? (
            /* Voice mode: big mic button + auto-send indicator */
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
              {voice.listening && input && <div style={{fontSize:11,color:T.textSoft,background:"rgba(0,0,0,0.03)",padding:"6px 12px",borderRadius:8,maxWidth:"90%",textAlign:"center"}}>{input}<span style={{color:T.dim,marginLeft:8,fontSize:9}}>odesílá se za 3s...</span></div>}
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <button onClick={()=>setShowPhrases(!showPhrases)} style={{width:36,height:36,borderRadius:"50%",border:"none",cursor:"pointer",fontSize:14,background:showPhrases?"rgba(110,180,150,0.15)":"rgba(0,0,0,0.05)",color:showPhrases?T.accent:T.dim}}>💬</button>
                <button onClick={handleVoice} disabled={speaking} style={{width:60,height:60,borderRadius:"50%",border:"none",cursor:speaking?"not-allowed":"pointer",fontSize:24,
                  background:voice.listening?"rgba(196,122,122,0.2)":speaking?"rgba(91,164,164,0.15)":"rgba(110,180,150,0.15)",
                  color:voice.listening?T.rose:speaking?T.teal:T.accent,
                  animation:voice.listening?"pulse 1s infinite":"none",boxShadow:voice.listening?`0 0 20px rgba(196,122,122,0.3)`:"none"}}>
                  {voice.listening?"⏹":speaking?"🔊":"🎤"}
                </button>
                <button onClick={()=>setVoiceMode("text")} style={{width:36,height:36,borderRadius:"50%",border:"none",cursor:"pointer",fontSize:12,background:"rgba(0,0,0,0.05)",color:T.dim}} title="Přepnout na text">⌨️</button>
              </div>
              <div style={{fontSize:9,color:T.dim}}>{speaking?"Klient mluví...":voice.listening?"Poslouchám... (3s pauza = odeslat)":"Klikněte na mikrofon"}</div>
            </div>
          ) : (
            /* Text / Hybrid mode: standard input */
            <div style={{display:"flex",gap:6,alignItems:"flex-end"}}>
              <button onClick={()=>setShowPhrases(!showPhrases)} style={{width:36,height:36,borderRadius:"50%",border:"none",cursor:"pointer",fontSize:14,flexShrink:0,background:showPhrases?"rgba(110,180,150,0.15)":"rgba(0,0,0,0.05)",color:showPhrases?T.accent:T.dim}}>💬</button>
              {voice.supported&&<button onClick={handleVoice} style={{width:36,height:36,borderRadius:"50%",border:"none",cursor:"pointer",fontSize:16,flexShrink:0,background:voice.listening?"rgba(196,122,122,0.15)":"rgba(0,0,0,0.05)",color:voice.listening?T.rose:T.dim,animation:voice.listening?"pulse 1s infinite":"none"}}>{voice.listening?"⏹":"🎤"}</button>}
              <textarea ref={inputRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey}
                placeholder={clientLeft?"Schůzka ukončena":voice.listening?"Poslouchám...":"Pište jako poradce... (Enter = odeslat)"} rows={2} maxLength={2000} disabled={clientLeft}
                style={{flex:1,padding:"8px 12px",fontSize:13,fontFamily:T.font,background:"rgba(0,0,0,0.03)",color:T.text,border:`1px solid ${T.border}`,borderRadius:8,resize:"none",outline:"none",opacity:clientLeft?0.3:1}}/>
              <button onClick={()=>sendMessage()} disabled={loading||!input.trim()||clientLeft} style={{width:36,height:36,borderRadius:"50%",border:"none",cursor:loading||!input.trim()||clientLeft?"not-allowed":"pointer",fontSize:14,flexShrink:0,background:loading||!input.trim()||clientLeft?"rgba(0,0,0,0.04)":T.accent,color:loading||!input.trim()||clientLeft?T.dim:"#fff"}}>↑</button>
              {voiceMode==="hybrid"&&<button onClick={()=>setVoiceMode("text")} style={{width:36,height:36,borderRadius:"50%",border:"none",cursor:"pointer",fontSize:12,flexShrink:0,background:"rgba(0,0,0,0.05)",color:T.dim}} title="Vypnout hlas">🔇</button>}
            </div>
          )}
        </div>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // EVAL SCREEN
  // ════════════════════════════════════════════════════════════
  if (screen === "eval") {
    const ev=evaluation;
    const sc=ev?.overall_score>=8?T.accent:ev?.overall_score>=5?T.amber:T.rose;
    const rl={success:"✅ ÚSPĚCH – Highlight cíl odhalen",partial:"⚠️ ČÁSTEČNÝ – Jen primární požadavek",fail:"❌ NEÚSPĚCH – Klient odešel"};

    return (
      <div style={{fontFamily:T.font,minHeight:"100vh",background:T.bg,color:T.text,padding:"16px 14px"}}>
        {evalLoading?<div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"60vh",gap:16}}>
          <div style={{fontSize:48,animation:"pulse 1.5s infinite"}}>📊</div><p style={{color:T.dim}}>AI analyzuje výkon...</p>
          <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
        </div>:ev&&<div style={{maxWidth:580,margin:"0 auto"}}>
          <ErrBanner/>
          {/* Score */}
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{fontSize:48,fontWeight:800,color:sc,fontFamily:T.mono}}>{ev.overall_score}<span style={{fontSize:20,color:T.dim}}>/10</span></div>
            <div style={{fontSize:13,color:sc,fontWeight:600,marginTop:4}}>{rl[ev.result]||ev.result}</div>
            <div style={{fontSize:10,color:T.dim,marginTop:4}}>⏱ {timer.fmt()} · {messages.length} zpráv · {profile?.difficulty?.emoji} {profile?.difficulty?.name} · {profile?.personality?.name}</div>
            {clientLeft&&<div style={{fontSize:10,color:T.rose,marginTop:2}}>Klient ukončil schůzku předčasně</div>}
            {meetingScheduled&&<div style={{fontSize:10,color:T.accent,marginTop:2}}>Schůzka byla domluvena</div>}
          </div>

          {/* Skills */}
          {ev.skills&&Object.keys(ev.skills).length>0&&<Section title="Dovednosti poradce" color={T.lavender}>
            <SkillBar label="Cross-sell" score={ev.skills.cross_sell?.score} note={ev.skills.cross_sell?.note}/>
            <SkillBar label="Zvládání námitek" score={ev.skills.objection_handling?.score} note={ev.skills.objection_handling?.note}/>
            <SkillBar label="Budování důvěry" score={ev.skills.rapport?.score} note={ev.skills.rapport?.note}/>
            <SkillBar label="Aktivní naslouchání" score={ev.skills.active_listening?.score} note={ev.skills.active_listening?.note}/>
            <SkillBar label="Compliance" score={ev.skills.compliance?.score} note={ev.skills.compliance?.note}/>
            <SkillBar label="Přizpůsobení" score={ev.skills.adaptation?.score} note={ev.skills.adaptation?.note}/>
          </Section>}

          {/* Phone skills */}
          {ev.phone_skills&&<Section title="Telefonní dovednosti" color={T.teal}>
            <SkillBar label="Úvodní pitch" score={ev.phone_skills.pitch?.score} note={ev.phone_skills.pitch?.note}/>
            <SkillBar label="Efektivita" score={ev.phone_skills.efficiency?.score} note={ev.phone_skills.efficiency?.note}/>
            {ev.phone_skills.meeting_invite&&<SkillBar label="Pozvání na schůzku" score={ev.phone_skills.meeting_invite?.score} note={ev.phone_skills.meeting_invite?.note}/>}
            {ev.phone_skills.no_selling&&<SkillBar label="Neprodával po telefonu" score={ev.phone_skills.no_selling?.score} note={ev.phone_skills.no_selling?.note}/>}
          </Section>}

          {/* Goals */}
          <Section title="Odhalené cíle" color={T.accent}>
            {[{l:"Highlight cíl",v:profile?.highlight?.goal,f:ev.highlight_discovered},{l:"Produkt nabídnut",v:profile?.highlight?.product,f:ev.highlight_product_offered},
              {l:"Osobní život",v:profile?.personal,f:ev.sub_goals?.personal},{l:"Stav financí",v:profile?.financial,f:ev.sub_goals?.financial},{l:"Cíl klienta",v:profile?.clientGoal,f:ev.sub_goals?.client_goal}
            ].map((g,i)=><div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"5px 0",borderBottom:i<4?`1px solid ${T.border}`:"none"}}>
              <div style={{flex:1}}><div style={{fontSize:10,color:T.dim,fontWeight:600}}>{g.l}</div><div style={{fontSize:11,color:T.dimLight,marginTop:1}}>{g.v}</div></div>
              <span style={{fontSize:16,marginLeft:8}}>{g.f?"✅":"❌"}</span>
            </div>)}
          </Section>

          {/* Feedback */}
          <Section title="Zpětná vazba" color={T.teal}>
            {ev.advisor_feedback?.good?.length>0&&<div style={{marginBottom:8}}><div style={{fontSize:10,fontWeight:700,color:T.accent,marginBottom:3}}>✅ DOBRÉ:</div>{ev.advisor_feedback.good.map((t,i)=><div key={i} style={{fontSize:12,color:T.accentLight,padding:"2px 0",lineHeight:1.5}}>• {t}</div>)}</div>}
            {ev.advisor_feedback?.improve?.length>0&&<div style={{marginBottom:8}}><div style={{fontSize:10,fontWeight:700,color:T.amber,marginBottom:3}}>🔄 ZLEPŠIT:</div>{ev.advisor_feedback.improve.map((t,i)=><div key={i} style={{fontSize:12,color:"#e8cb8a",padding:"2px 0",lineHeight:1.5}}>• {t}</div>)}</div>}
            {ev.advisor_feedback?.bad?.length>0&&<div><div style={{fontSize:10,fontWeight:700,color:T.rose,marginBottom:3}}>❌ ŠPATNÉ:</div>{ev.advisor_feedback.bad.map((t,i)=><div key={i} style={{fontSize:12,color:"#e8a0a0",padding:"2px 0",lineHeight:1.5}}>• {t}</div>)}</div>}
          </Section>

          {ev.ideal_approach&&<Section title="Ideální postup" color={T.accent}><div style={{fontSize:12,color:T.accentLight,lineHeight:1.6,fontStyle:"italic"}}>{ev.ideal_approach}</div></Section>}
          {ev.suggested_questions?.length>0&&<Section title="Otázky které by pomohly" color={T.lavender}>{ev.suggested_questions.map((q,i)=><div key={i} style={{fontSize:12,color:"#b8a0d0",padding:"2px 0"}}>→ „{q}"</div>)}</Section>}

          {/* Manager */}
          <Section title="Zpětná vazba pro manažera" color={T.amber}>
            {!pinUnlocked?<div style={{display:"flex",gap:8,alignItems:"center"}}>
              <input type="password" value={pinInput} onChange={e=>setPinInput(e.target.value)} placeholder="PIN" maxLength={4}
                style={{padding:"8px 12px",fontSize:13,fontFamily:T.font,background:"rgba(0,0,0,0.03)",color:T.text,border:`1px solid ${T.border}`,borderRadius:6,width:100,outline:"none",textAlign:"center",letterSpacing:4}}
                onKeyDown={e=>{if(e.key==="Enter"&&pinInput===PIN)setPinUnlocked(true);}}/>
              <button onClick={()=>{if(pinInput===PIN)setPinUnlocked(true);else setPinInput("");}} style={{padding:"8px 14px",fontFamily:T.font,fontSize:12,fontWeight:600,background:T.surface,color:T.dim,border:`1px solid ${T.border}`,borderRadius:6,cursor:"pointer"}}>Odemknout</button>
            </div>:<div>
              {ev.manager_feedback?.strengths?.length>0&&<div style={{marginBottom:8}}><div style={{fontSize:10,fontWeight:700,color:T.accent,marginBottom:3}}>💪 SILNÉ:</div>{ev.manager_feedback.strengths.map((t,i)=><div key={i} style={{fontSize:12,color:T.accentLight,padding:"2px 0"}}>• {t}</div>)}</div>}
              {ev.manager_feedback?.coaching_needs?.length>0&&<div style={{marginBottom:8}}><div style={{fontSize:10,fontWeight:700,color:T.amber,marginBottom:3}}>🎯 POTŘEBUJE:</div>{ev.manager_feedback.coaching_needs.map((t,i)=><div key={i} style={{fontSize:12,color:"#e8cb8a",padding:"2px 0"}}>• {t}</div>)}</div>}
              {ev.manager_feedback?.patterns?.length>0&&<div style={{marginBottom:8}}><div style={{fontSize:10,fontWeight:700,color:T.lavender,marginBottom:3}}>🔁 VZORCE:</div>{ev.manager_feedback.patterns.map((t,i)=><div key={i} style={{fontSize:12,color:"#b8a0d0",padding:"2px 0"}}>• {t}</div>)}</div>}
              <div style={{marginTop:10,padding:"8px 12px",background:"rgba(0,0,0,0.04)",borderRadius:6,border:`1px solid ${T.border}`}}>
                <div style={{fontSize:10,fontWeight:700,color:T.dim,marginBottom:3}}>SKRYTÝ PROFIL:</div>
                <div style={{fontSize:11,color:T.dimLight,lineHeight:1.6}}>
                  {profile?.situation?.label} · {profile?.kbStatus?.name} · {profile?.difficulty?.emoji} {profile?.difficulty?.name} · {profile?.personality?.name}<br/>
                  {profile?.literacy&&<>{profile.literacy.emoji} {profile.literacy.name} · </>}{profile?.bankExperience&&<>{profile.bankExperience.name}<br/></>}
                  Důvod: {profile?.reason?.label}<br/>🎯 {profile?.highlight?.goal}<br/>
                  {profile?.personal} · {profile?.financial} · {profile?.clientGoal}<br/>
                  {profile?.plusFactor&&<>Komplikace: {profile.plusFactor.name}<br/></>}
                  {profile?.objections?.length>0&&<>Námitky: {profile.objections.join(" | ")}</>}
                </div>
              </div>
            </div>}
          </Section>

          <div style={{fontSize:13,color:T.dimLight,textAlign:"center",marginBottom:14,lineHeight:1.6,fontStyle:"italic"}}>{ev.summary}</div>

          {/* Quiz section */}
          {!quiz && !quizLoading && <button onClick={startQuiz} style={{width:"100%",padding:"12px",fontFamily:T.font,fontSize:12,fontWeight:600,background:T.surface,color:T.lavender,border:`1px solid ${T.border}`,borderRadius:8,cursor:"pointer",marginBottom:8}}>📝 Produktový kvíz (3 otázky k této schůzce)</button>}
          {quizLoading && <div style={{padding:12,textAlign:"center",color:T.dim,fontSize:12}}>Generuji kvíz...</div>}
          {quiz && !quiz.done && quiz.questions[quiz.current] && (()=>{
            const q = quiz.questions[quiz.current];
            return <Section title={`Otázka ${quiz.current+1}/${quiz.questions.length}`} color={T.lavender}>
              <div style={{fontSize:13,color:T.text,marginBottom:12,lineHeight:1.5}}>{q.q}</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {q.opts.map((o,i)=><button key={i} onClick={()=>answerQuiz(i)} style={{padding:"10px 14px",fontSize:12,fontFamily:T.font,textAlign:"left",background:T.elevated,color:T.text,border:`1px solid ${T.border}`,borderRadius:6,cursor:"pointer"}}>{String.fromCharCode(65+i)}) {o}</button>)}
              </div>
            </Section>;
          })()}
          {quiz?.done && <Section title={`Kvíz: ${quiz.answers.filter(a=>a.isCorrect).length}/${quiz.questions.length} správně`} color={quiz.answers.filter(a=>a.isCorrect).length>=2?T.accent:T.rose}>
            {quiz.questions.map((q,i)=><div key={i} style={{padding:"6px 0",borderBottom:i<quiz.questions.length-1?`1px solid ${T.border}`:"none"}}>
              <div style={{fontSize:12,color:T.text,marginBottom:2}}>{q.q}</div>
              <div style={{fontSize:11,color:quiz.answers[i]?.isCorrect?T.accent:T.rose}}>{quiz.answers[i]?.isCorrect?"✅ Správně":"❌ Špatně"} – {q.explanation}</div>
            </div>)}
          </Section>}

          {/* Lesson recommendation */}
          {(()=>{const w=getWeakestSkill();const ls=w?getLessonForSkill(w):[];if(!ls.length)return null;
            return <div style={{padding:"12px 16px",background:T.accentBg,border:`1px solid rgba(110,180,150,0.12)`,borderRadius:8,marginBottom:8}}>
              <div style={{fontSize:10,fontWeight:700,color:T.accent,marginBottom:4}}>📚 DOPORUČENÁ LEKCE</div>
              <div style={{fontSize:12,color:T.textSoft,marginBottom:6}}>{ls[0].title}</div>
              <button onClick={()=>setShowLesson(ls[0])} style={{padding:"6px 14px",fontSize:11,fontFamily:T.font,fontWeight:600,background:T.surface,color:T.accent,border:`1px solid ${T.border}`,borderRadius:6,cursor:"pointer"}}>Zobrazit lekci →</button>
            </div>;
          })()}

          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:32}}>
            {/* Chain: next phase button */}
            {mode?.startsWith("chain") && (() => {
              const phases = mode === "chain-a" ? ["personal","phone-out","personal"] : ["phone-out","personal","phone-out","personal"];
              const nextIdx = chainPhase + 1;
              const phaseLabels = {personal:"Osobní schůzka","phone-out":"Telefonní follow-up"};
              return nextIdx < phases.length ? (
                <button onClick={startNextChainPhase} style={{padding:"14px",fontFamily:T.font,fontSize:13,fontWeight:600,
                  background:T.amber,color:"#fff",border:"none",borderRadius:8,cursor:"pointer"}}>
                  🔗 Další fáze: {phaseLabels[phases[nextIdx]] || phases[nextIdx]} ({nextIdx+1}/{phases.length}) →
                </button>
              ) : (
                <div style={{padding:"12px",background:T.accentBg,border:`1px solid rgba(110,180,150,0.15)`,borderRadius:8,textAlign:"center"}}>
                  <span style={{fontSize:12,fontWeight:600,color:T.accent}}>✅ Řetězený trénink dokončen! ({phases.length} fází)</span>
                </div>
              );
            })()}

            {/* Follow-up meeting button (non-chain) */}
            {!mode?.startsWith("chain") && mode !== "reverse" && (
              <button onClick={() => {
                const followUp = {...profile, isFollowUp:true, followUpPhase:1,
                  previousConversation:messages.map(m=>`${m.role==="user"?"PORADCE":"KLIENT"}: ${m.content}`).join("\n").substring(0,800)};
                setMode("random"); startChat("personal", followUp);
              }} style={{padding:"12px",fontFamily:T.font,fontSize:13,fontWeight:600,
                background:T.amberBg,color:T.amber,border:`1px solid rgba(196,168,106,0.2)`,borderRadius:8,cursor:"pointer"}}>
                🔁 Následná schůzka se stejným klientem
              </button>
            )}

            <div style={{display:"flex",gap:8}}>
              <button onClick={resetAll} style={{flex:1,padding:"12px",fontFamily:T.font,fontSize:13,fontWeight:600,background:T.accent,color:"#fff",border:"none",borderRadius:8,cursor:"pointer"}}>🔄 Nový trénink</button>
              <button onClick={()=>setScreen("chat")} style={{flex:1,padding:"12px",fontFamily:T.font,fontSize:13,background:T.surface,color:T.dim,border:`1px solid ${T.border}`,borderRadius:8,cursor:"pointer"}}>← Zpět do chatu</button>
            </div>
          </div>
        </div>}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // SKILLS / PROGRESS / LESSONS
  // ════════════════════════════════════════════════════════════
  if (screen === "skills" || screen === "progress" || screen === "lessons") {
    const filtered = history.filter(h=>typeof h.score==="number")
      .filter(h=>dashFilter.type==="all"||h.mode===dashFilter.type)
      .slice(0, dashFilter.period);
    const sk=["cross_sell","objection_handling","rapport","active_listening","compliance","adaptation"];
    const skL=["Cross-sell","Zvládání námitek","Budování důvěry","Aktivní naslouchání","Compliance","Přizpůsobení"];
    const skAvgs=sk.map(k=>{const v=filtered.map(h=>h.skills?.[k]?.score).filter(Boolean);return v.length?v.reduce((a,b)=>a+b,0)/v.length:0;});
    const weakest = sk.reduce((w,k,i)=>skAvgs[i]>0&&skAvgs[i]<(w.v||6)?{k,v:skAvgs[i],i}:w,{k:null,v:6,i:0});

    const TopBar = () => <div style={{background:"#1A1A1A",display:"flex",alignItems:"stretch",height:56,flexShrink:0}}>
      <div style={{flex:1,display:"flex",alignItems:"center",padding:"0 24px",gap:32}}>
        <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
          <div style={{width:30,height:30,position:"relative",flexShrink:0}}>
            <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.05)",border:"1.5px solid rgba(255,255,255,0.15)"}}/>
            <div style={{position:"absolute",left:0,right:0,bottom:0,height:"50%",background:"#CC0000"}}/>
          </div>
          <span style={{fontFamily:"'IBM Plex Mono',monospace",fontSize:"0.8rem",fontWeight:500,color:"#fff",letterSpacing:"0.16em",textTransform:"uppercase"}}>PORTÁL</span>
        </div>
        <div style={{display:"flex",height:"100%",gap:0}}>
          <Nav label="Trénink" onClick={()=>setScreen("home")}/>
          <Nav label="Dovednosti" active={screen==="skills"} onClick={()=>setScreen("skills")}/>
          <Nav label="Progrese" active={screen==="progress"} onClick={()=>setScreen("progress")}/>
          <Nav label="Lekce" active={screen==="lessons"} onClick={()=>setScreen("lessons")}/>
        </div>
      </div>
      <div style={{background:"#CC0000",display:"flex",alignItems:"center",padding:"0 20px",gap:12,flexShrink:0}}>
        {user&&<div style={{display:"flex",flexDirection:"column",alignItems:"flex-end"}}>
          <span style={{fontSize:"0.8125rem",fontWeight:500,color:"#fff",lineHeight:1.2}}>{user.name}</span>
          <span style={{fontSize:"0.7rem",color:"rgba(255,255,255,0.7)",fontWeight:300}}>{user.role}</span>
        </div>}
        {logout&&<button onClick={logout} style={{fontFamily:T.font,fontSize:"0.75rem",fontWeight:500,color:"rgba(255,255,255,0.85)",background:"rgba(0,0,0,0.15)",border:"1px solid rgba(255,255,255,0.2)",cursor:"pointer",padding:"6px 14px",letterSpacing:"0.02em"}}>Odhlásit</button>}
      </div>
    </div>;

    // ── LESSONS SCREEN ──
    if (screen === "lessons") return (
      <div style={{fontFamily:T.font,minHeight:"100vh",background:T.bg,color:T.text}}>
        <TopBar/>
        <div style={{maxWidth:900,margin:"0 auto",padding:"24px 28px"}}>
          <h2 style={{fontSize:18,fontWeight:700,margin:"0 0 16px"}}>📚 Mikro-lekce</h2>
          {["Komunikace","Námitky","Cross-sell","Produkty","Časový tlak","Speciální"].map(cat=>{
            const ls=LESSONS.filter(l=>l.cat===cat);
            if(!ls.length)return null;
            return <div key={cat} style={{marginBottom:20}}>
              <div style={{fontSize:10,fontWeight:600,color:T.dim,textTransform:"uppercase",letterSpacing:2,marginBottom:8}}>{cat}</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                {ls.map(l=><button key={l.id} onClick={()=>setShowLesson(l)} style={{padding:"12px 14px",textAlign:"left",fontFamily:T.font,background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,cursor:"pointer",color:T.text}}>
                  <div style={{fontSize:13,fontWeight:600,marginBottom:2}}>{l.title}</div>
                  <div style={{fontSize:10,color:T.dim}}>⏱ 2 min</div>
                </button>)}
              </div>
            </div>;
          })}
        </div>
        {/* Lesson modal */}
        {showLesson&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,zIndex:100}} onClick={()=>setShowLesson(null)}>
          <div onClick={e=>e.stopPropagation()} style={{maxWidth:520,width:"100%",maxHeight:"80vh",overflowY:"auto",background:T.elevated,borderRadius:12,border:`1px solid ${T.border}`,padding:24}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:10,fontWeight:600,color:T.accent,textTransform:"uppercase",letterSpacing:1.5}}>{showLesson.cat}</div>
              <button onClick={()=>setShowLesson(null)} style={{background:"none",border:"none",color:T.dim,cursor:"pointer",fontSize:16}}>✕</button>
            </div>
            <h3 style={{fontSize:16,fontWeight:700,margin:"0 0 12px"}}>{showLesson.title}</h3>
            <div style={{fontSize:13,color:T.textSoft,lineHeight:1.8,whiteSpace:"pre-line"}}>{showLesson.body}</div>
          </div>
        </div>}
      </div>
    );

    // ── SKILLS / PROGRESS ──
    return (
      <div style={{fontFamily:T.font,minHeight:"100vh",background:T.bg,color:T.text}}>
        <TopBar/>
        <div style={{maxWidth:900,margin:"0 auto",padding:"24px 28px"}}>
          {/* Filters */}
          <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
            {[{l:"10",v:10},{l:"20",v:20},{l:"50",v:50},{l:"Vše",v:999}].map(f=>
              <button key={f.v} onClick={()=>setDashFilter({...dashFilter,period:f.v})} style={{padding:"5px 12px",fontSize:11,fontFamily:T.font,fontWeight:500,background:dashFilter.period===f.v?T.accentBg:"transparent",color:dashFilter.period===f.v?T.accent:T.dim,border:`1px solid ${dashFilter.period===f.v?T.accent+"25":T.border}`,borderRadius:6,cursor:"pointer"}}>{f.l}</button>
            )}
            <div style={{width:1,background:T.border,margin:"0 4px"}}/>
            {[{l:"Vše",v:"all"},{l:"Osobní",v:"personal"},{l:"Telefon",v:"phone-in"},{l:"Párová",v:"pair"}].map(f=>
              <button key={f.v} onClick={()=>setDashFilter({...dashFilter,type:f.v})} style={{padding:"5px 12px",fontSize:11,fontFamily:T.font,fontWeight:500,background:dashFilter.type===f.v?T.accentBg:"transparent",color:dashFilter.type===f.v?T.accent:T.dim,border:`1px solid ${dashFilter.type===f.v?T.accent+"25":T.border}`,borderRadius:6,cursor:"pointer"}}>{f.l}</button>
            )}
          </div>

          {filtered.length<3?<div style={{textAlign:"center",padding:"60px 0"}}><div style={{fontSize:32,marginBottom:12,opacity:0.3}}>📊</div><div style={{fontSize:14,color:T.dim}}>Potřebujete alespoň 3 tréninky.</div><div style={{fontSize:12,color:T.dim,marginTop:8}}>Aktuálně: {filtered.length}</div></div>
          :<>
            {/* Score progress chart (text-based) */}
            {screen==="progress"&&<Section title="Vývoj skóre" color={T.accent}>
              <div style={{display:"flex",alignItems:"flex-end",gap:2,height:100,padding:"0 4px"}}>
                {filtered.slice().reverse().map((h,i)=>{
                  const pct = ((h.score||0)/10)*100;
                  const c = h.score>=8?T.accent:h.score>=5?T.amber:T.rose;
                  return <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                    <span style={{fontSize:8,color:T.dim,fontFamily:T.mono}}>{h.score}</span>
                    <div style={{width:"100%",height:`${pct}%`,background:c,borderRadius:"3px 3px 0 0",minHeight:4,transition:"height 0.3s"}}/>
                  </div>;
                })}
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                <span style={{fontSize:9,color:T.dim}}>Nejstarší</span><span style={{fontSize:9,color:T.dim}}>Nejnovější</span>
              </div>
            </Section>}

            {/* Difficulty distribution */}
            {screen==="progress"&&<Section title="Rozložení obtížností" color={T.amber}>
              {[1,2,3,3.5,4,4.5,5,5.5].map(d=>{
                const cnt=filtered.filter(h=>h.difficulty===d).length;
                if(!cnt)return null;
                const avg=filtered.filter(h=>h.difficulty===d).reduce((a,h)=>a+h.score,0)/cnt;
                const c=avg>=7?T.accent:avg>=5?T.amber:T.rose;
                return <div key={d} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <span style={{fontSize:10,fontFamily:T.mono,color:T.dim,width:40}}>{"★".repeat(Math.floor(d))}{d%1?"+":""}</span>
                  <div style={{flex:1,height:6,background:"rgba(0,0,0,0.05)",borderRadius:3}}>
                    <div style={{height:"100%",width:`${(cnt/filtered.length)*100}%`,background:c,borderRadius:3}}/>
                  </div>
                  <span style={{fontSize:10,fontFamily:T.mono,color:T.dim,width:20}}>{cnt}×</span>
                  <span style={{fontSize:10,fontFamily:T.mono,color:c,width:28,fontWeight:600}}>{avg.toFixed(1)}</span>
                </div>;
              })}
            </Section>}

            {/* Radar chart */}
            {screen==="skills"&&<div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:24,marginBottom:16,textAlign:"center"}}>
              <svg viewBox="0 0 300 260" style={{width:"100%",maxWidth:380,display:"inline-block"}}>
                {[1,0.75,0.5,0.25].map((s,i)=>{const cx=150,cy=130,r=100*s;const pts=Array.from({length:6},(_,j)=>{const a=(Math.PI/3)*j-Math.PI/2;return`${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`;}).join(" ");return<polygon key={i} points={pts} fill="none" stroke="rgba(0,0,0,0.05)"/>;})}
                {(()=>{if(!skAvgs.some(v=>v>0))return null;const pts=skAvgs.map((s,j)=>{const a=(Math.PI/3)*j-Math.PI/2;const r=(s/5)*100;return`${150+r*Math.cos(a)},${130+r*Math.sin(a)}`;}).join(" ");return<><polygon points={pts} fill="rgba(110,180,150,0.1)" stroke={T.accent} strokeWidth={1.5}/>{skAvgs.map((s,j)=>{const a=(Math.PI/3)*j-Math.PI/2;const r=(s/5)*100;return<circle key={j} cx={150+r*Math.cos(a)} cy={130+r*Math.sin(a)} r={3} fill={T.accent} stroke={T.bg} strokeWidth={2}/>;})}</>;})()}
                {[{l:"Cross-sell",x:150,y:12},{l:"Námitky",x:268,y:70},{l:"Rapport",x:268,y:198},{l:"Naslouchání",x:150,y:252},{l:"Compliance",x:30,y:198},{l:"Adaptace",x:30,y:70}].map((l,i)=><text key={i} x={l.x} y={l.y} textAnchor="middle" fill={T.dim} fontSize={10} fontFamily={T.font}>{l.l}</text>)}
              </svg>
            </div>}

            {/* Skill bars with trends */}
            {screen==="skills"&&<div style={{maxWidth:500,margin:"0 auto"}}>
              {sk.map((k,i)=>{
                const avg=skAvgs[i];
                const older=history.filter(h=>h.skills?.[k]?.score).slice(5,15);
                const olderAvg=older.length?older.reduce((a,h)=>a+(h.skills[k].score||0),0)/older.length:0;
                const trend=olderAvg>0?(avg-olderAvg).toFixed(1):0;
                const c=avg>=4?T.accent:avg>=3?T.amber:T.rose;
                const lessons=getLessonForSkill(k);
                return <div key={k} style={{marginBottom:12}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
                    <span style={{color:T.dimLight,fontWeight:500}}>{skL[i]}</span>
                    <span><span style={{color:c,fontFamily:T.mono,fontWeight:600}}>{avg?avg.toFixed(1):"—"}/5</span>
                    {trend!==0&&<span style={{color:parseFloat(trend)>0?T.accent:T.rose,fontSize:10,marginLeft:8,fontFamily:T.mono}}>{parseFloat(trend)>0?`↗+${trend}`:`↘${trend}`}</span>}</span>
                  </div>
                  <div style={{height:3,background:"rgba(0,0,0,0.05)",borderRadius:2}}><div style={{height:"100%",width:`${(avg/5)*100}%`,background:c,borderRadius:2}}/></div>
                  {lessons.length>0&&avg<3.5&&<button onClick={()=>setShowLesson(lessons[0])} style={{fontSize:9,color:T.accent,background:"none",border:"none",cursor:"pointer",fontFamily:T.font,marginTop:2,padding:0}}>📚 {lessons[0].title}</button>}
                </div>;
              })}
            </div>}

            {/* Weakness alert */}
            {weakest.k&&weakest.v<3.5&&<div style={{padding:"14px 16px",background:T.roseBg,border:`1px solid rgba(196,122,122,0.12)`,borderRadius:8,marginTop:12}}>
              <div style={{fontSize:10,fontWeight:600,color:T.rose,textTransform:"uppercase",letterSpacing:1.5,marginBottom:4}}>Doporučení</div>
              <div style={{fontSize:12,color:T.textSoft}}>Nejslabší: <strong style={{color:T.rose}}>{skL[weakest.i]}</strong> ({weakest.v.toFixed(1)}/5)</div>
              {getLessonForSkill(weakest.k).length>0&&<button onClick={()=>setShowLesson(getLessonForSkill(weakest.k)[0])} style={{marginTop:6,padding:"6px 14px",fontSize:11,fontFamily:T.font,fontWeight:600,background:T.roseBg,color:T.rose,border:`1px solid rgba(196,122,122,0.18)`,borderRadius:6,cursor:"pointer"}}>📚 Zobrazit lekci →</button>}
            </div>}

            {/* PDF Export (manager) */}
            {pinUnlocked&&<button onClick={exportPDF} style={{marginTop:12,width:"100%",padding:"12px",fontFamily:T.font,fontSize:12,fontWeight:600,background:T.surface,color:T.amber,border:`1px solid ${T.border}`,borderRadius:8,cursor:"pointer"}}>📄 Exportovat report (HTML)</button>}
            {!pinUnlocked&&<div style={{marginTop:12,display:"flex",gap:6,alignItems:"center"}}>
              <input type="password" value={pinInput} onChange={e=>setPinInput(e.target.value)} placeholder="Manager PIN" maxLength={4}
                style={{padding:"8px 12px",fontSize:12,fontFamily:T.font,background:"rgba(0,0,0,0.03)",color:T.text,border:`1px solid ${T.border}`,borderRadius:6,width:120,outline:"none",textAlign:"center",letterSpacing:4}}
                onKeyDown={e=>{if(e.key==="Enter"&&pinInput===PIN)setPinUnlocked(true);}}/>
              <button onClick={()=>{if(pinInput===PIN)setPinUnlocked(true);else setPinInput("");}} style={{padding:"8px 14px",fontFamily:T.font,fontSize:11,fontWeight:600,background:T.surface,color:T.dim,border:`1px solid ${T.border}`,borderRadius:6,cursor:"pointer"}}>Export report</button>
            </div>}
          </>}
        </div>
        {/* Lesson modal */}
        {showLesson&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",padding:20,zIndex:100}} onClick={()=>setShowLesson(null)}>
          <div onClick={e=>e.stopPropagation()} style={{maxWidth:520,width:"100%",maxHeight:"80vh",overflowY:"auto",background:T.elevated,borderRadius:12,border:`1px solid ${T.border}`,padding:24}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:10,fontWeight:600,color:T.accent,textTransform:"uppercase",letterSpacing:1.5}}>{showLesson.cat}</div>
              <button onClick={()=>setShowLesson(null)} style={{background:"none",border:"none",color:T.dim,cursor:"pointer",fontSize:16}}>✕</button>
            </div>
            <h3 style={{fontSize:16,fontWeight:700,margin:"0 0 12px"}}>{showLesson.title}</h3>
            <div style={{fontSize:13,color:T.textSoft,lineHeight:1.8,whiteSpace:"pre-line"}}>{showLesson.body}</div>
          </div>
        </div>}
      </div>
    );
  }

  return null;
}
