export interface Service {
  name: string;
  description: string;
  /** "exploring" renders dimmed with a small tag. Flip to "active" when the first real project ships. */
  status: 'active' | 'exploring';
}

export const services: Service[] = [
  { name: 'Design', description: 'Interfaces, flows and design systems for web and mobile products.', status: 'active' },
  { name: 'Development', description: 'Frontend builds in WordPress and Next.js, tuned for speed.', status: 'active' },
  { name: 'Motion design', description: 'Interface motion and short-form reels.', status: 'exploring' },
  { name: '3D', description: 'Real-time 3D for the web.', status: 'exploring' },
];

export const servicesNote = 'Design and development today. Motion and 3D are next.';
