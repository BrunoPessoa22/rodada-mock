/**
 * On-chain constants for counting — Chiliz Chain (id 88888), FanX/Kayen
 * UniV2-style AMM (one deployment, two names).
 *
 * REGISTRY RECIPE (how this list is made — rerun it, never hand-add):
 * enumerate the factory's allPairs, keep pairs against WCHZ whose WCHZ
 * reserves are >= 100k, read symbol()/name()/decimals() from the token, and
 * keep FOOTBALL clubs + national teams only (esports/rugby/racing tokens are
 * out of scope while match windows mean football fixtures). Last full scan:
 * 2026-08-18, 441 factory pairs, 84 liquid pools, 64 football tokens below —
 * every entry 18 decimals, every pair verified live. Depth ranges from
 * SPAIN (8.1M WCHZ) down to SACI (103k WCHZ); the admin's per-match depth
 * gate decides what gets FEATURED — presence here only makes a token
 * available.
 *
 * CONTEXT: around 2026-05-12 all DEX liquidity migrated from legacy 0-decimal
 * CAP-20 fan tokens to NEW 18-decimal DEX tokens paired with WCHZ on the same
 * factory. Addresses below are the migrated tokens. Beware cross-chain address
 * collisions: the same 0x address can be a DIFFERENT club's token on Base
 * (e.g. 0xdd15…7ec8 is PERSIB on Chiliz and PSG on Base) — never assume
 * same-address ⇒ same token across chains.
 */

export const FACTORY = "0xE2918AA38088878546c1A18F2F9b1BC83297fdD3" as const;
export const WCHZ = "0x677F7e16C7Dd57be1D4C8aD1244883214953DC47" as const;

