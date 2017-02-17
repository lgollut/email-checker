export class DnsResolverError {
  constructor(message = 'Error during dns resolution') {
    this.name = 'DnsResolverError';
    this.message = message;
  }
}

export class SmtpQueriesError {
  constructor(message = 'Error during smtp negociation') {
    this.name = 'SmtpQueriesError';
    this.message = message;
  }
}
