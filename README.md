# SMTP Email Verification

A promise based smtp email verification heavily inspired by [bighappyworld](https://github.com/bighappyworld/email-verify) package. Thanks to him.

### Install

```
npm install --save email-checker
```

### Usage

```javascript
import check from 'email-checker';

check('email@domain.com')
.then((result) => {
  const { success, address, tryAgain } = result;
})
.catch((err) => {
  const { message, error } = err;
});
```

### Options

The default options are:
```javascript
{
  port: 25, // integer, port to connect with defaults to 25
  sender: 'info@example.org', // email, sender address, defaults to name@example.org
  timeout: 10000, // integer, socket timeout defaults to 0 which is no timeout
  fqdn: 'mail.example.org', // domain, used as part of the HELO, defaults to mail.example.org
  dns: [], // ip address, or array of ip addresses (as strings), to proceed the dns resolution,
  ignore: null, // set an ending response code integer to ignore, such as 450 for greylisted emails
}
```

### Flow

The basic flow is as follows:

1. Validate it is a proper email address
2. Get the domain of the email
3. Grab the DNS MX records for that domain
4. Create a TCP connection to the smtp server
5. Send a EHLO message
6. Send a MAIL FROM message
7. Send a RCPT TO message
8. If they all validate, return an object with success: true.
