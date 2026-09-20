/** A build choice, never a URL/localStorage switch in the published game. */
export const IS_PILOT = import.meta.env.MODE === 'pilot';
export const DEV_TOOLS_ENABLED = !IS_PILOT;
export const SILVERPOND_ENABLED = !IS_PILOT;
