const index = require('./index')

describe('firebase paypal-ipn', () => {
  it('doesnt crash', () => {
  })
  it('builds the querystring', () => {
    expect(index.ipnVerificationPostBody({a:'b', c:'d'})).toBe('cmd=_notify-validate&a=b&c=d')
  })
  it('skips txns', () => {
    expect(index.isTxnSkipped({paypal: {skipTxns: '["abc", "123"]'}}, "abc")).toBe(true)
    expect(index.isTxnSkipped({paypal: {skipTxns: '["abc", "123"]'}}, "123")).toBe(true)
    expect(index.isTxnSkipped({paypal: {skipTxns: '["abc", "123"]'}}, "xyz")).toBe(false)
  })
})
