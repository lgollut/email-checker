import dns from 'dns';
import { DnsResolverError } from './errors';

export function mxResolver(resolve, reject, error, lookupResult) {
  if (error || (typeof lookupResult === 'undefined')) {
    reject(new DnsResolverError('Error while resolving MX'));
  } else if (lookupResult && lookupResult.length <= 0) {
    reject(new DnsResolverError('No MX Records'));
  } else {
    lookupResult.sort((a, b) => a.priority - b.priority);
    resolve(lookupResult);
  }
}

export default function dnsResolver(email, { dns: dnsOpts, mxServers } = {}) {
  return new Promise((resolve, reject) => {
    if (Array.isArray(mxServers)) {
      mxServers.sort((a, b) => a.priority - b.priority);
      resolve(mxServers);
    }

    if (dnsOpts) {
      try {
        dns.setServers(Array.concat([], dnsOpts));
      } catch (e) {
        reject(new DnsResolverError('Invalid DNS Options'));
      }
    }

    const domain = email.split(/[@]/).splice(-1)[0].toLowerCase();

    dns.resolveMx(domain, mxResolver.bind(this, resolve, reject));
  });
}
