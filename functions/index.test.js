const index = require('./index')

describe('firebase paypal-ipn', () => {
  it('doesnt crash', () => {
  })
  it('builds the querystring', () => {
    expect(index.ipnVerificationPostBody({a:'b', c:'d'})).toBe('cmd=_notify-validate&a=b&c=d')
  })
})
