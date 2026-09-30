/**
 * Site-wide facts. Anything in [brackets] is a placeholder waiting for a real value.
 * Keep copy here so components stay free of hard-coded text.
 */
export interface Social {
  label: string;
  /** Leave empty until the real URL is known; empty links are not rendered. */
  href: string;
}

const socials: Social[] = [
  { label: 'LinkedIn', href: '' },
  { label: 'GitHub', href: '' },
];

export const site = {
  name: 'Iman Irvansyah',
  firstName: 'Iman',
  lastName: 'Irvansyah',
  url: 'https://imanirvansyah.com',
  locale: 'en',
  jobTitle: 'UI/UX Designer',
  /** Used as the default meta description and in structured data. */
  description:
    'Iman Irvansyah is a UI/UX designer with a frontend development background, designing and building websites and product interfaces.',
  headline: ['I design what I know', 'can be built.'],
  intro:
    'I’m Iman, a UI/UX designer who spent years as a frontend developer. Everything here comes with two sides: the design, and how it gets built.',
  email: 'imanirvansyaah@gmail.com',
  socials,
  /** Words that scroll in the footer ticker, after the name. */
  tickerWords: ['Design', 'Development'],
};

export const liveSocials = (): Social[] => site.socials.filter((s) => s.href.length > 0);
