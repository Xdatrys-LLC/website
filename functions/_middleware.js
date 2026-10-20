// 301 www.xdatrys.com -> xdatrys.com so there is one canonical host (decided 2026-10-20).
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (url.hostname === 'www.xdatrys.com') {
    url.hostname = 'xdatrys.com';
    return Response.redirect(url.toString(), 301);
  }
  return context.next();
}
