/**
 * Anonymous-first pseudonym system.
 *
 * On first visit we generate a stable device UUID + a friendly name
 * (like "Brave Jaguar") and stash both in localStorage. The name is
 * what's shown in the UI; the UUID is sent in the `x-device-id`
 * header for deduping confirmations and attributing reports.
 *
 * Users can reroll the name from the profile menu without losing
 * their device identity.
 */

const DEVICE_ID_KEY = 'gridpulse.device-id';
const DISPLAY_NAME_KEY = 'gridpulse.display-name';

const ADJECTIVES = [
  'Brave', 'Calm', 'Bright', 'Swift', 'Kind', 'Wise', 'Bold', 'Gentle',
  'Fierce', 'Quiet', 'Noble', 'Humble', 'Clever', 'Mighty', 'Lucky',
  'Curious', 'Jolly', 'Loyal', 'Keen', 'Eager',
];

const ANIMALS = [
  'Peacock', 'Elephant', 'Leopard', 'Monkey', 'Hornbill', 'Gecko',
  'Tortoise', 'Butterfly', 'Parrot', 'Squirrel', 'Mongoose', 'Loris',
  'Sparrow', 'Dolphin', 'Turtle', 'Kingfisher', 'Jackal', 'Bee',
  'Dragonfly', 'Flamingo',
];

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateDisplayName(): string {
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
}

export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'ssr';
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getDisplayName(): string {
  if (typeof window === 'undefined') return 'Anonymous';
  let name = localStorage.getItem(DISPLAY_NAME_KEY);
  if (!name) {
    name = generateDisplayName();
    localStorage.setItem(DISPLAY_NAME_KEY, name);
  }
  return name;
}

export function setDisplayName(name: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DISPLAY_NAME_KEY, name.trim() || generateDisplayName());
  window.dispatchEvent(new Event('profile-change'));
}

export function rerollDisplayName(): string {
  const name = generateDisplayName();
  setDisplayName(name);
  return name;
}
