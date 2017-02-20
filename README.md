# SMTP Email Verification

A promise based smtp email verification.

### Install

`npm install --save email-checker`

### Usage

```javascript
import check from 'email-checker';

check('email@domain.com', options)
.then((result) => {
  const {
    success, // True if email is validated against smtp protocol
    address, // Email being verified
    endMsg,  // The last human readable message sent by the smtp server
    endCode, // The last response code sent by the receiver server
    endCmd,  // 4 digit identifying the last command sent to the receiver server
  } = result;
})
.catch((error) => {
  const {
    name,    // Name identifying the error
    message, // Human readable error message
  } = error;
});
```

### Options

The default options are:
```javascript
{
  // integer, port to connect with defaults to 25
  port: 25,

  // email, sender address, defaults to name@example.org
  sender: 'info@example.org',

  // integer, socket timeout defaults to 0 which is no timeout
  timeout: 10000,

  // domain, used as part of the HELO, defaults to mail.example.org
  fqdn: 'mail.example.org',

  // ip address, or array of ip addresses (as strings), to proceed the dns resolution,
  dns: [],

  // set an ending response code integer to ignore, such as 450 for greylisted emails
  ignore: null,
}
```

### Flow

The basic flow is as follows:

1. Validate it is a valid email address with email-validator
2. Get the domain of the email
3. Get DNS MX records for that domain, ordered by priority
4. Create a TCP connection to the first smtp server
5. Send a EHLO message
6. Send a MAIL FROM message
7. Send a RCPT TO message
8. If they all validate, return an object with success: true.
