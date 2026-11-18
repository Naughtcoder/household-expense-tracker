// Which app this is. The demo app is built from the same code with
// EXPO_PUBLIC_VARIANT=demo (see app.config.js): it runs on made-up data held
// on the phone (lib/demo) and never reaches the real database or website.
export const IS_DEMO = process.env.EXPO_PUBLIC_VARIANT === 'demo'

/** Who repays claimable spending, as the screens name it. */
export const EMPLOYER = IS_DEMO ? 'work' : 'Employer'
