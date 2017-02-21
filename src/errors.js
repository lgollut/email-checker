export class DnsResolverError {
  constructor(
    message = 'Error during dns resolution',
    cmd = '',
    code = null,
    address = null,
  ) {
    this.name = 'DnsResolverError';
    this.message = message;
    this.cmd = cmd;
    this.code = code;
    this.address = address;
  }
}

export class SmtpQueriesError {
  constructor(
    message = 'Error during smtp negociation',
    cmd = '',
    code = null,
    address = null,
  ) {
    this.name = 'SmtpQueriesError';
    this.message = message;
    this.cmd = cmd;
    this.code = code;
    this.address = address;
  }
}
