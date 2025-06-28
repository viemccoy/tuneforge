// Test endpoint to debug environment bindings
export async function onRequestGet({ request, env, params, waitUntil, next, data }) {
  return new Response(JSON.stringify({
    message: 'Test endpoint',
    env: {
      hasEnv: !!env,
      keys: env ? Object.keys(env) : [],
      hasBINS: !!env?.BINS,
      hasCONVERSATIONS: !!env?.CONVERSATIONS,
      hasAUTH_PASSWORD: !!env?.AUTH_PASSWORD,
      bindings: {
        BINS: {
          exists: !!env?.BINS,
          type: env?.BINS ? typeof env.BINS : 'undefined',
          hasPut: env?.BINS ? typeof env.BINS.put === 'function' : false,
          hasList: env?.BINS ? typeof env.BINS.list === 'function' : false
        }
      }
    },
    context: {
      hasRequest: !!request,
      hasParams: !!params,
      hasWaitUntil: !!waitUntil,
      hasNext: !!next,
      hasData: !!data
    }
  }, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}