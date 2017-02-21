import validator from 'email-validator';

import dnsResolver from './dns-resolver';
import SmtpQueries from './smtp-queries';

const defaultOptions = {
  port: 25,
  sender: 'info@example.org',
  timeout: 10000,
  fqdn: 'mail.example.org',
  checkAcceptAll: true,
  mxServers: null,
};

function prepare(email, options) {
  return new Promise((resolve, reject) => {
    if (!validator.validate(email)) {
      resolve({ valid: false, reason: 'Invalid Email Sementic', email });
      return;
    }

    const opts = {
      ...defaultOptions,
      ...options,
    };

    if (opts.checkAcceptAll) {
      const domain = email.split('@')[1];
      opts.acceptAllEmail = `00a-109f2c1da_53fad2a-a5361cc@${domain}`;
    }

    dnsResolver(email, opts)
    .then((mxServers) => {
      const smtpQueries = new SmtpQueries({ ...opts, mxServers });
      smtpQueries.query(email)
      .then(res => resolve(res))
      .catch(error => reject(error));
    })
    .catch(error => reject(error));
  });
}

export default function checker(email = null, options = {}) {
  return new Promise((resolve) => {
    if (Array.isArray(email)) {
      const results = [];
      let counter = 0;

      email.forEach((address, index) => prepare(address, options)
        .then((data) => {
          counter += 1;
          results[index] = data;
          if (counter === email.length) {
            resolve(results);
          }
        })
        .catch((data) => {
          counter += 1;
          results[index] = data;
          if (counter === email.length) {
            resolve(results);
          }
        }),
      );
    } else {
      resolve(prepare(email, options));
    }
  });
}
