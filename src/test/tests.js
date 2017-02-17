/* eslint-disable import/no-extraneous-dependencies */

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

import checker from '../index';
import dnsResolver, { mxResolver } from '../dns-resolver';
import smtpQueries from '../smtp-queries';
import { DnsResolverError, SmtpQueriesError } from '../errors';

chai.use(chaiAsPromised);
const expect = chai.expect;

describe('email-checker', () => {
  describe('checker', () => {
    it('Resolve with correct information if email address is ommited', () => {
      const expected = { success: false, reason: 'Invalid Email Sementic', email: '' };
      return expect(checker()).to.eventually.deep.equal(expected);
    });

    it('Resolve with correct information if email address is invalid', () => {
      const email = 'invalid.mail.com';
      const expected = { success: false, reason: 'Invalid Email Sementic', email };
      return expect(checker(email)).to.eventually.deep.equal(expected);
    });

    it('Reject with source error and source message if process fail', () => {
      const email = 'email@domain.xyz';
      return expect(checker(email)).be.rejectedWith(
        new DnsResolverError(),
        'Error while resolving MX',
      );
    });
  });

  describe('dnsResolver', () => {
    it('Reject with dns error and correct message if dns options is invalid', () => {
      const email = 'test@mail.com';
      const options = { dns: { invalidDns: true }};
      return expect(dnsResolver(email, options)).be.rejectedWith(
        new DnsResolverError(),
        'Invalid DNS Options',
      );
    });

    it('Reject with dns error and correct message if domain does not exists', () => {
      const email = 'test@invalid-domain';
      return expect(dnsResolver(email)).be.rejectedWith(
        new DnsResolverError(),
        'Error while resolving MX',
      );
    });
  });

  describe('mxResolver', () => {
    it('Reject with smtp error and correct message if domain is invalid', () => (
      expect(new Promise((resolve, reject) => (
        mxResolver(resolve, reject, { error: 'fakeError' })),
      )).be.rejectedWith(
        new SmtpQueriesError(),
        'Error while resolving MX',
      )
    ));

    it('Reject with smtp error and correct message if no mx server is present', () => (
      expect(new Promise((resolve, reject) => (
        mxResolver(resolve, reject, null, [])),
      )).be.rejectedWith(
        new SmtpQueriesError(),
        'No MX Records',
      )
    ));

    it('Return sorted mx results', () => {
      const mxResults = [
        { priority: 20, exchange: 'mx2.example.com' },
        { priority: 30, exchange: 'mx3.example.com' },
        { priority: 10, exchange: 'mx.example.com' },
      ];
      const expected = [
        { priority: 10, exchange: 'mx.example.com' },
        { priority: 20, exchange: 'mx2.example.com' },
        { priority: 30, exchange: 'mx3.example.com' },
      ];
      expect(new Promise(resolve => (
        mxResolver(resolve, null, null, mxResults)),
      )).to.eventually.deep.equal(expected);
    });
  });

  describe('smtpQueries', () => {
    it('Reject smtp error and correct message if socket connection failed', () => {
      const email = 'test@mail.com';
      const options = { port: 25, smtp: 'invalid-domain.xyz' };

      return expect(smtpQueries(email, options)).be.rejectedWith(
        new SmtpQueriesError(),
        'getaddrinfo ENOTFOUND invalid-domain.xyz invalid-domain.xyz:25',
      );
    });
  });
});
