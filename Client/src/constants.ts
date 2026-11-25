const NAMESPACE = 'i18n';

/** Where a visitor's pick is remembered, named after the header it ends up in. */
const CHOICE = 'accept-language';

const SOURCE = 'en-US';

/** Sent when the API ends the session, so the standalone shell starts a new one. */
const SESSION_ENDED = 'kicl:session-ended';

export { CHOICE, NAMESPACE, SESSION_ENDED, SOURCE };
