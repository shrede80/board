/**
 * Build version (UPDATE-1 أ10). The same value is compiled into the web app and the Worker;
 * the Worker sends it on every API response (X-App-Version) so an open tab can tell that a
 * newer version has been deployed. Tests and tools without the build define get 'dev'.
 */
declare const __APP_VERSION__: string | undefined;
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const VERSION_HEADER = 'X-App-Version';
