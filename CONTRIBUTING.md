new environment setup: need a firebase env and a playfab env.

* https://developer.playfab.com/en-us/F810/secret-keys/new > name: firebase, expiration: never
* https://developer.paypal.com/docs/classic/ipn/integration-guide/IPNSetup/: go to https://www.sandbox.paypal.com/cgi-bin/customerprofileweb?cmd=_profile-ipn-notify > "choose ipn settings" > $firebase-url/ipnHandler
* https://firebase.google.com/docs/functions/config-env: `firebase functions:config:set playfab.id="F810" playfab.key="..."`