export const TOKENS: Record<string, { address: `0x${string}`; name: string }> = {
  // Founding nine (live since Jul 2026)
  SPAIN: { address: "0x7a224b67aaa360e48402aab4ff12d89eef9b4cf8", name: "Spain National Team" },
  ARG: { address: "0x4394886b1eec08fe88681462914702dc99d97eb7", name: "Argentina National Team" },
  BAR: { address: "0x1589248b4b61ed472cc21ca1f2114d93ab6910d5", name: "FC Barcelona" },
  PSG: { address: "0xfe1d4a935df7a4a52f835f6104c97af9d72217f2", name: "Paris Saint-Germain" },
  GALO: { address: "0x558cc7ac99793b10c1c142a1c7e5adf6657dea9c", name: "Clube Atlético Mineiro" },
  MENGO: { address: "0xbff8fabb04f6494fe393eb7416a698869569a310", name: "Flamengo" },
  GAL: { address: "0x770da1e5ddb22f3ccc2482493bd9b10a7a8a38ae", name: "Galatasaray S.K." },
  TRA: { address: "0xeff432433dd57adfa37004af00db148f9407e7bd", name: "Trabzonspor" },
  // POR is the Portugal National Team token (verified via name() on-chain
  // 2026-08-18) — NOT FC Porto, whose Socios ticker is PORTO.
  POR: { address: "0x013f2407c6ef765f1199f8818b805121f269f5b8", name: "Portugal National Team" },
  // Added 2026-08-18 (descending pool depth at scan time)
  SAFA: { address: "0xf81aa505df80278fc4cf2b050086f678d48bddce", name: "South Africa" },
  BELG: { address: "0x6c4c9dfe8c940b51b68d00c6d76de756b252f328", name: "Belgium" },
  SFA: { address: "0xfab24366503eb0fa8cb8fb7d1311159fd4283657", name: "Scotland" },
  LEG: { address: "0xfd8a11532c5ca9bec64ec86e4e5ed78089cd443f", name: "Legia Warsaw" },
  AVL: { address: "0x4f3a607bb2717683108865fc785badfa90094431", name: "Aston Villa" },
  ALA: { address: "0x3b60f483fe311fc063b50a67bf327f96b76696e6", name: "Alanyaspor" },
  LEV: { address: "0x084ba7f44cd799decde593a4045170f014c29845", name: "Levante" },
  PERSIJA: { address: "0xdc061856766d4991724307b9b0ea217ff8f3bbee", name: "PERSIJA" },
  DZG: { address: "0x03be2ea82839fbd8b6ab16addeba3fe4c88bb43f", name: "Dinamo Zagreb" },
  MFC: { address: "0x580eda966a8129c3c01d149871b47fefcc599d28", name: "Millonarios" },
  BFC: { address: "0xd77de9fce56f371e347217d57394f1fa07f02d64", name: "Bologna FC" },
  VCF: { address: "0x83d7d1df01c698b4379077af4bceb2d4af113bff", name: "Valencia CF" },
  SAN: { address: "0x3ba1eb0ff58537d8b77e8446273295fc432439a9", name: "Club Santos Laguna" },
  BUFC: { address: "0xafb78165c62744bd21b4ddef48c11a93d395daa2", name: "Bali United" },
  BENFICA: { address: "0xf4c653b74929953b29b966aba99b681fb5ab69cf", name: "SL Benfica" },
  SPFC: { address: "0x6345c0ecca1b9007a9043cb5da8150ae07add498", name: "São Paulo FC" },
  FOR: { address: "0x078b3c0ad7ea92efd14af146bf4171e80ce41e1c", name: "Fortuna Sittard" },
  SAM: { address: "0xf78e9ce916a7d6b3d4facba95b9e9b8bba5df609", name: "Samsunspor" },
  UCH: { address: "0xfe050a08699a2557bcc0a8e6c2805eba55d61065", name: "Universidad de Chile" },
  ASM: { address: "0x57f3d2382025cf5d6c3b126dce0360d9cf3aff49", name: "AS Monaco" },
  AFC: { address: "0x76088f3ed5dc655de9295d93868ec1eec654a615", name: "Arsenal FC" },
  YBO: { address: "0x8c4d631a673be24f244e4f0645be6928d0083d4e", name: "BSC Young Boys" },
  IBFK: { address: "0x7b69003c404b0579f257c16e2664b4eb4c7b2acf", name: "İstanbul Başakşehir FK" },
  RACING: { address: "0x02300475d1edd5b2e88efdebd3ffb549110d8aa6", name: "Racing Club" },
  GFK: { address: "0x72b30f41d5163a5082f9461f0b8346789639e063", name: "Gaziantep FK" },
  ATLAS: { address: "0xc1a2b6950786383114828fcf816199b6d5f4960a", name: "Atlas FC" },
  CPFC: { address: "0x58613484d9683d52899e13d42bb3fb9eeb0749da", name: "Crystal Palace" },
  INTER: { address: "0x1b3385a26214057bb7e27c173ee2d14201752e73", name: "Inter Milan" },
  LUFC: { address: "0xe3ecd48f7653e6da693b544d50cab0bcdcd35c13", name: "Leeds United FC" },
  ASR: { address: "0x0ac7bf9783ca1dcd86a39b5a2607160d29256eb0", name: "AS Roma" },
  CITY: { address: "0x7bd6242d775faef1d50b2aa18c2fbf329bddf295", name: "Manchester City FC" },
  ATM: { address: "0x7da0eb973d982ffca095e80437f5e37459a95c67", name: "Atlético de Madrid" },
  HASHTAG: { address: "0x3c1487c5036105338396055d74eee505a9f6a2f3", name: "Hashtag United F.C." },
  SCCP: { address: "0x25fb4ff916fafb88d78918c54c1d14b57586046b", name: "Corinthians" },
  NAP: { address: "0x90593e9602b38a0d5b63d9f34ac3560798cee7d4", name: "Napoli" },
  RSO: { address: "0x53838837f258f8ef337c8b4ceb60a89190ecba8b", name: "Real Sociedad" },
  JUV: { address: "0xeaf368dadc22524def47e8a1c26bfc17ac16e6f5", name: "Juventus" },
  BAHIA: { address: "0xc75037b67ade9364f451d49bfae776619a292181", name: "EC Bahia" },
  EFC: { address: "0xa84e55c2464563441cb4114372df8d5aca49fc83", name: "Everton FC" },
  CAI: { address: "0x99f7b1f8d445b6cbd231017820de372e2c5f9a27", name: "CA Independiente" },
  PERSIB: { address: "0xdd15623d107c639af0c5127affa26d3f20327ec8", name: "PERSIB" },
  ACM: { address: "0x062f6004fd0bf204d272ff115e5b84f7a01489d1", name: "AC Milan" },
  VERDAO: { address: "0xb46357d8ed050d35d3a24154c39d7236dae86187", name: "Palmeiras" },
  APL: { address: "0x0b00e360bee5557d0d9a548030aa8f7182daf56f", name: "Apollon Limassol FC" },
  JDT: { address: "0x9af2bd7003f043124aa13a21a2460996f7ba9a3b", name: "Johor Darul Ta'zim FC" },
  SPURS: { address: "0xd699acd21011c20381e5138a430bb0d7b6e9bc7f", name: "Tottenham Hotspur" },
  SEVILLA: { address: "0xa584cca6a5c46ead6ff8ef3beb8fac76364c36cb", name: "Sevilla FC" },
  STV: { address: "0x71bc882c60b9efdf85d0e1a28fc86f0bd822132f", name: "Sint-Truiden" },
  UDI: { address: "0x94772c3381a83308376d65e100d06c2bc5a86ed9", name: "Udinese" },
  VASCO: { address: "0xd5f1b2454db115967bfac73bfea21da5e2543c8e", name: "Vasco da Gama" },
  CHVS: { address: "0x3624ba092480fb0bdb5ec50ebac699bdfa561416", name: "Chivas" },
  TIGRES: { address: "0x7308f4c7b4a9a0e180fd08c003255762dd139d54", name: "Tigres" },
  FLU: { address: "0x9840dc03032f4f35d7dbdc8db832acfaf6ff3e77", name: "Fluminense FC" },
  GOZ: { address: "0x6ba1fb0dadaeb34ea24eb31d416805abe8921448", name: "Göztepe S.K." },
  SACI: { address: "0x4c360be766dd95c973be30c4130e7b4b762113e0", name: "SC Internacional" },
};

