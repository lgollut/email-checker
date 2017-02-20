import { Socket } from 'net';
import { SmtpQueriesError } from './errors';

export default class SmtpQueries {
  constructor(options) {
    const { port, smtp, timeout, fqdn, sender, mxServers } = options;

    this.port = port;
    this.smtp = smtp;
    this.fqdn = fqdn;
    this.sender = sender;
    this.timeout = timeout;
    this.mxServers = mxServers;
    this.email = '';

    this.currentMx = 0;
    this.stage = 0;
    this.success = false;
    this.response = '';
    this.currentMsg = '';
    this.currentCmd = 'conn';
    this.currentCode = 0;

    this.socket = new Socket();

    if (this.timeout > 0) {
      this.socket.setTimeout(this.timeout, () => {
        this.socket.destroy('Connection Timed Out');
      });
    }
  }

  getSocket = () => this.socket;

  writeToSocket = (cmd, args, { resCode, resMsg, errorMsg } = {}) => {
    if (this.socket.destroyed) {
      return;
    }

    this.currentCode = resCode;
    this.currentMsg = resMsg;

    if (cmd === 'quit') {
      if (resMsg) {
        this.socket.write(`${cmd}\r\n`);
        this.softBounce = resMsg;
        this.socket.end();
      } else if (errorMsg) {
        this.socket.write(`${cmd}\r\n`);
        this.socket.destroy(errorMsg);
      } else {
        this.socket.write(`${cmd}\r\n`);
      }
    } else {
      this.currentCmd = cmd;
      this.socket.write(`${cmd} ${args}\r\n`, () => {
        this.response = '';
      });
    }
  }

  getHost = () => {
    const server = this.mxServers[this.currentMx];
    this.currentMx += 1;
    return server;
  }

  stageResponse = (resCode, resMsg) => {
    const stage = ''.concat(this.currentCmd.charAt(0).toUpperCase(), this.currentCmd.slice(1));
    this[`handle${stage}Res`].call(this, resCode, resMsg);
  }

  handleConnRes = (resCode, resMsg) => {
    if ( // Success
      resCode === 220     // Service ready
    ) {
      this.writeToSocket('ehlo', this.fqdn, { resCode, resMsg });
    } else if ( // Soft bounce
      resCode === 421     // Service not available
    ) {
      this.writeToSocket('quit', null, { resCode, resMsg });
    }
  }

  handleEhloRes = (resCode, resMsg) => {
    if ( // Success
      resCode === 250     // Requested mail action ok
    ) {
      this.writeToSocket('mail', `from:<${this.sender}>`, { resCode, resMsg });
    } else if ( // Soft bounce
      resCode === 421     // Service not available
    ) {
      this.writeToSocket('quit', null, { resCode, resMsg });
    } else if ( // Hard bounce
      resCode === 500 ||  // Syntax error, command unrecognized
      resCode === 501 ||  // Syntax error in parameters or arguments
      resCode === 504     // Command parameter not implemented
    ) {
      this.writeToSocket('quit', null, { resCode, errorMsg: resMsg });
    }
  }

  handleMailRes = (resCode, resMsg) => {
    if ( // Success
      resCode === 250     // Requested mail action ok
    ) {
      this.writeToSocket('rcpt', `to:<${this.email}>`, { resCode, resMsg });
    } else if ( // Soft bounce
      resCode === 451 ||  // Action aborted: local error in processing
      resCode === 452 ||  // Action not taken : insufficient system storage
      resCode === 421     // Service not available
    ) {
      this.writeToSocket('quit', null, { resCode, resMsg });
    } else if ( // Hard bounce
      resCode === 500 ||  // Syntax error, command unrecognized
      resCode === 501 ||  // Syntax error in parameters or arguments
      resCode === 552     // Mail action aborted: exceeded storage allocation
    ) {
      this.writeToSocket('quit', null, { resCode, errorMsg: resMsg });
    }
  }

  handleRcptRes = (resCode, resMsg) => {
    if ( // Success
      resCode === 250 ||  // Requested mail action ok
      resCode === 251     // User not local; will forward
    ) {
      this.success = true;
      this.writeToSocket('quit', null, { resCode, resMsg });
    } else if ( // Soft bounce)
      resCode === 450 ||  // Mailbox unavailable (busy)
      resCode === 451 ||  // Action aborted: local error in processing
      resCode === 452 ||  // Action not taken : insufficient system storage
      resCode === 421     // Service not available
    ) {
      this.writeToSocket('quit', null, { resCode, resMsg });
    } else if ( // Hard bounce)
      resCode === 500 ||  // Syntax error, command unrecognized
      resCode === 501 ||  // Syntax error in parameters or arguments
      resCode === 503 ||  // Bad sequence of commands
      resCode === 550 ||  // Action not taken: mailbox unavailable (not found)
      resCode === 551 ||  // User not local
      resCode === 552 ||  // Mail action aborted: exceeded storage allocation
      resCode === 553     // Action not taken: mailbox name not allowed
    ) {
      this.writeToSocket('quit', null, { resCode, errorMsg: resMsg });
    }
  }

  handleQuitRes = () => {
    this.socket.end();
  }

  parseResponse = response => ({
    resMsg: response.slice(3, -1).trim(),
    resCode: parseInt(response.slice(0, 3), 10),
  })

  query = (email) => {
    const { exchange } = this.getHost();

    if (!exchange) {
      return Promise.reject(new SmtpQueriesError(`Unknown server ${exchange}`));
    }

    this.email = email;

    this.socket.connect({ port: this.port, host: exchange });
    this.socket.on('data', (data) => {
      this.response += data.toString();
      if (this.response.slice(-1) === '\n') {
        const { resCode, resMsg } = this.parseResponse(this.response);
        this.stageResponse(resCode, resMsg);
      }
    });

    return new Promise((resolve, reject) => {
      this.socket.on('error', (message) => {
        reject(new SmtpQueriesError(message.toString()));
      });

      this.socket.on('end', () => {
        resolve({
          success: this.success,
          address: email,
          endMsg: this.softBounce,
          endCmd: this.currentCmd.toUpperCase(),
          endCode: this.currentCode,
        });
      });
    });
  }
}
