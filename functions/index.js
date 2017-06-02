var functions = require('firebase-functions');
var request = require('request');
var PlayFab = require('playfab-sdk/Scripts/PlayFab/PlayFab');
var PlayFabServer = require('playfab-sdk/Scripts/PlayFab/PlayFabServer');

// Start writing Firebase Functions
// https://firebase.google.com/functions/write-firebase-functions

exports.helloWorld = functions.https.onRequest((request, response) => {
  response.send("Hello from Firebase! playfab id: "+functions.config().playfab.id);
})

// https://developer.paypal.com/docs/classic/ipn/integration-guide/IPNImplementation/
const paypalEnvs = {
  sandbox: 'https://ipnpb.sandbox.paypal.com/cgi-bin/webscr',
  prod: 'https://ipnpb.paypal.com/cgi-bin/webscr',
}

exports.ipnVerificationPostBody = function ipnVerificationPostBody(body) {
  return 'cmd=_notify-validate&' + Object.keys(body).map(key =>
    encodeURIComponent(key)+'='+encodeURIComponent(body[key])).join('&')
}
exports.ipnHandler = functions.https.onRequest((req, res) => {
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
    const {playfabId} = JSON.parse(req.body.custom)
    if (!playfabId) throw new Error('req.body.custom.playfabId required')
    const tx = req.body.txn_id
    if (!tx) throw new Error('req.body.txn_id required')
    
    console.log({playfabId, tx}, req.body)

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

        // verified it's a real paypal request; now notify playfab
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

    // x in swarmsim-client, add `&custom={{encodeUrlComponent(JSON.stringify({playfabId}))}}` to hosted button urls (no hotfix possible)
    // * ipn server process:
    //   x decode custom vars (playfabId)
    //   x call paypal, verify the request per IPN docs.
    //   * call the playfab PDT cloudscript with {tx, playfabId}. we configured a server-secret with firebase, so auth as that player is unnecessary.
  }
  catch (e) {
    console.error('IPN failed', e)
    return res.status(500).send("")
  }
})
