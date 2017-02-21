/* eslint-disable import/no-extraneous-dependencies */

import net from 'net';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

import checker from '../index';
import dnsResolver, { mxResolver } from '../dns-resolver';
import SmtpQueries from '../smtp-queries';
import { DnsResolverError, SmtpQueriesError } from '../errors';
import checkResult from '../check-result';

chai.use(chaiAsPromised);
const expect = chai.expect;

const email = 'email@domain.xyz';
const invalidEmail = 'invalid.mail.com';
const invalidServer = [{ priority: 10, exchange: 'invalid-domain.xyz' }];
const validServer = [{ priority: 10, exchange: 'localhost' }];

const options = {
  port: 3007,
  fqdn: 'sender.test.com',
  sender: 'sender@test.com',
  mxServers: validServer,
};

describe('email-checker', () => {
  describe('checker', () => {
    let server;

    beforeEach((done) => {
      server = net.createServer();
      server.listen(3007, () => {
        done();
      });
    });

    afterEach((done) => {
      if (server.listening) {
        server.close();
      }
      done();
    });

    it('Resolves with correct informations if email address is ommited',
      () => {
        const expected = checkResult({ endMsg: 'Invalid Email Sementic' });
        return expect(checker()).to.eventually.deep.equal(expected);
      },
    );

    it('Resolves with correct informations if email address is invalid',
      () => {
        const expected = checkResult({ endMsg: 'Invalid Email Sementic', address: invalidEmail });
        return expect(checker(invalidEmail)).to.eventually.deep.equal(expected);
      },
    );

    it('Resolves with correct informations if process fail somewhere',
      () => {
        server.on('connection', (socket) => {
          socket.write('220 Service ready\n');
          let cmd = '';

          socket.on('data', (data) => {
            cmd = ''.concat(cmd, data.toString());
            if (cmd.slice(-1) === '\n') {
              if (
                cmd === 'ehlo sender.test.com\r\n' ||
                cmd === 'mail from:<sender@test.com>\r\n'
              ) {
                cmd = '';
                socket.write('250 Requested mail action ok\r\n');
              }

              if (cmd === `rcpt to:<${email}>\r\n`) {
                cmd = '';
                socket.write('550 Action not taken: mailbox unavailable (not found)\r\n');
              }

              if (cmd === 'quit\r\n') {
                cmd = '';
                socket.write('221 Service closing transmission channel\r\n');
              }
            }
          });
        });

        return expect(checker(email, options)).to.eventually.deep.equal(checkResult({
          valid: false,
          address: email,
          endMsg: 'Action not taken: mailbox unavailable (not found)',
          endCode: 550,
          endCmd: 'rcpt',
        }));
      },
    );

    it('Resolves once every promises are resolved or rejected if an array of email is passed',
      () => {
        const acceptAllEmail = '00a-109f2c1da_53fad2a-a5361cc@domain.xyz';
        server.on('connection', (socket) => {
          socket.write('220 Service ready\n');
          let cmd = '';

          socket.on('data', (data) => {
            cmd = ''.concat(cmd, data.toString());
            if (cmd.slice(-1) === '\n') {
              if (
                cmd === 'ehlo sender.test.com\r\n' ||
                cmd === 'mail from:<sender@test.com>\r\n' ||
                cmd === `rcpt to:<${email}>\r\n`
              ) {
                cmd = '';
                socket.write('250 Requested mail action ok\r\n');
              }

              if (cmd === `rcpt to:<${acceptAllEmail}>\r\n`) {
                cmd = '';
                socket.write('550 Action not taken: mailbox unavailable (not found)\r\n');
              }

              if (cmd === 'quit\r\n') {
                cmd = '';
                socket.write('221 Service closing transmission channel\r\n');
              }
            }
          });
        });

        const expected = [
          checkResult({
            valid: true,
            acceptAll: false,
            address: email,
            endMsg: 'Requested mail action ok',
            endCode: 250,
            endCmd: 'rcpt',
          }),
          checkResult({ endMsg: 'Invalid Email Sementic', address: invalidEmail }),
        ];
        return expect(checker([ email, invalidEmail ], options)).to.eventually.deep.equal(expected);
      },
    );
  });

  describe('dnsResolver', () => {
    it('Reject with dns error and correct message if dns options is invalid',
      () => {
        const invalidDnsOptions = { dns: { invalidDns: true }};
        return expect(dnsResolver(email, invalidDnsOptions)).be.rejectedWith(
          new DnsResolverError(),
          'Invalid DNS Options',
        );
      },
    );

    describe('mxResolver', () => {
      it('Reject with smtp error and correct message if domain is invalid',
        () => (
          expect(new Promise((resolve, reject) => (
            mxResolver(resolve, reject, { error: 'fakeError' })),
          )).be.rejectedWith(
            new SmtpQueriesError(),
            'Error while resolving MX',
          )
        ),
      );

      it('Reject with smtp error and correct message if no mx server is present',
        () => (
          expect(new Promise((resolve, reject) => (
            mxResolver(resolve, reject, null, [])),
          )).be.rejectedWith(
            new SmtpQueriesError(),
            'No MX Records',
          )
        ),
      );

      it('Return a single mx result as array',
        () => {
          const mxResults = [
            { priority: 10, exchange: 'mx.example.com' },
          ];
          const expected = [
            { priority: 10, exchange: 'mx.example.com' },
          ];
          expect(new Promise(resolve => (
            mxResolver(resolve, null, null, mxResults)),
          )).to.eventually.deep.equal(expected);
        },
      );

      it('Return sorted mx results if multiple servers are present',
        () => {
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
        },
      );
    });
  });

  describe('SmtpQueries', () => {
    let server;

    beforeEach((done) => {
      server = net.createServer();
      server.listen(3007, () => {
        done();
      });
    });

    afterEach((done) => {
      if (server.listening) {
        server.close();
      }
      done();
    });

    describe('Connection results', () => {
      it('Reject with smtp error and correct message if socket connection failed due to invalid domain',
        () => {
          const smtpQueries = new SmtpQueries({ ...options, mxServers: invalidServer });
          return expect(smtpQueries.query(email)).be.rejectedWith(
            new SmtpQueriesError(),
            'getaddrinfo ENOTFOUND invalid-domain.xyz invalid-domain.xyz:3007',
          );
        },
      );

      it('Resolve with correct informations if connection succeed but response code is 421',
        () => {
          const smtpQueries = new SmtpQueries(options);

          server.on('connection', (socket) => {
            socket.write('421 Service not available\n');
          });

          return expect(smtpQueries.query(email)).to.eventually.deep.equal(checkResult({
            address: email,
            endMsg: 'Service not available',
            endCode: 421,
            endCmd: 'conn',
          }));
        },
      );
    });

    describe('Ehlo results', () => {
      let smtpQueries;

      beforeEach((done) => {
        smtpQueries = new SmtpQueries(options);
        done();
      });

      afterEach((done) => {
        smtpQueries = null;
        done();
      });

      it('Resolve with correct informations if command succeed but response code is 421',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n' && cmd === 'ehlo sender.test.com\r\n') {
                socket.write('421 Service not available\r\n');
              }
            });
          });

          return expect(smtpQueries.query(email)).to.eventually.deep.equal(checkResult({
            address: email,
            endMsg: 'Service not available',
            endCode: 421,
            endCmd: 'ehlo',
          }));
        },
      );

      it('Reject with dns error and correct message if command failed with code 500',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n' && cmd === 'ehlo sender.test.com\r\n') {
                socket.write('500 Syntax error, command unrecognized\r\n');
              }
            });
          });

          return expect(smtpQueries.query(email)).be.rejectedWith(
            new SmtpQueriesError(),
            'Syntax error, command unrecognized',
          );
        },
      );

      it('Reject with dns error and correct message if command failed with code 501',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n' && cmd === 'ehlo sender.test.com\r\n') {
                socket.write('501 Syntax error in parameters or arguments\r\n');
              }
            });
          });

          return expect(smtpQueries.query(email)).be.rejectedWith(
            new SmtpQueriesError(),
            'Syntax error in parameters or arguments',
          );
        },
      );

      it('Reject with dns error and correct message if command failed with code 504',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n' && cmd === 'ehlo sender.test.com\r\n') {
                socket.write('504 Command parameter not implemented\r\n');
              }
            });
          });

          return expect(smtpQueries.query(email)).be.rejectedWith(
            new SmtpQueriesError(),
            'Command parameter not implemented',
          );
        },
      );
    });

    describe('Mail results', () => {
      let smtpQueries;

      beforeEach((done) => {
        smtpQueries = new SmtpQueries(options);
        done();
      });

      afterEach((done) => {
        smtpQueries = null;
        done();
      });

      it('Resolve with correct informations if command succeed but response code is 421',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n') {
                if (cmd === 'ehlo sender.test.com\r\n') {
                  cmd = '';
                  socket.write('250 Requested mail action okay, completed\r\n');
                }
                if (cmd === 'mail from:<sender@test.com>\r\n') {
                  cmd = '';
                  socket.write('421 Service not available\r\n');
                }
              }
            });
          });

          return expect(smtpQueries.query(email)).to.eventually.deep.equal(checkResult({
            valid: false,
            address: email,
            endMsg: 'Service not available',
            endCode: 421,
            endCmd: 'mail',
          }));
        },
      );

      it('Resolve with correct informations if command succeed but response code is 451',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n') {
                if (cmd === 'ehlo sender.test.com\r\n') {
                  cmd = '';
                  socket.write('250 Requested mail action okay, completed\r\n');
                }
                if (cmd === 'mail from:<sender@test.com>\r\n') {
                  cmd = '';
                  socket.write('451 Action aborted: local error in processing\r\n');
                }
              }
            });
          });

          return expect(smtpQueries.query(email)).to.eventually.deep.equal(checkResult({
            valid: false,
            address: email,
            endMsg: 'Action aborted: local error in processing',
            endCode: 451,
            endCmd: 'mail',
          }));
        },
      );

      it('Resolve with correct informations if command succeed but response code is 452',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n') {
                if (cmd === 'ehlo sender.test.com\r\n') {
                  cmd = '';
                  socket.write('250 Requested mail action okay, completed\r\n');
                }
                if (cmd === 'mail from:<sender@test.com>\r\n') {
                  cmd = '';
                  socket.write('452 Action not taken : insufficient system storage\r\n');
                }
              }
            });
          });

          return expect(smtpQueries.query(email)).to.eventually.deep.equal(checkResult({
            valid: false,
            address: email,
            endMsg: 'Action not taken : insufficient system storage',
            endCode: 452,
            endCmd: 'mail',
          }));
        },
      );

      it('Reject with dns error and correct message if command failed with code 500',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n') {
                if (cmd === 'ehlo sender.test.com\r\n') {
                  cmd = '';
                  socket.write('250 Requested mail action okay, completed\r\n');
                }
                if (cmd === 'mail from:<sender@test.com>\r\n') {
                  cmd = '';
                  socket.write('500 Syntax error, command unrecognized\r\n');
                }
              }
            });
          });

          return expect(smtpQueries.query(email)).be.rejectedWith(
            new SmtpQueriesError(),
            'Syntax error, command unrecognized',
          );
        },
      );

      it('Reject with dns error and correct message if command failed with code 501',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n') {
                if (cmd === 'ehlo sender.test.com\r\n') {
                  cmd = '';
                  socket.write('250 Requested mail action okay, completed\r\n');
                }
                if (cmd === 'mail from:<sender@test.com>\r\n') {
                  cmd = '';
                  socket.write('501 Syntax error in parameters or arguments\r\n');
                }
              }
            });
          });

          return expect(smtpQueries.query(email)).be.rejectedWith(
            new SmtpQueriesError(),
            'Syntax error in parameters or arguments',
          );
        },
      );

      it('Reject with dns error and correct message if command failed with code 552',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n') {
                if (cmd === 'ehlo sender.test.com\r\n') {
                  cmd = '';
                  socket.write('250 Requested mail action okay, completed\r\n');
                }
                if (cmd === 'mail from:<sender@test.com>\r\n') {
                  cmd = '';
                  socket.write('552 Mail action aborted: exceeded storage allocation\r\n');
                }
              }
            });
          });

          return expect(smtpQueries.query(email)).be.rejectedWith(
            new SmtpQueriesError(),
            'Mail action aborted: exceeded storage allocation',
          );
        },
      );
    });

    describe('Rcpt results without acceptAll option', () => {
      let smtpQueries;

      beforeEach((done) => {
        smtpQueries = new SmtpQueries(options);
        done();
      });

      afterEach((done) => {
        smtpQueries = null;
        done();
      });

      it('Resolve with correct informations if command succeed but response code is 421',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n') {
                if (
                  cmd === 'ehlo sender.test.com\r\n' ||
                  cmd === 'mail from:<sender@test.com>\r\n'
                ) {
                  cmd = '';
                  socket.write('250 Requested mail action ok\r\n');
                }
                if (cmd === `rcpt to:<${email}>\r\n`) {
                  cmd = '';
                  socket.write('421 Service not available\r\n');
                }
              }
            });
          });

          return expect(smtpQueries.query(email)).to.eventually.deep.equal(checkResult({
            valid: false,
            address: email,
            endMsg: 'Service not available',
            endCode: 421,
            endCmd: 'rcpt',
          }));
        },
      );

      it('Resolve with correct informations if command succeed but response code is 450',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n') {
                if (
                  cmd === 'ehlo sender.test.com\r\n' ||
                  cmd === 'mail from:<sender@test.com>\r\n'
                ) {
                  cmd = '';
                  socket.write('250 Requested mail action ok\r\n');
                }
                if (cmd === `rcpt to:<${email}>\r\n`) {
                  cmd = '';
                  socket.write('450 Mailbox unavailable (busy)\r\n');
                }
              }
            });
          });

          return expect(smtpQueries.query(email)).to.eventually.deep.equal(checkResult({
            valid: false,
            address: email,
            endMsg: 'Mailbox unavailable (busy)',
            endCode: 450,
            endCmd: 'rcpt',
          }));
        },
      );

      it('Resolve with correct informations if command succeed but response code is 451',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n') {
                if (
                  cmd === 'ehlo sender.test.com\r\n' ||
                  cmd === 'mail from:<sender@test.com>\r\n'
                ) {
                  cmd = '';
                  socket.write('250 Requested mail action ok\r\n');
                }
                if (cmd === `rcpt to:<${email}>\r\n`) {
                  cmd = '';
                  socket.write('451 Action aborted: local error in processing\r\n');
                }
              }
            });
          });

          return expect(smtpQueries.query(email)).to.eventually.deep.equal(checkResult({
            valid: false,
            address: email,
            endMsg: 'Action aborted: local error in processing',
            endCode: 451,
            endCmd: 'rcpt',
          }));
        },
      );

      it('Resolve with correct informations if command succeed but response code is 452',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n') {
                if (
                  cmd === 'ehlo sender.test.com\r\n' ||
                  cmd === 'mail from:<sender@test.com>\r\n'
                ) {
                  cmd = '';
                  socket.write('250 Requested mail action ok\r\n');
                }
                if (cmd === `rcpt to:<${email}>\r\n`) {
                  cmd = '';
                  socket.write('452 Action not taken : insufficient system storage\r\n');
                }
              }
            });
          });

          return expect(smtpQueries.query(email)).to.eventually.deep.equal(checkResult({
            valid: false,
            address: email,
            endMsg: 'Action not taken : insufficient system storage',
            endCode: 452,
            endCmd: 'rcpt',
          }));
        },
      );

      it('Reject with dns error and correct message if command failed with code 500',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n') {
                if (
                  cmd === 'ehlo sender.test.com\r\n' ||
                  cmd === 'mail from:<sender@test.com>\r\n'
                ) {
                  cmd = '';
                  socket.write('250 Requested mail action ok\r\n');
                }
                if (cmd === `rcpt to:<${email}>\r\n`) {
                  cmd = '';
                  socket.write('500 Syntax error, command unrecognized\r\n');
                }
              }
            });
          });

          return expect(smtpQueries.query(email)).be.rejectedWith(
            new SmtpQueriesError(),
            'Syntax error, command unrecognized',
          );
        },
      );

      it('Reject with dns error and correct message if command failed with code 501',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n') {
                if (
                  cmd === 'ehlo sender.test.com\r\n' ||
                  cmd === 'mail from:<sender@test.com>\r\n'
                ) {
                  cmd = '';
                  socket.write('250 Requested mail action ok\r\n');
                }
                if (cmd === `rcpt to:<${email}>\r\n`) {
                  cmd = '';
                  socket.write('501 Syntax error in parameters or arguments\r\n');
                }
              }
            });
          });

          return expect(smtpQueries.query(email)).be.rejectedWith(
            new SmtpQueriesError(),
            'Syntax error in parameters or arguments',
          );
        },
      );

      it('Reject with dns error and correct message if command failed with code 503',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n') {
                if (
                  cmd === 'ehlo sender.test.com\r\n' ||
                  cmd === 'mail from:<sender@test.com>\r\n'
                ) {
                  cmd = '';
                  socket.write('250 Requested mail action ok\r\n');
                }
                if (cmd === `rcpt to:<${email}>\r\n`) {
                  cmd = '';
                  socket.write('503 Bad sequence of commands\r\n');
                }
              }
            });
          });

          return expect(smtpQueries.query(email)).be.rejectedWith(
            new SmtpQueriesError(),
            'Bad sequence of commands',
          );
        },
      );

      it('Reject with dns error and correct message if command failed with code 550',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n') {
                if (
                  cmd === 'ehlo sender.test.com\r\n' ||
                  cmd === 'mail from:<sender@test.com>\r\n'
                ) {
                  cmd = '';
                  socket.write('250 Requested mail action ok\r\n');
                }
                if (cmd === `rcpt to:<${email}>\r\n`) {
                  cmd = '';
                  socket.write('550 Action not taken: mailbox unavailable (not found)\r\n');
                }
              }
            });
          });

          return expect(smtpQueries.query(email)).be.rejectedWith(
            new SmtpQueriesError(),
            'Action not taken: mailbox unavailable (not found)',
          );
        },
      );

      it('Reject with dns error and correct message if command failed with code 551',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n') {
                if (
                  cmd === 'ehlo sender.test.com\r\n' ||
                  cmd === 'mail from:<sender@test.com>\r\n'
                ) {
                  cmd = '';
                  socket.write('250 Requested mail action ok\r\n');
                }
                if (cmd === `rcpt to:<${email}>\r\n`) {
                  cmd = '';
                  socket.write('551 User not local\r\n');
                }
              }
            });
          });

          return expect(smtpQueries.query(email)).be.rejectedWith(
            new SmtpQueriesError(),
            'User not local',
          );
        },
      );

      it('Reject with dns error and correct message if command failed with code 552',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n') {
                if (
                  cmd === 'ehlo sender.test.com\r\n' ||
                  cmd === 'mail from:<sender@test.com>\r\n'
                ) {
                  cmd = '';
                  socket.write('250 Requested mail action ok\r\n');
                }
                if (cmd === `rcpt to:<${email}>\r\n`) {
                  cmd = '';
                  socket.write('552 Mail action aborted: exceeded storage allocation\r\n');
                }
              }
            });
          });

          return expect(smtpQueries.query(email)).be.rejectedWith(
            new SmtpQueriesError(),
            'Mail action aborted: exceeded storage allocation',
          );
        },
      );

      it('Reject with dns error and correct message if command failed with code 553',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n') {
                if (
                  cmd === 'ehlo sender.test.com\r\n' ||
                  cmd === 'mail from:<sender@test.com>\r\n'
                ) {
                  cmd = '';
                  socket.write('250 Requested mail action ok\r\n');
                }
                if (cmd === `rcpt to:<${email}>\r\n`) {
                  cmd = '';
                  socket.write('553 Action not taken: mailbox name not allowed\r\n');
                }
              }
            });
          });

          return expect(smtpQueries.query(email)).be.rejectedWith(
            new SmtpQueriesError(),
            'Action not taken: mailbox name not allowed',
          );
        },
      );

      it('Resolve with correct informations if command succeed',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n') {
                if (
                  cmd === 'ehlo sender.test.com\r\n' ||
                  cmd === 'mail from:<sender@test.com>\r\n' ||
                  cmd === `rcpt to:<${email}>\r\n`
                ) {
                  cmd = '';
                  socket.write('250 Requested mail action ok\r\n');
                }
                if (cmd === 'quit\r\n') {
                  cmd = '';
                  socket.write('221 Service closing transmission channel\r\n');
                }
              }
            });
          });

          return expect(smtpQueries.query(email)).to.eventually.deep.equal(checkResult({
            valid: true,
            acceptAll: null,
            address: email,
            endMsg: 'Requested mail action ok',
            endCode: 250,
            endCmd: 'rcpt',
          }));
        },
      );
    });
    describe('Rcpt results with acceptAll option', () => {
      let smtpQueries;
      const acceptAllEmail = '00a-109f2c1da_53fad2a-a5361cc@domain.xyz';

      beforeEach((done) => {
        smtpQueries = new SmtpQueries({ ...options, acceptAllEmail });
        done();
      });

      afterEach((done) => {
        smtpQueries = null;
        done();
      });

      it('Resolve with correct informations if command succeed, acceptAll option is set but server is not in accept all mode',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n') {
                if (
                  cmd === 'ehlo sender.test.com\r\n' ||
                  cmd === 'mail from:<sender@test.com>\r\n' ||
                  cmd === `rcpt to:<${email}>\r\n`
                ) {
                  cmd = '';
                  socket.write('250 Requested mail action ok\r\n');
                }
                if (cmd === `rcpt to:<${acceptAllEmail}>\r\n`) {
                  cmd = '';
                  socket.write('553 Action not taken: mailbox name not allowed\r\n');
                }
                if (cmd === 'quit\r\n') {
                  cmd = '';
                  socket.write('221 Service closing transmission channel\r\n');
                }
              }
            });
          });

          return expect(smtpQueries.query(email)).to.eventually.deep.equal(checkResult({
            valid: true,
            acceptAll: false,
            address: email,
            endMsg: 'Requested mail action ok',
            endCode: 250,
            endCmd: 'rcpt',
          }));
        },
      );

      it('Resolve with correct informations if command succeed, acceptAll option is set and server responds with a soft bounce',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n') {
                if (
                  cmd === 'ehlo sender.test.com\r\n' ||
                  cmd === 'mail from:<sender@test.com>\r\n' ||
                  cmd === `rcpt to:<${email}>\r\n`
                ) {
                  cmd = '';
                  socket.write('250 Requested mail action ok\r\n');
                }
                if (cmd === `rcpt to:<${acceptAllEmail}>\r\n`) {
                  cmd = '';
                  socket.write('450 Mailbox unavailable (busy)\r\n');
                }
                if (cmd === 'quit\r\n') {
                  cmd = '';
                  socket.write('221 Service closing transmission channel\r\n');
                }
              }
            });
          });

          return expect(smtpQueries.query(email)).to.eventually.deep.equal(checkResult({
            valid: true,
            acceptAll: false,
            address: email,
            endMsg: 'Requested mail action ok',
            endCode: 250,
            endCmd: 'rcpt',
          }));
        },
      );

      it('Resolve with correct informations if command succeed, acceptAll option is set and server is in accept all mode',
        () => {
          server.on('connection', (socket) => {
            socket.write('220 Service ready\n');
            let cmd = '';

            socket.on('data', (data) => {
              cmd = ''.concat(cmd, data.toString());
              if (cmd.slice(-1) === '\n') {
                if (
                  cmd === 'ehlo sender.test.com\r\n' ||
                  cmd === 'mail from:<sender@test.com>\r\n' ||
                  cmd === `rcpt to:<${email}>\r\n` ||
                  cmd === `rcpt to:<${acceptAllEmail}>\r\n`
                ) {
                  cmd = '';
                  socket.write('250 Requested mail action ok\r\n');
                }
                if (cmd === 'quit\r\n') {
                  cmd = '';
                  socket.write('221 Service closing transmission channel\r\n');
                }
              }
            });
          });

          return expect(smtpQueries.query(email)).to.eventually.deep.equal(checkResult({
            valid: 'unknown',
            acceptAll: true,
            address: email,
            endMsg: 'Requested mail action ok',
            endCode: 250,
            endCmd: 'rcpt',
          }));
        },
      );
    });
  });
});
