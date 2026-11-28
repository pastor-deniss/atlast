// English lives in index.html itself; this file holds the Kiswahili text and
// the switch. The English is read from the page on load, so it is never
// written twice.
const SW = {
  'nav.platform': 'Mfumo',
  'nav.trust': 'Uaminifu',
  'nav.regulation': 'Udhibiti',
  'nav.roadmap': 'Mwelekeo',
  'nav.invest': 'Wawekezaji',
  'nav.contact': 'Mawasiliano',

  'hero.eyebrow': 'Imezaliwa Tanzania · Imejengwa kwa fedha za jamii',
  'hero.title': 'Mfumo wa kidijitali wa kuendesha vikundi vya akiba vya jamii.',
  'hero.lead': 'Jamii tayari zinaweka akiba, zinakopeshana, zinafanya maamuzi na kukua pamoja. AtLast Community Finance inawapa miundombinu ya kidijitali inayoaminika ili wafanye hivyo kwa uwazi: mahali pamoja kwa uanachama, michango, mikopo, maamuzi, ripoti na ukaguzi.',
  'hero.cta1': 'Shirikiana nasi',
  'hero.cta2': 'Tunavyojenga uaminifu',
  'hero.tagline': 'Jenga Pamoja. Weka Akiba Pamoja. Kua Pamoja.',

  'ph.savings': 'Akiba yangu',
  'ph.shares': 'hisa',
  'ph.fund': 'mfuko wa kikundi',
  'ph.alert': 'Kura 1 inakusubiri',
  'ph.t1': 'Changia',
  'ph.t2': 'Mikopo',
  'ph.t3': 'Kura',
  'ph.t4': 'Ripoti',
  'ph.top': 'Wachangiaji bora',
  'ph.caption': 'Mfano wa app ya AtLast. Majina na takwimu ni mifano.',
  'chip.momo': 'Pesa za simu',
  'chip.bank': 'Akaunti za benki',
  'chip.sms': 'Kuingia kwa SMS',
  'chip.pdf': 'Ripoti za PDF',

  'strip.1t': 'Majaribio yanaendelea',
  'strip.1d': 'Na kikundi halisi cha akiba nchini Tanzania',
  'strip.2t': 'Kiingereza na Kiswahili',
  'strip.2d': 'Kila skrini kwa lugha zote mbili',
  'strip.3t': 'Simu, kompyuta na tablet',
  'strip.3d': 'App moja, inasakinishwa kupitia kivinjari',
  'strip.4t': 'Ukaguzi tangu mwanzo',
  'strip.4d': 'Kumbukumbu hazibadilishwi wala kufutwa',

  'problem.kicker': 'Changamoto',
  'problem.title': 'Taasisi imara, kumbukumbu dhaifu.',
  'problem.p1': 'Vikundi vya akiba (VICOBA, chama, na vikundi vya aina ya SACCOS) ni taasisi ndogo za fedha. Wanachama wanachangia, wanakopa, wanapiga kura na kugawana faida. Lakini kumbukumbu zao zimetawanyika kwenye madaftari, spreadsheet, jumbe za pesa za simu, magrupu ya chat na kumbukumbu za viongozi wachache.',
  'problem.p2': 'Matokeo yake ni migogoro kuhusu salio, ripoti zinazochelewa, ufuatiliaji dhaifu na maamuzi ya mikopo yasiyoelezeka kwa urahisi. Viongozi hutumia muda mwingi kutunza vitabu kuliko kuhudumia kikundi.',
  'problem.p3': 'Tatizo si kukosa nia ya kuweka akiba au kushirikiana. Ni kukosa miundombinu inayoaminika iliyojengwa kulingana na jinsi fedha za jamii zinavyoendeshwa kweli.',

  'platform.kicker': 'Mfumo',
  'platform.title': 'Kila kitu kikundi cha akiba kinachohitaji, katika mfumo mmoja.',
  'platform.lead': 'AtLast inafanya kazi kama leja ya kikundi, kitabu cha mwanachama, dawati la mikopo, chumba cha kura, kituo cha ripoti na chombo cha usuluhishi wa hesabu. Wanachama wanaitumia kwenye simu zao; viongozi wanapata vidhibiti wanavyohitaji.',
  'm.members.t': 'Uanachama',
  'm.members.d': 'Wanachama wapya wanaomba na wanakubaliwa tu kwa kura ya siri ya kikundi, kamwe si kwa uamuzi wa kiongozi mmoja peke yake.',
  'm.contrib.t': 'Michango na hisa',
  'm.contrib.d': 'Wanachama wanarekodi kila malipo pamoja na namba ya muamala ya M-Pesa, Airtel Money, Tigo Pesa au taslimu. Hisa zinapatikana moja kwa moja kutokana na michango.',
  'm.loans.t': 'Mikopo',
  'm.loans.d': 'Kiwango cha kustahili mkopo kinakokotolewa na mfumo. Kila ombi linakaguliwa na wanachama watatu waliochaguliwa kwa bahati nasibu wenye rekodi safi ya kurejesha. Riba na adhabu za kuchelewa zinafuata viwango ambavyo kikundi kimeweka na kufunga.',
  'm.jamii.t': 'Mfuko wa Jamii',
  'm.jamii.d': 'Mfuko maalum kwa wanachama wanaougua, unaotunzwa mbali na akiba. Malipo yanahitaji idhini ya wanachama watatu wenye msimamo mzuri.',
  'm.gov.t': 'Uongozi na maamuzi',
  'm.gov.d': 'Hoja, kura za siri na kumbukumbu ya kudumu ya maamuzi yaliyopita, ili kumbukumbu za kikundi zisitegemee mtu mmoja.',
  'm.reports.t': 'Ripoti na taarifa za akaunti',
  'm.reports.d': 'Kipimo cha afya ya kikundi, mwenendo, dashibodi ya fedha, na taarifa za PDF kwa kila mwanachama na kwa kikundi.',
  'm.recon.t': 'Usuluhishi wa hesabu',
  'm.recon.d': 'Viongozi wanalinganisha fedha zilizopo kweli na kiasi ambacho leja inaonyesha kinapaswa kuwepo, na kuchunguza tofauti yoyote kwa kumbukumbu.',
  'm.shareout.t': 'Mgao wa mwisho wa mwaka',
  'm.shareout.d': 'Faida kutokana na riba na adhabu, baada ya kutoa matumizi ya kikundi, inagawanywa kwa hisa. Mweka Hazina anaiandaa; Msimamizi wa Kikundi anaidhinisha.',
  'm.notif.t': 'Matangazo na malalamiko',
  'm.notif.d': 'Matangazo, arifa ndani ya app, na njia ya faragha kwa wanachama kuwasilisha malalamiko kwa viongozi wao.',

  'trust.kicker': 'Muundo wa uaminifu',
  'trust.title': 'Uaminifu si kitu cha kuongezwa baadaye. Ndio msingi.',
  't1.t': 'Leja isiyobadilishwa',
  't1.d': 'Salio halihifadhiwi kama namba ambayo mtu anaweza kuibadilisha. Kila mara linakokotolewa kutoka historia kamili ya miamala. Makosa yanarekebishwa kwa muamala wa kugeuza unaoonekana, kamwe si kwa kuhariri au kufuta.',
  't2.t': 'Namba kwa kila muamala',
  't2.d': 'Kila muamala unapata namba ya kudumu (kwa mfano ATL-2611-7K3M9Q), inayoonekana kwenye risiti, taarifa za akaunti na leja, pamoja na namba ya muamala ya mtoa huduma wa pesa za simu.',
  't3.t': 'Watu wawili kwenye fedha',
  't3.d': 'Msimamizi wa Kikundi na Mweka Hazina lazima wawe watu tofauti. Mweka Hazina analipa na kuandaa; Msimamizi anaidhinisha. Hakuna anayeweza kukamilisha hatua nyeti peke yake.',
  't4.t': 'Jopo la Macho Matatu',
  't4.d': 'Mikopo inaidhinishwa na wanachama watatu waliochaguliwa kwa bahati nasibu wenye rekodi iliyothibitishwa ya kurejesha, bila yeyote mwenye mgongano wa maslahi. Wakaguzi hawajulikani kwa mkopaji.',
  't5.t': 'Kanuni za kikundi zilizofungwa',
  't5.d': 'Kiasi cha mchango, thamani ya hisa, riba, adhabu na kiasi cha Jamii vimefungwa. Kuvibadilisha kunahitaji kura ya wanachama na idhini huru. Kinga ya kanzidata inazuia njia nyingine yoyote.',
  't6.t': 'Siri kwa watu, uwajibikaji kwa mfumo',
  't6.d': 'Kura ni za siri, hata viongozi wanaona jumla tu, lakini kila kura inarekodiwa mara moja kwa kila mwanachama kwa ajili ya ukaguzi. Hatua za hiari na za kurekebisha zinaandikwa kwenye kumbukumbu za ukaguzi: nani, lini na kwa nini.',
  'trust.note': 'Usalama wa ndani: kuingia kwa namba ya simu na nambari ya siri ya mara moja, PIN binafsi kwenye kila kifaa, ruhusa kwa majukumu zinazotekelezwa ndani ya kanzidata yenyewe, na kila hatua inayohusu fedha inashughulikiwa kwenye seva, kamwe haiachiwi simu.',

  'reg.kicker': 'Kwa mamlaka za udhibiti',
  'reg.title': 'Mstari wazi kati ya kurekodi fedha na kuzishikilia.',
  'reg.p1': 'Kwa sasa AtLast ni programu ya kutunza kumbukumbu na kusimamia maamuzi ya vikundi vya akiba. AtLast haishikilii fedha za wanachama, haikopeshi fedha zake yenyewe na haihamishi fedha. Vikundi vinatunza fedha zao kama vinavyofanya sasa, kwenye pesa za simu, akaunti ya benki au taslimu, na vinatumia AtLast kurekodi kila malipo na uamuzi kwa uwazi.',
  'reg.l1': 'Tunatenganisha kikamilifu kurekodi muamala, kuanzisha malipo, kushikilia fedha, kukopesha na kutoa huduma za fedha zinazodhibitiwa.',
  'reg.l2': 'Huduma zozote za malipo au za kifedha za baadaye zitatolewa kupitia washirika wenye leseni, au chini ya leseni tutakazopata, kwa mujibu wa sheria za kila nchi tunayohudumia.',
  'reg.l3': 'Tutatafuta mapitio ya kisheria na ya udhibiti kwa kila nchi, ikiwemo ulinzi wa taarifa binafsi, kabla huduma hizo hazijaanza.',
  'reg.l4': 'Wanachama wa kikundi wanaweza kuona kila muamala na kila mkopo wa kikundi chao. Uwazi ni kanuni ya bidhaa, si jambo la kipekee.',
  'reg.p2': 'Tunakaribisha mazungumzo ya mapema na mamlaka za udhibiti, mamlaka za ushirika na taasisi za ulinzi wa taarifa binafsi, na tuko tayari kuonyesha kumbukumbu za ukaguzi kwa kina.',

  'ai.kicker': 'Akili bandia kwa uwajibikaji',
  'ai.title': 'Akili inayoongeza uwezo wa binadamu, kamwe haiondoi uwajibikaji wa binadamu.',
  'ai.p1': 'Baadaye, akili bandia (AI) inaweza kusaidia kueleza ripoti, kufupisha mikutano, kutafsiri taarifa ngumu kwa lugha rahisi na kusaidia usuluhishi wa hesabu. Haitafanya maamuzi ya kifedha au ya uongozi kimya kimya. Hatua zenye uzito zitahitaji mamlaka ya binadamu, vidhibiti vilivyo wazi na kumbukumbu inayofuatilika.',

  'road.kicker': 'Mwelekeo',
  'road.title': 'Kutoka kikundi kimoja hadi mfumo kamili wa fedha za jamii.',
  'road.lead': 'Tunakua kwa ushahidi, si kwa ahadi. Kila hatua inafuata thamani iliyothibitishwa ya hatua iliyotangulia.',
  'road.now': 'Sasa',
  'l1.t': 'Hatua 1 · Fedha za jamii',
  'l1.d': 'Vikundi, wanachama, michango, mikopo, maamuzi na ripoti. Imejengwa na iko kwenye majaribio.',
  'l2.t': 'Hatua 2 · Uendeshaji wenye akili',
  'l2.d': 'Msaada wa AI, usuluhishi wa kina, uchambuzi na mtiririko wa kazi wa kiotomatiki.',
  'l3.t': 'Hatua 3 · Mfumo wa huduma za fedha',
  'l3.d': 'Kuunganisha malipo na huduma za fedha kupitia washirika wenye leseni.',
  'l4.t': 'Hatua 4 · Miundombinu ya taasisi',
  'l4.d': 'Usimamizi wa vikundi vingi kwa vyama vya ushirika, NGO na waajiri; API na vidhibiti vya juu.',
  'l5.t': 'Hatua 5 · Fedha za jamii duniani',
  'l5.d': 'Matoleo ya ndani ya kila nchi, ushiriki wa diaspora na ushirikiano wa kuvuka mipaka.',

  'inv.kicker': 'Wawekezaji na washirika',
  'inv.title': 'Thamani kwanza, mapato baadaye. Uaminifu kabla ya ukuaji.',
  'inv.c1t': 'Kuingia sokoni',
  'inv.c1d': 'Tanzania kwanza, kisha Afrika Mashariki. Lengo letu la kwanza si ukubwa wa kijiografia bali ushahidi kwamba vikundi halisi vinaweza kuendesha mzunguko wao wote wa fedha kupitia AtLast.',
  'inv.c2t': 'Mfumo wa kiuchumi',
  'inv.c2d': 'Thamani ya programu inayojirudia kwa uwazi: ada za vikundi, huduma za ziada na za taasisi, huduma za utekelezaji na API. Hakuna gharama zilizofichwa na hakuna kunyonya jamii zilizo hatarini.',
  'inv.c3t': 'Mkakati wa mtaji',
  'inv.c3d': 'Mtaji unagharamia hatua muhimu, si majivuno. Tunapendelea mtaji unaoendana na dhamira yetu, na kila awamu inalenga matokeo yanayopimika kama kuwabakiza watumiaji, mapato yanayojirudia au utayari wa usalama.',
  'inv.partnersT': 'Tunataka kufanya kazi na nani',
  'inv.p1': 'Vyama vya ushirika na SACCOS',
  'inv.p2': 'NGO na programu za maendeleo',
  'inv.p3': 'Kampuni za pesa za simu',
  'inv.p4': 'Benki na taasisi za fedha ndogo',
  'inv.p5': 'Mitandao ya kidini na ya kijamii',
  'inv.p6': 'Waajiri',
  'inv.p7': 'Wawekezaji wa matokeo chanya',
  'inv.impactT': 'Tutakavyopima matokeo',
  'inv.impactD': 'Vikundi vinavyokamilisha mizunguko kamili ya fedha, wanachama wanaohudumiwa, akiba iliyokusanywa, mikopo iliyowezeshwa, utendaji wa urejeshaji, muda uliookolewa kwenye ripoti, makosa ya hesabu yaliyopungua na ushiriki katika maamuzi. Tutaripoti ushahidi, si kudhani kwamba kwenda kidijitali kunaleta ustawi moja kwa moja.',

  'nav.founder': 'Mwanzilishi',
  'fd.kicker': 'Mwanzilishi',
  'fd.role': 'Mwanzilishi na Mkurugenzi Mtendaji',
  'fd.whyT': 'Kwa nini AtLast',
  'fd.why1': 'Vikundi vya akiba tayari vinafanya kazi. Kote Tanzania, wanachama wanaweka akiba, wanakopeshana, wanapiga kura na kusaidiana bila mtu kuwafundisha. Wanachokosa si uwezo bali miundombinu: kumbukumbu ambazo kila mtu anaweza kuzikagua, maamuzi ambayo kila mtu anaweza kuyaona, na kanuni ambazo hakuna anayeweza kuzibadilisha kimyakimya.',
  'fd.why2': 'AtLast inatoa miundombinu hiyo. Haichukui nafasi ya kikundi; inakiimarisha, ili uaminifu usitegemee tena daftari la mtu mmoja.',
  'fd.bio': 'Deniss ametumia zaidi ya miaka kumi mahali ambapo fedha na uaminifu hukutana: kuwakopesha watu na biashara ndogo katika benki na taasisi za fedha ndogo, na kuongoza jamii kama mchungaji. Vyote viwili vilimfundisha somo moja, na AtLast imejengwa juu yake: kumbukumbu zilizo wazi huwalinda watu, na watu wanaoaminiana hukua pamoja.',
  'fd.bgT': 'Uzoefu',
  'fd.exp1': 'Zaidi ya miaka kumi katika benki na taasisi za fedha ndogo, kwa kiasi kikubwa kwenye mikopo midogo. Alitathmini wakopaji, alipunguza mikopo chechefu, na alipanua huduma za mikopo kwenye mikoa mipya akiongoza timu za mauzo. Pia alifanya kazi mahali ambapo kila matumizi yalihitaji idhini ya viongozi watatu, kanuni ileile ambayo AtLast inaiweka kwenye kila kikundi.',
  'fd.exp2': 'Huduma ya kiroho na kwa jamii ilimfundisha upande mwingine: jinsi ya kuwaleta watu pamoja, kuwafundisha, na kujenga uaminifu unaodumu.',
  'fd.skillsT': 'Anacholeta',
  'fd.s1': 'Mikopo midogo na tathmini ya hatari',
  'fd.s2': 'Uongozi',
  'fd.s3': 'Mafunzo na uwezeshaji',
  'fd.s4': 'Fikra za kimkakati',
  'fd.s5': 'Kukuza taasisi',
  'fd.s6': 'Mauzo na ukuzaji wa biashara',
  'fd.s7': 'Mahusiano na watu',
  'fd.valT': 'Maadili yanayomwongoza',
  'fd.v1': 'Uadilifu',
  'fd.v2': 'Hekima',
  'fd.v3': 'Nidhamu',
  'fd.v4': 'Huduma',
  'fd.service': '<b>Huduma</b>, kwa maneno yake, ni kufanya lolote linalomsaidia mwingine kufikia matamanio yake mema. Hicho ndicho kipimo cha AtLast: je, kila mwanachama na kila kikundi kinakaribia zaidi kile wanachokipigania?',
  'fd.visionT': 'Dira',
  'fd.vision': 'Miundombinu ya kidijitali inayoaminika kwa fedha za pamoja: iliyozaliwa kutoka uchumi wa jamii za Kiafrika, iliyojengwa kuhudumia jamii popote.',
  'fd.missionT': 'Dhamira',
  'fd.mission': 'Kuzisaidia jamii kusimamia fedha, kufanya maamuzi na kujenga ustawi wa pamoja, kwa teknolojia iliyo rahisi, yenye akili na inayowajibika.',
  'fd.quote': '“Anza na kikundi kimoja. Kiwezeshe kifanye kazi vizuri zaidi. Jifunze kutokana na uhalisia, boresha bidhaa, na kua, hadi mfumo uhudumie mamilioni bila kupoteza uaminifu ulioufanya uwe wa thamani.”',

  'pr.kicker': 'Kanuni zetu',
  'pr.1': 'Watu kabla ya teknolojia.',
  'pr.2': 'Uaminifu kabla ya ukuaji.',
  'pr.3': 'Thamani kabla ya mapato.',
  'pr.4': 'Uwazi kabla ya urahisi.',
  'pr.5': 'Uwajibikaji wa binadamu sambamba na akili bandia.',
  'pr.6': 'Uelewa wa ndani na matarajio ya kimataifa.',
  'pr.7': 'Matumizi rahisi juu ya miundombinu imara.',
  'pr.8': 'Kujenga taasisi ya muda mrefu badala ya mvuto wa muda mfupi.',

  'c.kicker': 'Mawasiliano',
  'c.title': 'Tujenge pamoja fedha za jamii zinazoaminika.',
  'c.lead': 'Kwa ushirikiano, mazungumzo ya uwekezaji, mazungumzo na mamlaka za udhibiti, au nakala ya white paper yetu, wasiliana nasi.',
  'c.email': 'Tutumie barua pepe',
  'c.app': 'Tazama app',
  'c.wp': 'White paper: Toleo la Dhana 1.1, Novemba 2026.',

  'f.tag': 'Jenga Pamoja. Weka Akiba Pamoja. Kua Pamoja.',
  'f.legal': 'Tovuti hii inaeleza bidhaa iliyo kwenye majaribio. Si ofa ya huduma za fedha au uwekezaji, wala si ushauri wa kisheria au wa kifedha.',
};

