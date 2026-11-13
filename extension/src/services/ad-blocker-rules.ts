/**
 * Z-Pilot Ad Blocker Rules (Declarative Net Request)
 * Comprehensive network-level rules to block advertisements, popups, and intrusive trackers.
 * Rules operate at native Chrome network level with zero CPU overhead.
 */

export const AD_DOMAINS_BLOCKLIST = [
  // Google / DoubleClick ad servers
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'pagead2.googlesyndication.com',
  'adservice.google.com',
  'google-analytics.com/analytics.js',
  'google-analytics.com/g/collect',

  // Major global ad exchanges & SSPs
  'adnxs.com',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'criteo.com',
  'criteo.net',
  'smartadserver.com',
  'casalemedia.com',
  'bidswitch.net',
  'sovrn.com',
  'yieldmo.com',
  '33across.com',

  // Native & Content-recommendation ads (Taboola, Outbrain, MGID, etc.)
  'taboola.com',
  'outbrain.com',
  'mgid.com',
  'revcontent.com',
  'zergnet.com',

  // Popups, Pop-unders & High-intrusion networks
  'popads.net',
  'popcash.net',
  'adsterra.com',
  'propellerads.com',
  'exoclick.com',
  'trafficjunky.com',
  'clicksor.com',
  'adblade.com',
  'zedo.com',
  'infolinks.com',
  'chitika.net',

  // Publisher & Blog ad networks
  'mediavine.com',
  'adthrive.com',
  'buysellads.com',
  'carbonads.net',
  'amazon-adsystem.com',
  'advertising.com',
  'adroll.com',
  'scorecardresearch.com',
  'quantserve.com',

  // Video & Mobile ad SDK networks
  'spotxchange.com',
  'teads.tv',
  'vungle.com',
  'unityads.unity3d.com',
  'inmobi.com',
  'chartboost.com',
  'ironsrc.com',
];

// Starting rule ID offset for Ad Blocker (1000 - 1999 reserved for Ad Blocker)
export const AD_BLOCKER_RULE_ID_START = 1000;

/**
 * Builds Chrome Declarative Net Request rules for dynamic installation
 */
export function buildAdBlockerDnrRules(): chrome.declarativeNetRequest.Rule[] {
  const resourceTypes: chrome.declarativeNetRequest.ResourceType[] = [
    'main_frame' as chrome.declarativeNetRequest.ResourceType,
    'sub_frame' as chrome.declarativeNetRequest.ResourceType,
    'script' as chrome.declarativeNetRequest.ResourceType,
    'image' as chrome.declarativeNetRequest.ResourceType,
    'xmlhttprequest' as chrome.declarativeNetRequest.ResourceType,
    'ping' as chrome.declarativeNetRequest.ResourceType,
    'media' as chrome.declarativeNetRequest.ResourceType,
    'other' as chrome.declarativeNetRequest.ResourceType,
  ];

  return AD_DOMAINS_BLOCKLIST.map((domain, index) => ({
    id: AD_BLOCKER_RULE_ID_START + index,
    priority: 1,
    action: {
      type: 'block' as chrome.declarativeNetRequest.RuleActionType,
    },
    condition: {
      urlFilter: `||${domain}^`,
      resourceTypes,
    },
  }));
}

