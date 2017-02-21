import { DnsResolverError, SmtpQueriesError } from './errors';

export default function checkResults(data) {
  const {
    valid = false,
    acceptAll = null,
    address = null,
  } = data;

  let {
    endMsg = null,
    endCode = null,
    endCmd = null,
  } = data;

  if (
    data instanceof DnsResolverError ||
    data instanceof SmtpQueriesError
  ) {
    endMsg = data.message;
    endCode = data.code;
    endCmd = data.cmd;
  } else if (
    data instanceof Error
  ) {
    endMsg = data.message;
  }

  return { valid, endMsg, endCmd, endCode, acceptAll, address };
}
