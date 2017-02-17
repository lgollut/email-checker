import net from 'net';
import { SmtpQueriesError } from './errors';

export default function smtpQueries(email, options = {}) {
  return new Promise((resolve, reject) => {
    const { port, smtp, timeout, fqdn, sender, ignore } = options;
    const socket = net.createConnection(port, smtp);

    let stage = 0;
    let success = false;
    let response = '';
    let completed = false;
    let ended = false;
    let tryagain = false;

    function advanceToNextStage() {
      stage += 1;
      response = '';
    }

    function writeToSocket(cmd) {
      if (!ended) {
        socket.write(cmd, advanceToNextStage);
      }
    }

    if (timeout > 0) {
      socket.setTimeout(timeout, () => {
        ended = true;
        socket.destroy('Connection Timed Out');
      });
    }

    socket.on('data', (data) => {
      response += data.toString();
      completed = response.slice(-1) === '\n';

      if (completed) {
        switch (stage) {
          case 0: {
            if (response.indexOf('220') !== -1 && !ended) {
              writeToSocket(`EHLO ${fqdn}\r\n`);
            } else {
              if (
                response.indexOf('421') !== -1 ||
                response.indexOf('450') !== -1 ||
                response.indexOf('451') !== -1
              ) {
                tryagain = true;
              }
              socket.end();
            }
            break;
          }
          case 1: {
            if (response.indexOf('250') > -1 && !ended) {
              writeToSocket(`MAIL FROM:<${sender}>\r\n`);
            } else {
              socket.end();
            }
            break;
          }
          case 2: {
            if (response.indexOf('250') > -1 && !ended) {
              writeToSocket(`RCPT TO:<${email}>\r\n`);
            } else {
              socket.end();
            }
            break;
          }
          case 3: {
            if (
              response.indexOf('250') > -1 ||
              (ignore && response.indexOf(ignore) > -1)
            ) {
              success = true;
            }
            writeToSocket('QUIT\r\n');
            break;
          }
          case 4:
          default: {
            socket.end();
          }
        }
      }
    });

    socket.on('connect', () => {
    });

    socket.on('error', ({ message }) => {
      reject(new SmtpQueriesError(message));
    });

    socket.on('end', () => {
      resolve({ success, address: email, tryagain });
    });
  });
}