/**
 * WCHZ pools verified on-chain (reserves >= 100k WCHZ each at the 2026-08-18
 * scan). Pinning them skips factory.getPair at runtime and guards against
 * ever counting a drained legacy pool by mistake.
 */
export const PAIR_OVERRIDES: Record<string, `0x${string}`> = {
  SPAIN: "0x8572e4364de72134ab1d65260a50052595093075",
  ARG: "0x4e933d29f126f773c5888bc2efd217b840e67288",
  BAR: "0x142a7c3019314f607889611f4ff1bf52f2706ba1",
  PSG: "0x4c2fae616d27aa5d260b32cf23696bcbabda028e",
  GALO: "0x0617fec42702a5a25522dcd7dab4b31e5558f051",
  MENGO: "0x12f489d2ccb96f0f029bdd7a6ff852a4e112a5c5",
  GAL: "0x23cf1094f6404861fe67cea6d381db052f40cab6",
  TRA: "0xebbc1494a40330f1c753eaad17c6d7d7c8ecc692",
  POR: "0x37f334ee472332a52c527412d760abf63bdda3d9",
  SAFA: "0x6c8bcc11339b27fe7eecebb7972b9ea0b068a3d8",
  BELG: "0x855ae5adcd0b60fab5545655032600ee004a7047",
  SFA: "0x3d7cb532ae8b770763eef0b411f2d04d1fa88265",
  LEG: "0x647c97dc8a0b2daa6aec45937168b71049d16091",
  AVL: "0x583c9ec53f8cfb5d8751b72a96f46a9e7b9b0989",
  ALA: "0x469f1ef1cf0ca846ac14ab9861028238ccc72f9b",
  LEV: "0xbf47d38cef1b2cc5b1f797580aca14883fa3ea8e",
  PERSIJA: "0xed6725a4b9d126aee4f3e12b2903a61a77cee983",
  DZG: "0x41e62ca643a58b9a983d0f67d3615b81e12a7ea9",
  MFC: "0x42eefc0692814988820acb9ae769e5455c56d036",
  BFC: "0x4b536b85c670fd1275395b218701612475f9bbbd",
  VCF: "0xc20e58f27cf37989d41c77b0f094d1490f6471c8",
  SAN: "0x6918e0f4d946f8f30575280d514c0d9be1a01cbb",
  BUFC: "0xf1d71896bf953910f02e056ab752ca4845942870",
  BENFICA: "0xe5867f166dd15fdcdcb31328dafde9efee2b1613",
  SPFC: "0x43cb146bff6d0a9db9f02396675948b9cb15b4de",
  FOR: "0xfc3b6257103891259f1c4ecdd3b54d4be7d60e01",
  SAM: "0xada1d1659d19acb25e809609631ec6c92746e135",
  UCH: "0xf94e2f66534e34c6230dc59e79efcbf2c66ed185",
  ASM: "0x20f857f6e9de278240d48b1a5e5d2280bb250f44",
  AFC: "0xfe8a73586e1628f8052e391706888f4b1411d4d4",
  YBO: "0x1803d745f4b5341c9f687d95673ea7356a048810",
  IBFK: "0x80af31c1cf48ea2578a94231aa3cbe89aa890a2f",
  RACING: "0xb13eb8b109fed772bbf8b2eb2855e201bf7c073b",
  GFK: "0x42465c24be8e64dad795823043e4bf6927a67fa3",
  ATLAS: "0xecd93dc90c198384d47922dbd71cb0b79c8c8f67",
  CPFC: "0x688af7016a21f7c7bafc540908203a0d467c9b4c",
  INTER: "0x6d97418f9a7d105fec8fd250d0d6ef580874a497",
  LUFC: "0x08440aaa6ad12c0570eb86428e1d8f4142b0e79d",
  ASR: "0x703cacf8cf879bc1644bedb6d46bc5d58044493f",
  CITY: "0xd5691b7f516917590ca1fea84e80ff423a6eb114",
  ATM: "0x5a24a26527d3ff099733690b76938cdc34c326ca",
  HASHTAG: "0x7bfd5cb94cbda5feb6c67c87d0b5144b0651bd18",
  SCCP: "0xc52b71d9dcf14295bc0ae8611e85a50f62e82e63",
  NAP: "0x5b0536de5cb700bd7a3f966c1eb976133a7401c9",
  RSO: "0xce0dd5926cb3a77f6b759a48a34c51577a658e54",
  JUV: "0x218a86db425642870b1ba589afc95ef77e2dc4b9",
  BAHIA: "0x77cd2d4682e2d134c48c16909532e20acc01c31d",
  EFC: "0xd842a88137367917307d002d73c154dbeeecb939",
  CAI: "0x998e43db9d48dc5b92d04ff26f2417b97d92d464",
  PERSIB: "0xbdac9658cb3ee6458ccd4d6680876dafae37b498",
  ACM: "0x61358d5c1a8e6148cd830a9c68d0695939b3ca3c",
  VERDAO: "0xa31086e9ad9b34907730842f953dae0590c9069c",
  APL: "0x62037e9af5d46cfb253417e58ccd67b7a7e2ec71",
  JDT: "0x0947acc4bcbce9c77ef530ac6da0db232aa616e4",
  SPURS: "0xb07635a20c685814e7c0e9071994c24df7d0bdfa",
  SEVILLA: "0x9412734ded9e8e8c32aac4b0cf616d512548fba0",
  STV: "0x741d72b1d72ec8660cbaf3c662baacdd2695a0bb",
  UDI: "0xd621bcf0134c659b70514597e6e6dc800db3a863",
  VASCO: "0x07c5a93029fe8b21a393e98bb3245bb156cf918c",
  CHVS: "0x772869c7b0d893ca3c76679951bfbdd7d60a39ab",
  TIGRES: "0x35cc88b0f5b86ce0f8742a73ff5dacb2fe0ffdd4",
  FLU: "0x2b00d6cf0dd3a25789ff5dcf5d4c8aa465be335e",
  GOZ: "0xfa398c13bba08b3807f91607c219601c42948581",
  SACI: "0x81b5aa633da4cc6d347eccde4b2ce45635334693",
};

/**
 * eth_getLogs chunk size. rpc.chiliz.com handles 30k-block address-filtered
 * queries; 10k keeps responses comfortably small (~3.3k blocks/hour on 3s
 * blocks). Ankr fallback would need <=1000.
 */
const rawChunk = Number(process.env.LOG_CHUNK_BLOCKS ?? 10_000);
export const LOG_CHUNK_BLOCKS =
  Number.isFinite(rawChunk) && rawChunk >= 100 && rawChunk <= 30_000 ? Math.floor(rawChunk) : 10_000;
