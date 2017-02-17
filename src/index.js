import validator from 'email-validator';

import dnsResolver from './dns-resolver';
import smtpQueries from './smtp-queries';

const defaultOptions = {
  port: 25,
  sender: 'info@example.org',
  timeout: 10000,
  fqdn: 'mail.example.org',
  ignore: null,
};

export default function checker(email = '', options = {}) {
  return new Promise((resolve, reject) => {
    if (!validator.validate(email)) {
      resolve({ success: false, reason: 'Invalid Email Sementic', email });
    }

    const opts = {
      ...defaultOptions,
      ...options,
    };

    dnsResolver(email, opts)
    .then(mxServers => smtpQueries(email, { ...opts, mxServers })
      .then(() => {})
      .catch(() => {}))
    .catch(error => reject(error));
  });
}