const META = {
  en: { title: document.title, description: document.querySelector('meta[name="description"]').content },
  sw: {
    title: 'AtLast Community Finance — miundombinu ya kidijitali kwa vikundi vya akiba',
    description: 'AtLast Community Finance inajenga miundombinu ya kidijitali inayoaminika kwa vikundi vya akiba vya jamii: uanachama, michango, mikopo, maamuzi, ripoti na ukaguzi katika mfumo mmoja. Imezaliwa Tanzania.',
  },
};

const nodes = document.querySelectorAll('[data-i18n]');
const EN = {};
nodes.forEach((el) => { EN[el.dataset.i18n] = el.innerHTML; });

function setLang(lang) {
  const table = lang === 'sw' ? SW : EN;
  nodes.forEach((el) => {
    const text = table[el.dataset.i18n];
    if (text !== undefined) el.innerHTML = text;
  });
  document.documentElement.lang = lang;
  document.title = META[lang].title;
  document.querySelector('meta[name="description"]').content = META[lang].description;
  document.querySelectorAll('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  try { localStorage.setItem('atlast-site-lang', lang); } catch (e) { /* private mode */ }
}

document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));

let saved = null;
try { saved = localStorage.getItem('atlast-site-lang'); } catch (e) { /* private mode */ }
const initial = saved || ((navigator.language || '').toLowerCase().startsWith('sw') ? 'sw' : 'en');
if (initial === 'sw') setLang('sw');

document.getElementById('year').textContent = new Date().getFullYear();
