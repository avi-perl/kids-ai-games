// Which applet keeps saved doors (js/saved-doors.js), by the address the door is opened at.
// Published, it's "The Door" on qerl.app (id sitq7e1b1ais, https://the-door.qerl.app/). On a
// local address it's js/applet.local.js (git-ignored), `export default { endpoint, apiKey, secret }`
// for an applet on a local url-short manage server, or none. Secrets are safe to publish; the
// makers' secret (short links) isn't here: it's handed out as make.html#maker=<secret>.
const PUBLISHED = {
  endpoint: 'https://jpd6wjpphvdihjj6t5cwp5ruje.appsync-api.us-east-1.amazonaws.com/graphql',
  apiKey: 'da2-zeszqavfmrcvnac2ppev6cf2ue',
  secret: 'sitq7e1b1ais.Qxg0Gt-v27sCzKFB3Hx_uofCn1BDVF3H',
};

const local = /^(localhost|127\.|\[::1\]|.*\.ts\.net$)/.test(location.hostname);
export default local ? await import('./applet.local.js').then(m => m.default, () => null) : PUBLISHED;
