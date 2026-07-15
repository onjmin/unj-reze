export const SITE_NAME = 'うんｊレゼ';

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.URL ? process.env.URL : '') ||
  'https://unj-reze.netlify.app'
).replace(/\/$/, '');
