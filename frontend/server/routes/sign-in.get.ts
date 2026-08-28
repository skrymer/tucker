import { defineEventHandler, sendRedirect } from 'h3'

// Where Cloudflare Access hands a freshly signed-in User back to. Access returns
// them to the path they asked for, so this route exists to make that path Tucker
// rather than whatever the exit had to be to reach the network — see
// SIGN_IN_PATH in app/utils/exits.ts.
//
// Always `/`, never where the session died: nothing carries the route they were
// on across the challenge, and Today is the one page that is always worth
// landing on.
export default defineEventHandler((event) => sendRedirect(event, '/', 302))
