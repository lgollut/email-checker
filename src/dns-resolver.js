import dns from 'dns';
import { DnsResolverError } from './errors';

export function mxResolver(resolve, reject, error, mxResults) {
  if (error || (typeof mxResults === 'undefined')) {
    reject(new DnsResolverError('Error while resolving MX'));
  } else if (mxResults && mxResults.length <= 0) {
    reject(new DnsResolverError('No MX Records'));
  } else {
    mxResults.sort((a, b) => a.priority - b.priority);
    resolve(mxResults);
  }
}

export default function dnsResolver(email, { dns: dnsOpts } = {}) {
  return new Promise((resolve, reject) => {
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
