var functions = require('firebase-functions');
var PlayFab = require('playfab-sdk/Scripts/PlayFab/PlayFab');
var PlayFabServer = require('playfab-sdk/Scripts/PlayFab/PlayFabServer');
var _ = require('lodash')
var request = require('request')

// Start writing Firebase Functions
// https://firebase.google.com/functions/write-firebase-functions

exports.helloWorld = functions.https.onRequest(async (req, res) => {
  console.log(JSON.stringify({body: req.body}))
  res.json({
    message: "Hello from Firebase!",
    playfabId: functions.config().playfab.id,
    body: req.body,
  });
})

// https://developer.paypal.com/docs/classic/ipn/integration-guide/IPNImplementation/
const paypalEnvs = {
  sandbox: 'https://ipnpb.sandbox.paypal.com/cgi-bin/webscr',
  prod: 'https://ipnpb.paypal.com/cgi-bin/webscr',
}

function ipnVerificationPostBody(body) {
  return 'cmd=_notify-validate&' + Object.keys(body).map(key =>
    encodeURIComponent(key)+'='+encodeURIComponent(body[key])).join('&')
}
exports.ipnVerificationPostBody = ipnVerificationPostBody

function isTxnSkipped(config, tx) {
  return config.paypal.skiptxns && !!_.keyBy(JSON.parse(config.paypal.skiptxns))[tx]
}
exports.isTxnSkipped = isTxnSkipped

exports.ipnHandler = functions.https.onRequest(async (req, res) => {
  console.log(JSON.stringify({body: req.body}))
  try {
    const config = functions.config()
    if (!config.playfab.id) throw new Error('config.playfab.id required')
    if (!config.playfab.key) throw new Error('config.playfab.key required')
    if (!config.paypal.env) throw new Error('config.paypal.env required')
    const paypalHost = paypalEnvs[config.paypal.env]
    PlayFab.settings.titleId = config.playfab.id
    PlayFab.settings.developerSecretKey = config.playfab.key
    // TODO move all above config stuff to top-level; no need to rerun once per request
    // client will pass custom={playfabId}
    // ...but if they don't, it doesn't help to retry more
    let playfabId, tx
    try {
      if (!req.body.custom) throw new Error('request.body.custom required')
      const custom = JSON.parse(req.body.custom)
      console.log('custom', custom)
      playfabId = custom.playfabId
      if (!playfabId) throw new Error('req.body.custom.playfabId required')
      tx = req.body.txn_id
      if (!tx) throw new Error('req.body.txn_id required')
    }
    catch (e) {
      console.error('Cannot process IPN request (bad parameters passed to paypal purchase?); quitting without retries', e, JSON.stringify(req.body))
      // This really should be a 400, but paypal wants a 200 to stop retrying
      return res.status(200).send("")
    }

    console.log({playfabId, tx}, JSON.stringify(req.body))

    // For various operational reasons (like UTF-8 encoding shenanigans), we might
    // resolve an order manually and avoid processing it here. Allow us to set
    // transaction IDs to skip and stop processing, so they don't retry forever
    // in paypal's IPN system. Doing this via config is less convenient to update,
    // but it keeps tx ids private.
    //
    // firebase functions:config:set --project=swarm1-prod paypal.skiptxns='["abc123"]'
    if (isTxnSkipped(config, tx)) {
      console.log('paypalNotify skipped tx', tx)
      return res.status(200).send("")
    }

    const body = exports.ipnVerificationPostBody(req.body);
    const verifyReq = {
      url: paypalHost,
      method: 'POST',
      headers: {
        Connection: 'close',
        'User-Agent': 'swarm-paypal-ipn-firebase',
      },
      body,
      strictSSL: true,
    }
    console.log('verifyReq', verifyReq)
    request(verifyReq, (error, verifyRes, verifyResBody) => {
      try {
        if (error) throw new Error('error: '+error)
        if (verifyRes.statusCode !== 200) throw new Error('non-200 status code: '+verifyRes.statusCode)
        if (!verifyResBody.startsWith('VERIFIED')) throw new Error('body not verified: '+verifyResBody)
        console.log('verified', verifyRes, verifyResBody)

        // verified it's a real paypal request; now notify playfab.
        // There is no need to validate the transaction type/etc. here,
        // playfab verifies it's a completed txn
        PlayFabServer.ExecuteCloudScript({
          PlayFabId: playfabId,
          FunctionName: 'paypalNotify',
          FunctionParameter: {tx},
        }, (error, playfabRes) => {
          try {
            if (error) throw new Error('error: '+error)
            console.log('paypalNotify success', playfabRes)
            return res.status(200).send("")
          }
          catch (e) {
            console.error('paypalNotify failed', e)
            return res.status(500).send("")
          }
        })
      }
      catch (e) {
        console.error('verifyReq failed', e)
        return res.status(500).send("")
      }
    })
  }
  catch (e) {
    console.error('IPN failed', e)
    return res.status(500).send("")
  }
})
